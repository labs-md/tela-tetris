(function () {
  'use strict';
  const { Arrange, Presets } = window;
  const $ = (id) => document.getElementById(id);
  const order = { playera:{ S:0, M:0, L:0, XL:0 }, pantalon:{ S:0,M:0,L:0,XL:0 }, chaqueta:{ S:0,M:0,L:0,XL:0 } };
  let step = 1, furthestStep = 1, busy = false, quantityError = false;
  let selected = 'playera', worker = null, generation = 0, result = null, job = null;
  let animation = null, current = new Map(), target = null, animationStart = 0, animationFrom = new Map();
  const canvas = $('roll'), ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const number = (value, digits = 2) => value.toLocaleString('es-GT', {minimumFractionDigits:digits,maximumFractionDigits:digits});
  const icons = {
    playera:'M18 5h8c2 8 10 8 12 0h8l15 13-9 14-9-6v33H21V26l-9 6-9-14Z',
    pantalon:'M15 4h35l7 55H38l-6-34-6 34H7Zm0 7h35M32 5v15',
    chaqueta:'M21 5 12 10 2 43l12 5 9-22v34h18V26l9 22 12-5-10-33-9-5-11 8Zm11 8v47M23 5l9 8-8 9m17-17-9 8 8 9',
  };
  function totalGarments() { return Object.values(order).reduce((sum, counts) => sum + Object.values(counts).reduce((a,b) => a+b, 0), 0); }
  function expandedItems(request) { return request.items.flatMap((item) => Array.from({length:item.quantity}, () => item)); }
  function error(message) {
    $('orderError').textContent = message;
    $('orderError').hidden = !message;
    refreshNavigation();
  }
  function selectedCount() { return Object.values(order[selected]).reduce((sum, n) => sum + n, 0); }
  const stepCopy = {
    1: ['¿Qué prenda vas a confeccionar?', 'Elige un modelo para empezar. Después podrás combinar más prendas en tu pedido.'],
    2: ['Define las tallas y cantidades', 'Agrega la cantidad que necesitas de la prenda seleccionada.'],
    3: ['Revisa tu pedido', 'Confirma las prendas y las condiciones antes de calcular la tela.'],
    4: ['Tu plan de tela está listo', 'Revisa el acomodo de las piezas y las yardas que necesitas comprar.'],
  };
  function refreshNavigation() {
    $('wizardBack').hidden = step === 1;
    $('wizardBack').querySelector('span').textContent = step === 4 ? 'Editar pedido' : 'Atrás';
    $('wizardNext').hidden = step > 2;
    $('wizardNext').querySelector('span').textContent = step === 1 ? 'Elegir tallas' : 'Revisar pedido';
    $('wizardNext').disabled = step === 2 && (selectedCount() === 0 || quantityError);
    $('quantityHint').textContent = selectedCount() === 0
      ? 'Agrega al menos una prenda para continuar. El pedido puede incluir hasta 12 prendas en total.'
      : `${selectedCount()} ${selectedCount() === 1 ? 'prenda' : 'prendas'} de este modelo. Puedes combinar tallas, hasta 12 prendas en todo el pedido.`;
    $('arrange').hidden = step !== 3;
    $('arrange').disabled = busy || quantityError || totalGarments() === 0;
    $('newOrder').hidden = step !== 4;
    $('stepCounter').textContent = `Paso ${step} de 4`;
    document.querySelectorAll('[data-step]').forEach(button => {
      const destination = Number(button.dataset.step);
      button.disabled = destination > furthestStep || (destination === 4 && !result && !busy) || (destination === 3 && (totalGarments() === 0 || quantityError));
      button.classList.toggle('completed', destination < step);
      if (destination === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('stepTitle').textContent = busy && step === 4 ? 'Estamos acomodando tus piezas' : stepCopy[step][0];
    $('stepDescription').textContent = busy && step === 4 ? 'Observa cómo se forma el tendido. El cálculo estará listo en unos segundos.' : stepCopy[step][1];
    $('newOrder').disabled = busy;
    $('step-4').setAttribute('aria-busy', String(busy));
  }
  function goToStep(destination, focus = true) {
    if (destination === 4 && !result && !busy) return;
    if (destination === 3 && (!totalGarments() || quantityError)) return;
    if (destination < 4 && busy) invalidate();
    if (destination !== 2) { quantityError = false; $('orderError').hidden = true; }
    step = destination;
    furthestStep = Math.max(furthestStep, step);
    for (let n = 1; n <= 4; n++) $(`step-${n}`).hidden = n !== step;
    if (step === 2) renderSizes();
    refreshNavigation();
    if (focus) $('stepTitle').focus({ preventScroll: true });
    requestAnimationFrame(() => { draw(); if (focus) $('stepTitle').scrollIntoView({ behavior: 'instant', block: 'start' }); });
  }
  function editGarment(type) {
    selected = type;
    quantityError = false;
    renderPresets(); renderSizes(); renderBank();
    goToStep(2);
  }
  function renderPresets() {
    $('presets').innerHTML = '';
    Object.entries(Presets.PRESETS).forEach(([key,preset]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'preset'; button.setAttribute('aria-pressed', String(selected === key));
      button.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="${icons[key]}"/></svg><span><strong>${preset.plural}</strong><small>${preset.description}</small></span>`;
      button.onclick = () => { selected = key; quantityError = false; error(''); renderPresets(); renderSizes(); renderBank(); };
      $('presets').appendChild(button);
    });
  }
  function renderSizes() {
    $('selectedName').textContent = Presets.PRESETS[selected].name;
    $('sizes').innerHTML = '';
    Object.keys(Presets.sizes).forEach((size) => {
      const row = document.createElement('div'); row.className = 'size-row';
      const id = `quantity-${size}`;
      row.innerHTML = `<label for="${id}" class="size-name">${size}</label><div class="stepper"><button type="button" data-change="-1" aria-label="Quitar ${Presets.PRESETS[selected].name.toLowerCase()} talla ${size}">−</button><input id="${id}" type="number" inputmode="numeric" min="0" max="12" step="1" value="${order[selected][size]}" aria-label="Cantidad de ${Presets.PRESETS[selected].plural.toLowerCase()} talla ${size}"><button type="button" data-change="1" aria-label="Agregar ${Presets.PRESETS[selected].name.toLowerCase()} talla ${size}">+</button></div>`;
      const input = row.querySelector('input');
      row.querySelectorAll('button').forEach((button) => { button.onclick = () => changeQuantity(size, order[selected][size] + Number(button.dataset.change)); });
      input.oninput = () => {
        if (input.value === '' || !input.validity.valid || !Number.isInteger(input.valueAsNumber)) {
          quantityError = true; invalidate(); error('Usa una cantidad entera de 0 a 12.'); return;
        }
        changeQuantity(size, input.valueAsNumber, false);
      };
      $('sizes').appendChild(row);
    });
    updateButtons();
  }
  function updateButtons() {
    $('sizes').querySelectorAll('.size-row').forEach((row, i) => {
      const size = Object.keys(Presets.sizes)[i];
      row.querySelector('[data-change="-1"]').disabled = order[selected][size] === 0;
      row.querySelector('[data-change="1"]').disabled = totalGarments() >= Presets.MAX_GARMENTS;
    });
  }
  function changeQuantity(size, quantity, render = true) {
    const nextTotal = totalGarments() - order[selected][size] + quantity;
    if (!Number.isInteger(quantity) || quantity < 0 || nextTotal > Presets.MAX_GARMENTS) {
      quantityError = true; invalidate(); error('Puedes calcular hasta 12 prendas. Reduce una cantidad para continuar.'); return;
    }
    quantityError = false;
    order[selected][size] = quantity;
    invalidate(); error(''); renderSummary();
    if (render) renderSizes(); else updateButtons();
  }
  function renderSummary() {
    $('orderLines').innerHTML = '';
    let pieces = 0;
    Object.entries(order).forEach(([key,counts]) => {
      const count = Object.values(counts).reduce((sum, n) => sum+n, 0);
      if (!count) return;
      const preset = Presets.PRESETS[key];
      pieces += count * preset.pieces.reduce((sum,p) => sum+p.quantity,0);
      const row = document.createElement('li');
      const sizes = Object.entries(counts).filter(([,n]) => n).map(([s,n]) => `${s} × ${n}`).join(' · ');
      row.innerHTML = `<div><strong>${preset.plural}</strong><span>${sizes}</span></div><span>× ${count}</span><button type="button" class="text-button" data-edit="${key}" aria-label="Editar ${preset.plural.toLowerCase()}">Editar</button>`;
      row.querySelector('button').onclick = () => editGarment(key);
      $('orderLines').appendChild(row);
    });
    const total = totalGarments();
    if (!total) { const row = document.createElement('li'); row.textContent = 'Agrega prendas para empezar.'; $('orderLines').appendChild(row); }
    $('garmentCount').textContent = `${total} ${total === 1 ? 'prenda' : 'prendas'}`;
    $('pieceCount').textContent = `${pieces} piezas`;
    $('arrange').disabled = total === 0;
    $('clear').disabled = total === 0;
    refreshNavigation();
  }
  function renderBank() {
    const preset = Presets.PRESETS[selected];
    $('fabricType').textContent = preset.fabric;
    $('pieceBank').innerHTML = '';
    preset.pieces.forEach((piece) => {
      const maxX = Math.max(...piece.poly.map(p => p[0])), maxY = Math.max(...piece.poly.map(p => p[1]));
      const el = document.createElement('div'); el.className = 'piece-sample';
      el.innerHTML = `<svg viewBox="-3 -3 ${maxX+6} ${maxY+6}" role="img" aria-label="${piece.name}"><polygon points="${piece.poly.map(p => p.join(',')).join(' ')}" fill="${piece.color}" fill-opacity="0.55" stroke="#69715d" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><p>${piece.name} × ${piece.quantity}</p><small>${number(maxX,0)} × ${number(maxY,0)} cm · M</small>`;
      $('pieceBank').appendChild(el);
    });
  }
  function invalidate() {
    generation++;
    if (worker) { worker.terminate(); worker = null; }
    busy = false; result = null; target = null; current.clear();
    furthestStep = Math.min(furthestStep, 3);
    if (animation) cancelAnimationFrame(animation);
    animation = null;
    $('result').hidden = true; $('emptyState').hidden = false; $('replay').disabled = true;
    $('status').textContent = 'Pedido por calcular'; $('status').className = 'status';
    $('stageDescription').textContent = 'Vista del tendido sobre un rollo de 150 cm de ancho.';
    $('boardCaption').textContent = 'Medidas en centímetros · 1 cm entre piezas';
    canvas.setAttribute('aria-label', 'Vista previa sin calcular. Rollo de tela de 150 centímetros de ancho.');
    $('arrange').querySelector('span').textContent = 'Calcular mi tela';
    refreshNavigation(); draw();
  }
  function setLayout(report, replay = false) {
    if (report.status !== 'ok' || !report.check.ok) throw new Error('No pudimos completar el tendido. Reduce el pedido e intenta otra vez.');
    const same = target && target.length === report.length && target.placements.every((p,i) => p.x === report.placements[i]?.x && p.y === report.placements[i]?.y && p.rotation === report.placements[i]?.rotation);
    if (same && !replay) return;
    animationFrom = replay ? new Map() : new Map(current);
    target = report;
    animationStart = performance.now();
    $('emptyState').hidden = true;
    if (animation) cancelAnimationFrame(animation);
    animation = requestAnimationFrame(animate);
  }
  function animate(time) {
    animation = null;
    if (!target) return;
    const t = reduceMotion.matches ? 1 : Math.min(1, (time-animationStart)/650);
    current = new Map(target.placements.map((p) => {
      const start = animationFrom.get(p.item) || p.polygon.map(([x,y]) => [x, y+180]);
      const stagger = animationFrom.size ? 0 : (p.item % 6) * .035;
      const local = Math.max(0,Math.min(1,(t-stagger)/(1-stagger)));
      const ease = 1 - Math.pow(1-local,4);
      return [p.item, p.polygon.map(([x,y],i) => [start[i][0]+(x-start[i][0])*ease,start[i][1]+(y-start[i][1])*ease])];
    }));
    draw();
    if (t < 1) animation = requestAnimationFrame(animate);
  }
  function draw() {
    if (!$('rollFrame').clientHeight || !$('rollFrame').parentElement.clientWidth) return;
    const available = Math.max(230, $('rollFrame').parentElement.clientWidth - (innerWidth <= 760 ? 16 : 32));
    const length = target ? target.length : 280;
    const minScale = innerWidth <= 760 ? 1.3 : 1.5;
    const height = $('rollFrame').clientHeight;
    const scale = Math.min((height-88)/150, Math.max(minScale,(available-94)/length));
    const width = Math.max(available, Math.ceil(length*scale+94));
    $('rollFrame').style.width = `${width}px`;
    const dpr = Math.min(devicePixelRatio || 1,2);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
    if (!target) return;
    const clothWidth=length*scale, clothHeight=150*scale;
    const left=Math.max(45,(width-clothWidth)/2), top=43;
    ctx.fillStyle='#ffffff';ctx.fillRect(left,top,clothWidth,clothHeight);
    ctx.strokeStyle='#e1e5db';ctx.lineWidth=.5;
    ctx.beginPath();
    for(let x=0;x<=length;x+=10){ctx.moveTo(left+x*scale,top);ctx.lineTo(left+x*scale,top+clothHeight);}
    for(let y=0;y<=150;y+=10){ctx.moveTo(left,top+y*scale);ctx.lineTo(left+clothWidth,top+y*scale);}
    ctx.stroke();ctx.font='12px Inter,sans-serif';ctx.fillStyle='#60655c';ctx.strokeStyle='#9aa38f';ctx.lineWidth=1;
    ctx.textAlign='center';
    const interval = length>600 ? 100 : 50;
    for(let x=0;x<=length;x+=interval){const px=left+x*scale;ctx.fillText(String(x),px,top-14);ctx.beginPath();ctx.moveTo(px,top-7);ctx.lineTo(px,top-2);ctx.stroke();}
    ctx.textAlign='right';
    for(let y=0;y<=150;y+=50)ctx.fillText(String(y),left-10,top+y*scale+3);
    ctx.save();ctx.translate(Math.max(13,left-35),top+clothHeight/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.font='12px Inter,sans-serif';ctx.fillText('150 cm de ancho',0,0);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(left,top,clothWidth,clothHeight);ctx.clip();
    if(target && job){
      const items=expandedItems(job);
      target.placements.forEach((p) => {
        const poly=current.get(p.item) || p.polygon, data=items[p.item].data;
        ctx.beginPath();poly.forEach(([x,y],i) => i ? ctx.lineTo(left+x*scale,top+y*scale) : ctx.moveTo(left+x*scale,top+y*scale));ctx.closePath();
        ctx.fillStyle=data.color;ctx.globalAlpha=.82;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#69715d';ctx.lineWidth=1;ctx.stroke();
        const minX=Math.min(...poly.map(p=>p[0])),maxX=Math.max(...poly.map(p=>p[0])),minY=Math.min(...poly.map(p=>p[1])),maxY=Math.max(...poly.map(p=>p[1]));
        ctx.font='500 12px Inter,sans-serif';
        const name=data.name.split(' ')[0];
        if((maxX-minX)*scale>ctx.measureText(name).width+16 && (maxY-minY)*scale>34){
          const cx=left+(minX+maxX)/2*scale,cy=top+(minY+maxY)/2*scale;
          ctx.fillStyle='#1c1c1b';ctx.textAlign='center';
          ctx.fillText(name,cx,cy-3);ctx.fillText(data.size,cx,cy+12);
        }
      });
    }
    ctx.restore();
    ctx.strokeStyle='#9aa38f';ctx.lineWidth=1;ctx.strokeRect(left,top,clothWidth,clothHeight);
    if(target){
      const end=left+clothWidth;ctx.strokeStyle='#f95300';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(end,top-5);ctx.lineTo(end,top+clothHeight+8);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#a93600';ctx.textAlign='right';ctx.font='500 12px Inter,sans-serif';ctx.fillText(`${number(length,0)} cm de largo`,end,top+clothHeight+26);
    }
  }
  function showReport(report, done) {
    setLayout(report);
    $('boardCaption').textContent = `${report.placements.length} piezas · hilo en sentido del largo · desliza para recorrer`;
    if(!done){$('status').textContent='Buscando un mejor acomodo…';return;}
    result = report; busy = false;
    if(worker){worker.terminate();worker=null;}
    const purchase=Presets.purchase(report.length);
    $('buyYards').textContent=number(purchase.buyYards);
    $('layoutLength').textContent=`${number(report.length,0)} cm / ${number(purchase.exactYards)} yd`;
    $('utilization').textContent=`${number(report.utilization*100,1)} %`;
    $('result').hidden=false;$('replay').disabled=false;
    $('status').textContent='Tendido listo';$('status').className='status complete';
    $('stageDescription').textContent='Estas son las piezas de tu pedido y el largo que ocupan.';
    $('arrange').disabled=false;$('arrange').querySelector('span').textContent='Volver a calcular';
    canvas.setAttribute('aria-label',`Tendido de ${report.placements.length} piezas en ${report.length} centímetros de largo por 150 centímetros de ancho. Compra ${number(purchase.buyYards)} yardas.`);
    refreshNavigation();
    $('announcement').textContent=`Tendido listo. Compra ${number(purchase.buyYards)} yardas de tela de 150 centímetros de ancho.`;
  }
  function fail(message, token) {
    if(token!==generation)return;
    invalidate(); goToStep(3); renderSummary(); error(message || 'No pudimos calcular el tendido. Intenta con un pedido más pequeño.');
  }
  function fallback(request, token) {
    let session;
    const tick=()=>{
      if(token!==generation)return;
      try {if(!session)session=Arrange.session(request);session.step(0);showReport(session.result(),session.done);if(!session.done)setTimeout(tick,16);}
      catch(e){fail(e.message,token);}
    };
    setTimeout(tick,30);
  }
  function calculate() {
    let request;
    try {request=Presets.request(order);}catch(e){error(e.message);return;}
    if (quantityError || step !== 3) return;
    invalidate(); error(''); job=request; busy = true; goToStep(4);
    const token=generation;
    $('arrange').disabled=true;$('arrange').querySelector('span').textContent='Acomodando las piezas…';
    $('status').textContent='Preparando el tendido…';$('status').className='status busy';
    $('stageDescription').textContent='Las piezas se acomodan conservando la dirección del hilo.';
    $('announcement').textContent='Calculando el largo de tela para tu pedido.';
    if(location.protocol==='file:' || typeof Worker==='undefined'){fallback(request,token);return;}
    try {
      worker=new Worker('planner-worker.js');
      worker.onmessage=({data})=>{if(token!==generation)return;if(data.error){fail(data.error,token);return;}try{showReport(data.result,data.done);}catch(e){fail(e.message,token);}};
      worker.onerror=()=>{if(token!==generation)return;worker.terminate();worker=null;fallback(request,token);};
      worker.postMessage(request);
    }catch{if(worker)worker.terminate();worker=null;fallback(request,token);}
  }
  function download() {
    if(!result)return;
    const margin=18,width=result.length+margin*2,height=150+margin*2;
    const items=expandedItems(job);
    const shapes=result.placements.map(p=>`<polygon points="${p.polygon.map(([x,y])=>`${x+margin},${y+margin}`).join(' ')}" fill="${items[p.item].data.color}" stroke="#1c1c1b" stroke-width="0.5"><title>${Presets.PRESETS[items[p.item].data.type].name} · ${items[p.item].data.name} · ${items[p.item].data.size}</title></polygon>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}cm" height="${height}cm" viewBox="0 0 ${width} ${height}"><title>TelaTetris · ${number(Presets.purchase(result.length).buyYards)} yardas · 150 cm de ancho · patrones ilustrativos</title><rect width="100%" height="100%" fill="white"/><text x="${margin}" y="10" font-family="monospace" font-size="4">TelaTetris · ${result.length} × 150 cm · Compra ${number(Presets.purchase(result.length).buyYards)} yd · Patrones ilustrativos</text><rect x="${margin}" y="${margin}" width="${result.length}" height="150" fill="#f0f0e6" stroke="#1c1c1b" stroke-width="0.5"/>${shapes}<text x="${margin}" y="${height-5}" font-family="monospace" font-size="3">1 cm entre piezas. Sin margen por encogimiento ni costuras adicionales. Verifica patrones reales antes de cortar.</text></svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const link=document.createElement('a');link.href=url;link.download='telatetris-tendido.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('wizardNext').onclick = () => {
    if (step === 1) goToStep(2);
    else if (step === 2 && selectedCount() > 0 && !quantityError) goToStep(3);
  };
  $('wizardBack').onclick = () => goToStep(step === 4 ? 3 : step - 1);
  $('changeGarment').onclick = () => goToStep(1);
  $('addGarment').onclick = () => goToStep(1);
  document.querySelectorAll('[data-step]').forEach(button => {
    button.onclick = () => { if (!button.disabled) goToStep(Number(button.dataset.step)); };
  });
  $('newOrder').onclick = () => {
    Object.values(order).forEach(counts => Object.keys(counts).forEach(size => { counts[size] = 0; }));
    selected = 'playera'; quantityError = false; invalidate(); furthestStep = 1;
    renderPresets(); renderSizes(); renderBank(); renderSummary(); error(''); goToStep(1);
  };
  $('arrange').onclick=calculate;
  $('clear').onclick=()=>{Object.values(order).forEach(counts=>Object.keys(counts).forEach(s=>{counts[s]=0;}));quantityError=false;invalidate();error('');renderSizes();renderSummary();};
  $('replay').onclick=()=>{if(result)setLayout(result,true);};
  $('download').onclick=download;
  new ResizeObserver(()=>draw()).observe($('rollFrame').parentElement);
  document.fonts.ready.then(draw);
  renderPresets();renderSizes();renderSummary();renderBank();goToStep(1, false);
})();
