/* Browser smoke check. Node 22+ and Chrome; no npm dependencies. */
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, '.impeccable/review/planner');
  const assetPreview = process.env.PLANNER_ASSET_PREVIEW === '1' || process.argv.includes('--asset-preview');
  const assetPrefix = '/api/assets/planner-preview/';
  const servedRoot = assetPreview ? path.join(root, 'connectors/planner') : root;
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp('/private/tmp/planner-chrome-');
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (assetPreview && !pathname.startsWith(assetPrefix)) { res.writeHead(404).end(); return; }
      const relativePath = assetPreview ? '/' + pathname.slice(assetPrefix.length) : pathname;
      const file = path.resolve(servedRoot, '.' + relativePath);
      if (!file.startsWith(servedRoot + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.woff2':'font/woff2' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--allow-file-access-from-files', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    let endpoint;
    for (let i=0;i<100;i++) {
      try { endpoint=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n'); break; }
      catch { await delay(100); }
    }
    if (!endpoint) throw Error('Chrome did not expose DevTools. Set CHROME_PATH if needed.');
    ws=new WebSocket('ws://127.0.0.1:'+endpoint[0]+endpoint[1]);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let seq=0;
    const pending=new Map(), errors=[];
    ws.onmessage=({data})=>{
      const msg=JSON.parse(data);
      if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);
    };
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const call=(method,params)=>send(method,params,sessionId);
    const evaluate=async expression=>{
      const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const waitFor=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;const message=await evaluate('document.querySelector("#orderError:not([hidden])")?.textContent');if(message)throw Error('Planner error: '+message);await delay(50);}throw Error('Timed out: '+expression);};
    const capture=async name=>{
      await delay(200);
      const {cssContentSize}=await call('Page.getLayoutMetrics');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1}});
      await fs.writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
      const sizes=await evaluate('({viewport:innerWidth, page:document.documentElement.scrollWidth, inter:document.fonts.check("500 14px Inter"),neuton:document.fonts.check("400 48px Neuton")})');
      assert.equal(sizes.page,sizes.viewport,'No page-level horizontal overflow');assert.ok(sizes.inter&&sizes.neuton,'Self-hosted fonts loaded');
      console.log(name,sizes);
    };
    await call('Page.enable');await call('Runtime.enable');
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.usedWorker=false; const OriginalWorker=window.Worker; window.Worker=class extends OriginalWorker {constructor(...args){super(...args);window.usedWorker=true;}};`});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const page=assetPreview ? assetPrefix+'index.html' : '/connectors/planner/index.html';
    await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+page});
    await waitFor('document.readyState === "complete" && !!document.querySelector("#presets button")');
    const click = async selector => {
      await evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); if (!element || !element.getClientRects().length || element.disabled) throw Error('Control unavailable: '+${JSON.stringify(selector)}); element.click(); })()`);
    };
    const count = async (type, size, value) => {
      await evaluate(`(() => {const input=document.querySelector('#quantity-'+${JSON.stringify(type)}+'-'+${JSON.stringify(size)}); input.value=${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    };
    const expectStep = async n => {
      assert.equal(await evaluate(`!document.querySelector('#step-${n}').hidden`),true,`Step ${n} visible`);
      assert.equal(await evaluate('document.querySelectorAll(".wizard-step:not([hidden])").length'),1,'Only one step is shown');
      assert.equal(await evaluate('document.querySelector("[aria-current=step]").dataset.step'),String(n));
    };
    const select = async type => click(`#presets [data-type="${type}"]`);
    const configureShirts = async () => {
      await select('playera'); await click('#wizardNext'); await expectStep(2);
      await count('playera','M',2); await count('playera','L',1); await click('#wizardNext'); await expectStep(3);
    };
    await evaluate('document.fonts.ready'); await expectStep(1);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'At least one garment must be selected');
    assert.equal(await evaluate('document.querySelectorAll("#presets [aria-pressed=true]").length'),0,'Starts with no garment selected');
    assert.equal(await evaluate('document.querySelectorAll("[data-step]")[2].disabled'),true,'Future steps cannot be skipped');
    assert.equal(await evaluate('document.querySelector("#garmentCount").textContent'),'0 prendas','Wizard starts with an empty order');
    await capture('desktop-empty');
    await select('playera'); await select('pantalon'); await select('chaqueta');
    assert.equal(await evaluate('document.querySelectorAll("#presets [aria-pressed=true]").length'),3,'All three garment types can be selected together');
    assert.match(await evaluate('document.querySelector("#presets").textContent'),/Chumpas/);
    await capture('desktop-selection');
    await click('#wizardNext'); await expectStep(2);
    assert.equal(await evaluate('document.querySelectorAll("#sizes input").length'),12,'All selected garments have independent S–XL controls');
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Empty quantities block progression');
    await count('playera','M',1.5);
    await count('pantalon','M',1);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Editing another garment cannot hide an invalid field');
    assert.equal(await evaluate('document.querySelector("#quantity-playera-M").value'),'1.5','Invalid input remains available to correct');
    await count('playera','M',2); await count('playera','L',1);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Every selected type needs a quantity');
    await count('chaqueta','XL',1);
    await count('playera','M',12);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'The 12 garment limit applies across all groups');
    await count('playera','M',2);
    await click('[data-garment=chaqueta] summary');
    assert.equal(await evaluate('document.querySelector("[data-garment=chaqueta] details").open'),true,'Each garment has a pattern preview');
    await click('[data-garment=chaqueta] summary');
    await capture('desktop-sizes');
    await click('#wizardNext'); await expectStep(3);
    assert.match(await evaluate('document.querySelector("#pieceCount").textContent'),/34/,'All selected quantities reach the combined order');
    await capture('desktop-review');
    await click('#wizardBack'); await expectStep(2);
    assert.equal(await evaluate('document.querySelector("#quantity-playera-M").value'),'2','Back preserves playera counts');
    assert.equal(await evaluate('document.querySelector("#quantity-pantalon-M").value'),'1','Back preserves pantalon counts');
    assert.equal(await evaluate('document.querySelector("#quantity-chaqueta-XL").value'),'1','Back preserves chumpa counts');
    await click('#wizardNext'); await click('#arrange'); await expectStep(4);
    await click('#wizardBack'); await expectStep(3); await delay(250);
    assert.equal(await evaluate('document.querySelector("#result").hidden'),true,'Leaving a running calculation cancels the result');
    await click('#arrange'); await waitFor('!document.querySelector("#result").hidden'); await delay(700);
    assert.equal(await evaluate('window.usedWorker'),true,'HTTP uses a worker'); await capture('desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await delay(150); await capture('mobile');
    await click('#wizardBack'); await click('[data-edit=pantalon]'); await expectStep(2);
    assert.equal(await evaluate('document.querySelectorAll("#sizes fieldset").length'),3,'Editing retains all garment groups');
    await count('playera','M',13); await count('pantalon','M',2);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Invalid fields remain blocking across groups');
    assert.equal(await evaluate('document.querySelector("#result").hidden'),true,'Quantity edits clear stale purchases');
    assert.equal(await evaluate('document.querySelectorAll("[data-step]")[2].disabled'),true,'Step links cannot bypass invalid input');
    await count('playera','M',2); await count('pantalon','M',1); await capture('mobile-sizes');
    await click('#changeGarment'); await select('pantalon'); await capture('mobile-garment');
    await click('#wizardNext');
    assert.equal(await evaluate('document.querySelectorAll("#sizes input").length'),8,'Deselecting removes its size group');
    assert.equal(await evaluate('document.querySelector("#quantity-playera-M").value'),'2','Deselecting preserves other garment quantities');
    await click('#wizardNext');
    assert.match(await evaluate('document.querySelector("#pieceCount").textContent'),/27/,'Deselected garments are excluded from the order');
    assert.equal(await evaluate('!!document.querySelector("[data-edit=pantalon]")'),false);
    await click('#addGarment'); await select('pantalon'); await click('#wizardNext');
    assert.equal(await evaluate('document.querySelector("#quantity-pantalon-M").value'),'0','Deselecting cleared the removed quantities');
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Reselected garments need quantities again');
    await count('pantalon','M',1); await click('#wizardNext'); await capture('mobile-review');
    assert.match(await evaluate('document.querySelector("#pieceCount").textContent'),/34/);
    await click('#arrange'); await waitFor('!document.querySelector("#result").hidden');
    await click('#wizardBack'); await click('#clear');
    assert.equal(await evaluate('document.querySelector("#arrange").disabled'),true,'Empty review cannot calculate');
    assert.equal(await evaluate('document.querySelector("#garmentCount").textContent'),'0 prendas');
    await click('#addGarment'); await expectStep(1);
    await call('Page.navigate',{url:'file://'+path.join(root,'connectors/planner/index.html')});
    await waitFor('document.readyState === "complete" && !!document.querySelector("#presets button")');
    await configureShirts(); await click('#arrange'); await waitFor('!document.querySelector("#result").hidden');
    assert.equal(await evaluate('window.usedWorker'),false,'Direct-file mode uses incremental fallback');
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('#replay'); await delay(100);
    assert.equal(await evaluate('document.querySelector("#result").hidden'),false);
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
    await evaluate('document.querySelector("#download").click()');
    await waitFor('!!document.querySelector("#download")');await delay(500);
    assert.match(await fs.readFile(path.join(out,'telatetris-tendido.svg'),'utf8'),/Patrones ilustrativos/);
    assert.equal(errors.length,0,JSON.stringify(errors));
    await click('#newOrder'); await expectStep(1);
    assert.equal(await evaluate('document.querySelector("#garmentCount").textContent'),'0 prendas','New order resets all quantities');
    assert.equal(await evaluate('document.querySelectorAll("#presets [aria-pressed=true]").length'),0,'New order clears multi-selection');
    assert.equal(await evaluate('!!customElements.get("ui-toggle-group") && !!customElements.get("ui-number-input") && !!customElements.get("ui-button")'),true,'The actual UI SDK components are registered');
    await select('playera'); await click('#wizardNext'); await count('playera','M',2);
    const agentEntries=await evaluate('plannerAgent.snapshot().filter(entry=>!entry.offPage).map(({label,component,actions})=>({label,component,actions}))');
    assert.ok(agentEntries.every(entry=>entry.label),'Every exposed SDK control has an accessible name');
    assert.ok(agentEntries.some(entry=>entry.label==='Playeras M'),'The agent bridge exposes named quantity controls');
    const changed=await evaluate('plannerAgent.act({steps:[{ref:"Playeras M",action:"setValue",args:[3]}]})');
    assert.equal(changed.ok,true,JSON.stringify(changed));
    assert.equal(await evaluate('document.querySelector("#quantity-playera-M").value'),'3');
    await click('#materialMode [value=wood] button'); await expectStep(1);
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    for(const type of ['recto','repisa','liston','inglete'])await select(type);
    await capture('wood-desktop-selection'); await click('#wizardNext'); await expectStep(2);
    assert.equal(await evaluate('document.querySelectorAll("#stockPanel input").length'),4,'Stock length, width, thickness and kerf are editable');
    const stockValue=async(key,value)=>evaluate(`(() => {const input=document.querySelector('#stock-'+${JSON.stringify(key)});input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await stockValue('width',10);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Parts wider than the stock are rejected');
    await stockValue('width',30);
    await count('inglete','length',10);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'An impossible miter geometry is rejected');
    await count('inglete','length',60);
    await count('repisa','quantity',4);await count('liston','quantity',4);await count('inglete','quantity',2);
    await capture('wood-desktop-sizes');await click('#wizardNext');await capture('wood-desktop-review');
    await click('#arrange');await waitFor('!document.querySelector("#result").hidden');await delay(700);
    assert.match(await evaluate('document.querySelector("#purchaseUnit").textContent'),/tabl/);
    const woodResult=await evaluate('({count:Number(document.querySelector("#buyYards").textContent),diagrams:document.querySelectorAll(".wood-board").length})');
    assert.equal(await evaluate('document.querySelector("#stock-thickness").value'),'1.8','Stock thickness is entered in centimeters');
    assert.ok(woodResult.count>=1);assert.equal(woodResult.count,woodResult.diagrams,'Every purchased plank has a diagram');
    await capture('wood-desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await delay(150);await capture('wood-mobile');
    const diagram=await evaluate('(() => {const scroll=document.querySelector(".wood-diagram-scroll"), svg=scroll.querySelector("svg"), labels=[...svg.querySelectorAll(".wood-piece text")];return {width:svg.getBoundingClientRect().width,viewport:scroll.clientWidth,labels:labels.length,parts:svg.querySelectorAll(".wood-piece").length,font:parseFloat(getComputedStyle(labels[0]).fontSize)};})()');
    assert.ok(diagram.width>diagram.viewport,'Mobile wood diagrams retain their readable scale in a horizontal scroller');
    assert.equal(diagram.labels,diagram.parts,'Every displayed part has its ID');assert.ok(diagram.font>=12,'Part numbers stay readable');
    await click('#download');await delay(500);
    assert.match(await fs.readFile(path.join(out,'arrange-tablones.svg'),'utf8'),/Tablón 1/);
    await click('#wizardBack');await click('#wizardBack');await capture('wood-mobile-sizes');
    await click('#materialMode [value=fabric] button');await click('#wizardNext');
    assert.equal(await evaluate('document.querySelector("#quantity-playera-M").value'),'3','Material projects preserve their independent drafts');
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: textile and woodworking journeys, real UI SDK controls and agent bridge, units, stock/kerf validation, diagrams, SVG and responsive preview packaging.');
  } finally {
    if(ws)ws.close();chrome.kill();server.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
