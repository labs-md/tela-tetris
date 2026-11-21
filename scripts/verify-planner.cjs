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
    await waitFor('document.readyState === "complete" && !!document.querySelector("#sizes input")');
    const click = async selector => {
      await evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); if (!element || !element.getClientRects().length || element.disabled) throw Error('Control unavailable: '+${JSON.stringify(selector)}); element.click(); })()`);
    };
    const count = async (size, value) => {
      await evaluate(`(() => {const input=document.querySelector('#quantity-'+${JSON.stringify(size)}); input.value=${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input'));})()`);
    };
    const expectStep = async n => {
      assert.equal(await evaluate(`!document.querySelector('#step-${n}').hidden`),true,`Step ${n} visible`);
      assert.equal(await evaluate('document.querySelectorAll(".wizard-step:not([hidden])").length'),1,'Only one step is shown');
      assert.equal(await evaluate('document.querySelector("[aria-current=step]").dataset.step'),String(n));
    };
    const configureShirts = async () => {
      await click('#wizardNext'); await expectStep(2);
      await count('M',2); await count('L',1); await click('#wizardNext'); await expectStep(3);
    };
    await evaluate('document.fonts.ready'); await expectStep(1); await capture('desktop-empty');
    assert.equal(await evaluate('document.querySelectorAll("[data-step]")[2].disabled'),true,'Future steps cannot be skipped');
    assert.equal(await evaluate('document.querySelector("#garmentCount").textContent'),'0 prendas','Wizard starts with an empty order');
    await click('#wizardNext'); await expectStep(2);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Empty quantities block progression');
    await count('M',1.5);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Fractional quantities block progression');
    await count('M',2); await count('L',1); await capture('desktop-sizes');
    await click('#wizardNext'); await expectStep(3); await capture('desktop-review');
    await click('#wizardBack'); await expectStep(2);
    assert.equal(await evaluate('document.querySelector("#quantity-M").value'),'2','Back preserves counts');
    await click('#wizardNext'); await click('#arrange'); await expectStep(4);
    await click('#wizardBack'); await expectStep(3);
    await delay(250);
    assert.equal(await evaluate('document.querySelector("#result").hidden'),true,'Leaving a running calculation cancels the result');
    await click('#arrange');
    await waitFor('!document.querySelector("#result").hidden'); await delay(700); await expectStep(4);
    assert.equal(await evaluate('window.usedWorker'),true,'HTTP uses a worker');
    await capture('desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await delay(150); await capture('mobile');
    await click('#wizardBack'); await click('[data-edit=playera]'); await expectStep(2);
    await count('M',13);
    assert.equal(await evaluate('document.querySelector("#wizardNext").disabled'),true,'Oversized counts block progression');
    assert.equal(await evaluate('document.querySelector("#result").hidden'),true,'Order edits clear stale purchases');
    assert.equal(await evaluate('document.querySelectorAll("[data-step]")[2].disabled'),true,'Step links cannot bypass invalid input');
    await count('M',2); await click('#wizardNext');
    await click('#addGarment'); await expectStep(1); await capture('mobile-garment');
    await click('#presets button:nth-child(2)'); await click('#wizardNext'); await count('M',1); await capture('mobile-sizes');
    await click('#wizardNext'); await click('#addGarment');
    await click('#presets button:nth-child(3)'); await click('#wizardNext'); await count('XL',1); await click('#wizardNext');
    assert.match(await evaluate('document.querySelector("#pieceCount").textContent'),/34/,'Mixed order is preserved');
    await capture('mobile-review');
    await click('#arrange'); await waitFor('!document.querySelector("#result").hidden');
    await click('#wizardBack'); await click('#clear');
    assert.equal(await evaluate('document.querySelector("#arrange").disabled'),true,'Empty review cannot calculate');
    assert.equal(await evaluate('document.querySelector("#garmentCount").textContent'),'0 prendas');
    await click('#addGarment'); await expectStep(1);
    await call('Page.navigate',{url:'file://'+path.join(root,'connectors/planner/index.html')});
    await waitFor('document.readyState === "complete" && !!document.querySelector("#sizes input")');
    await configureShirts(); await click('#arrange');
    await waitFor('!document.querySelector("#result").hidden');
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
    console.log('PASS: four-step wizard, step validation, back/edit state, mixed orders, calculation cancellation, HTTP/file modes, SVG, new order, desktop/mobile overflow and browser errors.');
  } finally {
    if(ws)ws.close();chrome.kill();server.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
