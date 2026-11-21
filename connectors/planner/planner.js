(function () {
  'use strict';
  const { Arrange, Presets, Woodworking:Wood } = window;
  const $ = id => document.getElementById(id);
  const rowDefaults = (kind,type) => kind === 'fabric' ? { S:0,M:0,L:0,XL:0 } : { length:Wood.PRESETS[type].length,width:Wood.PRESETS[type].width,quantity:0 };
  function createProject(kind) {
    const catalog = kind === 'fabric' ? Presets.PRESETS : Wood.PRESETS;
    return { order:Object.fromEntries(Object.keys(catalog).map(type=>[type,rowDefaults(kind,type)])), selected:new Set() };
  }
  const projects = { fabric:createProject('fabric'), wood:createProject('wood') };
  let domain='fabric', order=projects.fabric.order, selectedTypes=projects.fabric.selected;
  const stock={...Wood.DEFAULT_STOCK};
  let step=1, furthestStep=1, busy=false, quantityError=false, queuedCommit=false;
  let worker=null, generation=0, result=null, job=null;
  let animation=null,current=new Map(),target=null,animationStart=0,animationFrom=new Map();
  const canvas=$('roll'),ctx=canvas.getContext('2d');
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const number=(value,digits=2)=>value.toLocaleString('es-GT',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const isWood=()=>domain==='wood';
  const catalog=()=>isWood()?Wood.PRESETS:Presets.PRESETS;
  const limit=()=>isWood()?Wood.MAX_PIECES:Presets.MAX_GARMENTS;
  const garmentCount=type=>isWood()?order[type].quantity:Object.values(order[type]).reduce((a,b)=>a+b,0);
  const totalGarments=()=>[...selectedTypes].reduce((sum,type)=>sum+garmentCount(type),0);
  const quantitiesComplete=()=>selectedTypes.size>0&&[...selectedTypes].every(type=>garmentCount(type)>0);
  const expandedItems=request=>request.items.flatMap(item=>Array.from({length:item.quantity},()=>item));
  const activeOrder=()=>Object.fromEntries([...selectedTypes].map(type=>[type,order[type]]));
  const icons={
    playera:'M18 5h8c2 8 10 8 12 0h8l15 13-9 14-9-6v33H21V26l-9 6-9-14Z',
    pantalon:'M15 4h35l7 55H38l-6-34-6 34H7Zm0 7h35M32 5v15',
    chaqueta:'M21 5 12 10 2 43l12 5 9-22v34h18V26l9 22 12-5-10-33-9-5-11 8Zm11 8v47M23 5l9 8-8 9m17-17-9 8 8 9',
    recto:'M5 15h54v34H5ZM30 15v34',repisa:'M4 22h56v20H4ZM13 42v10m38-10v10',
    lateral:'M15 5h34v54H15Zm0 18h34m-34 18h34',liston:'M5 8h54v10H5Zm0 18h54v10H5Zm0 18h54v10H5Z',
    travesano:'M5 23h54v18H5Zm12 0v18m30-18v18',pata:'M22 5h20v54H22Zm0 10h20',inglete:'M4 17h56L44 47H20Z',
  };
  function error(message) { $('orderError').textContent=message;$('orderError').hidden=!message;refreshNavigation(); }
  function refreshNavigation() {
    const wood=isWood(), missing=[...selectedTypes].filter(type=>!garmentCount(type)).map(type=>catalog()[type].plural.toLowerCase());
    $('wizardBack').hidden=step===1;$('wizardBack').querySelector('span').textContent=step===4?'Editar pedido':'Atrás';
    $('wizardNext').hidden=step>2;$('wizardNext').querySelector('span').textContent=step===1?(wood?'Definir medidas':'Elegir tallas'):'Revisar pedido';
    $('wizardNext').disabled=step===1?!selectedTypes.size:!quantitiesComplete()||quantityError;
    $('quantityHint').textContent=missing.length?`Indica cantidades para ${missing.join(', ')} antes de continuar.`:`${totalGarments()} ${wood?'piezas':'prendas'} en el pedido. Máximo ${limit()} en total.`;
    $('selectionHint').textContent=!selectedTypes.size?`Selecciona uno o varios ${wood?'cortes':'tipos de prenda'} para continuar.`:`${selectedTypes.size} tipos seleccionados. Al desmarcar uno, quitamos sus cantidades del pedido.`;
    $('arrange').hidden=step!==3;$('arrange').disabled=busy||quantityError||!quantitiesComplete();
    $('arrange').querySelector('span').textContent=wood?'Calcular tablones':'Calcular mi tela';
    $('newOrder').hidden=step!==4;$('newOrder').disabled=busy;$('stepCounter').textContent=`Paso ${step} de 4`;
    document.querySelectorAll('[data-step]').forEach(button=>{
      const n=Number(button.dataset.step);
      button.disabled=n>furthestStep||(n===4&&!result&&!busy)||(n===2&&!selectedTypes.size)||(n===3&&(!quantitiesComplete()||quantityError));
      button.classList.toggle('completed',n<step);
      if(n===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    });
    document.querySelector('[data-step="1"] span:last-child').textContent=wood?'Cortes':'Prendas';
    document.querySelector('[data-step="2"] span:last-child').textContent=wood?'Medidas':'Tallas';
    document.querySelector('[data-step="4"] span:last-child').textContent=wood?'Tu madera':'Tu tela';
    const titles=wood?['','¿Qué piezas necesitas cortar?','Define las medidas y el tablón','Revisa tu pedido de madera','Tu plan de madera está listo']:['','¿Qué prendas vas a confeccionar?','Define las tallas y cantidades','Revisa tu pedido','Tu plan de tela está listo'];
    const descriptions=wood?['','Elige cortes y piezas habituales de carpintería. Todas las medidas se pueden ajustar.','Indica el tablón disponible, el ancho de corte de tu sierra y las piezas que necesitas.','Confirma las piezas, el stock y el espacio reservado para cada corte.','Revisa cuántos tablones comprar y cómo se distribuyen las piezas.']:['','Selecciona una o varias prendas. Después definirás las tallas de todas.','Indica las cantidades de cada prenda seleccionada.','Confirma las prendas y las condiciones antes de calcular la tela.','Revisa el acomodo de las piezas y las yardas que necesitas comprar.'];
    $('stepTitle').textContent=busy&&step===4?'Estamos acomodando tus piezas':titles[step];
    $('stepDescription').textContent=busy&&step===4?'El cálculo estará listo en unos segundos. Puedes volver para editar el pedido.':descriptions[step];
    $('step-4').setAttribute('aria-busy',String(busy));
    $('widthTag').textContent=wood?`Tablón ${number(stock.length,1)} × ${number(stock.width,1)} cm`:'Rollo de 150 cm de ancho';
  }
  function goToStep(destination,focus=true) {
    if(destination===4&&!result&&!busy||destination===2&&!selectedTypes.size||destination===3&&(!quantitiesComplete()||quantityError))return;
    if(destination<4&&busy)invalidate();
    if(destination!==2){quantityError=false;$('orderError').hidden=true;}
    step=destination;furthestStep=Math.max(furthestStep,step);
    for(let n=1;n<=4;n++)$(`step-${n}`).hidden=n!==step;
    if(step===2)renderSizes();
    refreshNavigation();
    if(focus)$('stepTitle').focus({preventScroll:true});
    requestAnimationFrame(()=>{draw();if(focus)$('stepTitle').scrollIntoView({behavior:'instant',block:'start'});});
  }
  function applyMaterial() {
    const wood=isWood();
    $('presets').setAttribute('aria-label',wood?'Cortes de madera del pedido':'Prendas del pedido');
    $('presets').classList.toggle('wood-catalog',wood);
    $('selectionGuidance').textContent=wood?'Las medidas iniciales son ejemplos editables. Todas las piezas usan el espesor del tablón y mantienen la dirección de la fibra.':'Trabajamos con patrones ilustrativos. Verifica tus patrones de confección antes de comprar.';
    $('quantitiesHeading').textContent=wood?'Piezas y cantidades':'Prendas seleccionadas';
    $('quantitiesDescription').textContent=wood?'Ajusta las medidas y la cantidad de cada tipo de pieza.':'Completa las tallas de cada tipo de prenda.';
    $('changeSelectionLabel').textContent=wood?'Cambiar cortes':'Cambiar prendas';
    $('utilizationLabel').textContent=wood?'Madera aprovechada':'Tela aprovechada';
    $('downloadLabel').textContent=wood?'Descargar plan SVG':'Descargar tendido SVG';
    $('pendingConditions').innerHTML=wood?`<div><dt>Tablón</dt><dd>${stock.length} × ${stock.width} cm</dd></div><div><dt>Unidad de compra</dt><dd>Tablones completos</dd></div>`:'<div><dt>Ancho del rollo</dt><dd>150 cm</dd></div><div><dt>Unidad de compra</dt><dd>Yardas lineales</dd></div>';
    $('layoutTitle').textContent=wood?'Distribución por tablón':'Distribución de las piezas';
    $('fabricLayout').hidden=wood;$('woodLayouts').hidden=!wood;
    $('purchaseUnit').textContent=wood?'tablones':'yardas';
    $('measurementLabel').textContent=wood?'Largo por tablón':'Largo del tendido';
    $('roundingNote').textContent=wood?'Compra de tablones completos de las medidas indicadas.':'Redondeado hacia arriba a ¼ de yarda.';
    $('purchaseNote').textContent=wood?'Estimación con fibra conservada y ancho de corte incluido. Sin defectos, saneado de extremos ni cepillado. Los ingletes reservan un bloque rectangular.':'Estimación con patrones ilustrativos. Sin margen extra por costuras, encogimiento o defectos.';
    $('conditionsNote').textContent=wood?'Mismo espesor en todas las piezas. Se reserva el ancho de la sierra entre piezas y un bloque rectangular para cada inglete.':'Redondearemos hacia arriba a ¼ de yarda. Sin costuras adicionales, encogimiento ni defectos.';
    $('assumptionsContent').innerHTML=wood?'<p>Las dimensiones del tablón son medidas reales de compra, no medidas nominales. El espesor se aplica a todas las piezas. La fibra sigue el largo; las piezas no giran 90°. Los valores iniciales son ejemplos y se pueden cambiar.</p><p>Los cortes rectos se acomodan mediante divisiones transversales y longitudinales con el ancho de sierra indicado. Para ingletes de 45° se reserva un bloque rectangular y se descartan las esquinas. El largo se mide entre las puntas exteriores.</p><p>No se incluye saneado de extremos, defectos, cepillado, cambios de espesor, biseles, ranuras ni ensambles. El acomodo es el mejor de varias estrategias; no garantiza el mínimo posible de tablones.</p>':'<p>Los patrones y la escala de tallas son ilustrativos, no patrones de confección validados. Pantalones y chumpas no incluyen forro, cierres ni complementos.</p><p>Rollo de 150 cm, separación de 1 cm y giros de 0° o 180° para conservar el hilo. Sin costuras adicionales, encogimiento, defectos ni coincidencia de estampados. Revisa patrones reales antes de comprar o cortar. El acomodo no garantiza el mínimo posible.</p>';
    $('conditionRows').innerHTML=wood?`<div><dt>Tablón</dt><dd>${stock.length} × ${stock.width} cm</dd></div><div><dt>Espesor</dt><dd>${stock.thickness} cm</dd></div><div><dt>Ancho de corte</dt><dd>${stock.kerf} mm</dd></div><div><dt>Dirección de la fibra</dt><dd>Se conserva</dd></div>`:'<div><dt>Ancho de tela</dt><dd>150 cm</dd></div><div><dt>Separación</dt><dd>1 cm</dd></div><div><dt>Dirección del hilo</dt><dd>Se conserva</dd></div><div><dt>Compra</dt><dd>Yardas lineales</dd></div>';
    $('purchaseWidth').textContent=wood?`de ${stock.length} × ${stock.width} cm y ${stock.thickness} cm de espesor`:'de tela de 150 cm de ancho';
  }
  function renderPresets() {
    $('presets').innerHTML='';
    Object.entries(catalog()).forEach(([type,preset])=>{
      const toggle=document.createElement('ui-toggle');toggle.setAttribute('value',type);
      toggle.innerHTML=`<button type="button" class="preset" data-type="${type}" aria-label="${preset.plural}"><svg class="garment-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="${icons[type]}"/></svg><span><strong>${preset.plural}</strong><small>${preset.description}</small></span><svg class="preset-check" viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="3"/><path class="checkmark" d="m6 10 3 3 5-6"/></svg></button>`;
      $('presets').appendChild(toggle);
    });
    $('presets').value=[...selectedTypes];
  }
  function selectionChanged(values) {
    const wanted=new Set(values.filter(type=>Object.hasOwn(catalog(),type)));
    for(const type of selectedTypes)if(!wanted.has(type))order[type]=rowDefaults(domain,type);
    for(const type of wanted)if(isWood()&&!selectedTypes.has(type))order[type].quantity=1;
    selectedTypes.clear();for(const type of wanted)selectedTypes.add(type);
    quantityError=false;invalidate();error('');renderSizes();renderSummary();
  }
  function numberField({id,label,value,min=0,max=10000,step=1,type,field,stockKey}) {
    const data=stockKey?`data-stock="${stockKey}"`:`data-type="${type}" data-field="${field}"`;
    return `<div class="size-row"><label for="${id}" class="size-name">${label}</label><ui-number-input min="${min}" max="${max}" step="${step}" value="${value}" locale="es-GT"><ui-number-input-group class="stepper"><ui-number-input-decrement><button type="button" data-change="-1" aria-label="Reducir ${label}">−</button></ui-number-input-decrement><ui-number-input-control><input id="${id}" ${data} data-min="${min}" data-max="${max}" data-step="${step}" aria-label="${stockKey?label:catalog()[type].plural+' '+label}" inputmode="decimal"></ui-number-input-control><ui-number-input-increment><button type="button" data-change="1" aria-label="Aumentar ${label}">+</button></ui-number-input-increment></ui-number-input-group></ui-number-input></div>`;
  }
  function queueCommit() {if(queuedCommit)return;queuedCommit=true;queueMicrotask(()=>{queuedCommit=false;if(step===2)commitQuantities();});}
  function bindNumbers(container) {
    container.querySelectorAll('ui-number-input').forEach(root=>{
      root.addEventListener('valuechange',queueCommit);root.addEventListener('valuecommit',queueCommit);
      root.querySelector('input').addEventListener('input',queueCommit);
    });
  }
  function renderSizes() {
    $('sizes').innerHTML='';quantityError=false;$('stockPanel').hidden=!isWood();
    if(isWood()){
      $('stockPanel').innerHTML='<h2>Tablón que vas a comprar</h2><p>Usa las medidas reales del material disponible. Todos los campos se pueden editar.</p><div class="stock-fields">'+[
        numberField({id:'stock-length',label:'Largo del tablón (cm)',value:stock.length,min:.1,step:.1,stockKey:'length'}),
        numberField({id:'stock-width',label:'Ancho del tablón (cm)',value:stock.width,min:.1,max:2000,step:.1,stockKey:'width'}),
        numberField({id:'stock-thickness',label:'Espesor (cm)',value:stock.thickness,min:.1,max:50,step:.1,stockKey:'thickness'}),
        numberField({id:'stock-kerf',label:'Ancho de corte de sierra (mm)',value:stock.kerf,max:20,step:.1,stockKey:'kerf'}),
      ].join('')+'</div>';bindNumbers($('stockPanel'));
    }
    Object.entries(catalog()).forEach(([type,preset])=>{
      if(!selectedTypes.has(type))return;
      const group=document.createElement('fieldset');group.className='garment-size-group';group.dataset.garment=type;
      group.innerHTML=`<legend>${preset.plural}</legend><p class="garment-size-description">${preset.description}${isWood()?'':' · '+preset.fabric}</p>`;
      const fields=document.createElement('div');fields.className=isWood()?'sizes wood-fields':'sizes';
      fields.innerHTML=(isWood()?[
        {field:'length',label:'Largo exterior (cm)',min:.1,step:.1},
        {field:'width',label:'Ancho (cm)',min:.1,max:2000,step:.1},
        {field:'quantity',label:'Cantidad',min:0,max:100,step:1},
      ]:Object.keys(Presets.sizes).map(size=>({field:size,label:size,max:12}))).map(def=>numberField({...def,id:`quantity-${type}-${def.field}`,value:order[type][def.field],type})).join('');
      group.appendChild(fields);
      if(!isWood()){
        const details=document.createElement('details');details.className='pieces-panel';details.innerHTML='<summary>Ver patrones de referencia, talla M</summary>';details.appendChild(patternBank(preset));group.appendChild(details);
      }
      $('sizes').appendChild(group);bindNumbers(group);
    });
  }
  function commitQuantities() {
    const inputs=[...$('step-2').querySelectorAll('input')];
    let invalid=false;
    const nextOrder=Object.fromEntries(Object.entries(order).map(([type,row])=>[type,{...row}])),nextStock={...stock};
    for(const input of inputs){
      const n=Number(input.value.replaceAll(',',''));
      const increment=Number(input.dataset.step),minimum=Number(input.dataset.min);
      const valid=input.value.trim()!==''&&Number.isFinite(n)&&n>=minimum&&n<=Number(input.dataset.max)&&Math.abs((n-minimum)/increment-Math.round((n-minimum)/increment))<1e-6;
      input.setAttribute('aria-invalid',String(!valid));invalid ||= !valid;
      if(valid){if(input.dataset.stock)nextStock[input.dataset.stock]=n;else nextOrder[input.dataset.type][input.dataset.field]=n;}
    }
    let message=invalid?'Revisa los campos marcados. Usa medidas válidas y cantidades enteras.':'';
    const total=[...selectedTypes].reduce((sum,type)=>sum+(isWood()?nextOrder[type].quantity:Object.values(nextOrder[type]).reduce((a,b)=>a+b,0)),0);
    if(!message&&total>limit())message=`Puedes calcular hasta ${limit()} ${isWood()?'piezas':'prendas'} en total.`;
    if(!message&&isWood())try{Wood.normalize(Object.fromEntries([...selectedTypes].map(type=>[type,nextOrder[type]])),nextStock);}catch(e){message=e.message;}
    quantityError=Boolean(message);
    if(!quantityError){for(const type of selectedTypes)order[type]=nextOrder[type];if(isWood())Object.assign(stock,nextStock);}
    invalidate();error(message);renderSummary();applyMaterial();
  }
  function renderSummary() {
    $('orderLines').innerHTML='';let pieces=0;
    for(const type of selectedTypes){
      const preset=catalog()[type],count=garmentCount(type);if(!count)continue;
      pieces+=isWood()?count:count*preset.pieces.reduce((sum,p)=>sum+p.quantity,0);
      const row=document.createElement('li');
      const description=isWood()?`${number(order[type].length,1)} × ${number(order[type].width,1)} cm`:Object.entries(order[type]).filter(([,n])=>n).map(([s,n])=>`${s} × ${n}`).join(' · ');
      row.innerHTML=`<div><strong>${preset.plural}</strong><span>${description}</span></div><span>× ${count}</span><ui-button><button type="button" class="text-button" data-edit="${type}" aria-label="Editar ${preset.plural.toLowerCase()}">Editar</button></ui-button>`;
      row.querySelector('ui-button').addEventListener('action',()=>{goToStep(2);requestAnimationFrame(()=>document.querySelector(`[data-garment="${type}"] input`)?.focus());});
      $('orderLines').appendChild(row);
    }
    if(!totalGarments()){const li=document.createElement('li');li.textContent='Agrega piezas para empezar.';$('orderLines').appendChild(li);}
    $('garmentCount').textContent=`${totalGarments()} ${isWood()?'piezas':'prendas'}`;$('pieceCount').textContent=`${pieces} piezas a distribuir`;$('clear').disabled=!totalGarments();refreshNavigation();
  }
  function invalidate() {
    generation++;if(worker){worker.terminate();worker=null;}busy=false;result=null;target=null;current.clear();furthestStep=Math.min(furthestStep,3);
    if(animation)cancelAnimationFrame(animation);animation=null;
    $('result').hidden=true;$('emptyState').hidden=false;$('replay').disabled=true;$('woodLayouts').innerHTML='';
    $('status').textContent='Pedido por calcular';$('status').className='status';$('boardCaption').textContent=isWood()?'Medidas en centímetros · fibra en sentido del largo':'Medidas en centímetros · 1 cm entre piezas';
    canvas.setAttribute('aria-label','Vista previa sin calcular.');refreshNavigation();draw();
  }
  function patternBank(preset) {
    const bank = document.createElement('div'); bank.className = 'piece-bank';
    preset.pieces.forEach(piece => {
      const maxX = Math.max(...piece.poly.map(p => p[0])), maxY = Math.max(...piece.poly.map(p => p[1]));
      const el = document.createElement('div'); el.className = 'piece-sample';
      el.innerHTML = `<svg viewBox="-3 -3 ${maxX+6} ${maxY+6}" role="img" aria-label="${piece.name}"><polygon points="${piece.poly.map(p => p.join(',')).join(' ')}" fill="${piece.color}" fill-opacity="0.55" stroke="#69715d" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><p>${piece.name} × ${piece.quantity}</p><small>${number(maxX,0)} × ${number(maxY,0)} cm · M</small>`;
      bank.appendChild(el);
    });
    return bank;
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
    if (isWood() || !$('rollFrame').clientHeight || !$('rollFrame').parentElement.clientWidth) return;
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
  function woodSvg(report,boardIndex,width=720) {
    const board=report.boards[boardIndex],pad=30,scale=(width-pad*2)/report.stock.length,height=report.stock.width*scale+pad*2;
    const shapes=board.placements.map(p=>{
      const x=pad+p.x*scale,y=pad+p.y*scale,w=p.length*scale,h=p.width*scale;
      const blank=p.shape==='miter'?`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1f3ee" stroke="#89917e" stroke-dasharray="3 3"/>`:'';
      const polygon=Wood.polygon(p).map(([px,py])=>`${pad+px*scale},${pad+py*scale}`).join(' ');
      const label=`<text x="${x+w/2}" y="${y+h/2+4}" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="#1c1c1b" paint-order="stroke" stroke="white" stroke-width="2">${p.id}</text>`;
      return `<g class="wood-piece"><title>${p.id}. ${p.name}, ${number(p.length/10,1)} × ${number(p.width/10,1)} cm</title>${blank}<polygon points="${polygon}" fill="${p.shape==='miter'?'#f95300':'#e8fb5b'}" fill-opacity="${p.shape==='miter'?'.3':'.6'}" stroke="#69715d" stroke-width=".75"/>${label}</g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tablón ${boardIndex+1}, ${report.stock.length/10} por ${report.stock.width/10} centímetros, ${board.placements.length} piezas"><rect x="${pad}" y="${pad}" width="${report.stock.length*scale}" height="${report.stock.width*scale}" fill="#fff" stroke="#9aa38f"/><text x="${pad}" y="17" font-family="Inter, sans-serif" font-size="12" fill="#60655c">${number(report.stock.length/10,1)} cm · fibra en sentido del largo</text>${shapes}</svg>`;
  }
  function renderWood(report) {
    $('woodLayouts').innerHTML='';
    const narrowest=Math.min(...report.boards.flatMap(board=>board.placements.map(piece=>piece.width)));
    const width=Math.max(720,Math.min(1800,18*report.stock.length/narrowest+60),$('woodLayouts').clientWidth-32);
    report.boards.forEach((board,index)=>{
      const section=document.createElement('section');section.className='wood-board';
      section.innerHTML=`<div class="section-title"><h3>Tablón ${index+1}</h3><span>${board.placements.length} piezas</span></div><div class="wood-diagram-scroll" tabindex="0" role="region" aria-label="Diagrama del tablón ${index+1}; desplázate horizontalmente para recorrerlo">${woodSvg(report,index,width)}</div><p class="wood-diagram-hint">Desliza para recorrer el tablón. Los números corresponden a la lista de piezas.</p><details><summary>Lista de piezas de este tablón</summary><ol class="wood-piece-list">${board.placements.map(p=>`<li value="${p.id}">${p.name} · ${number(p.length/10,1)} × ${number(p.width/10,1)} cm${p.shape==='miter'?' · ingletes de 45°':''}</li>`).join('')}</ol></details>`;
      $('woodLayouts').appendChild(section);
    });
  }
  function showReport(report,done) {
    if(isWood()){
      if(!done)return;
      result=report;renderWood(report);$('buyYards').textContent=number(report.boardCount,0);$('purchaseUnit').textContent=report.boardCount===1?'tablón':'tablones';
      $('layoutLength').textContent=`${number(report.stock.length/10,1)} cm`;$('utilization').textContent=`${number(report.utilization*100,1)} %`;
      $('boardCaption').textContent=`${report.pieceCount} piezas · corte de ${stock.kerf} mm · rectángulos reservados para ingletes`;
    }else{
      setLayout(report);$('boardCaption').textContent=`${report.placements.length} piezas · hilo en sentido del largo · desliza para recorrer`;
      if(!done){$('status').textContent='Buscando un mejor acomodo…';return;}
      result=report;const purchase=Presets.purchase(report.length);
      $('buyYards').textContent=number(purchase.buyYards);$('layoutLength').textContent=`${number(report.length,0)} cm / ${number(purchase.exactYards)} yd`;$('utilization').textContent=`${number(report.utilization*100,1)} %`;
      canvas.setAttribute('aria-label',`Tendido de ${report.placements.length} piezas, ${report.length} cm de largo. Compra ${number(purchase.buyYards)} yardas.`);
    }
    busy=false;if(worker){worker.terminate();worker=null;}
    $('result').hidden=false;$('replay').disabled=false;$('status').textContent='Distribución lista';$('status').className='status complete';
    $('stageDescription').textContent=isWood()?'Cada tablón muestra las piezas asignadas y el espacio reservado para la sierra.':'Estas son las piezas de tu pedido y el largo que ocupan.';
    $('announcement').textContent=isWood()?`Compra ${report.boardCount} tablones de ${stock.length} por ${stock.width} centímetros.`:`Compra ${number(Presets.purchase(report.length).buyYards)} yardas de tela de 150 cm de ancho.`;
    refreshNavigation();
  }
  function fail(message,token){if(token!==generation)return;invalidate();goToStep(3);renderSummary();error(message||'No pudimos completar el plan. Revisa las medidas e intenta otra vez.');}
  function fallback(request,token){
    let session;
    const tick=()=>{
      if(token!==generation)return;
      try{
        if(request.kind==='wood'){showReport(Wood.plan(request.order,request.stock),true);return;}
        if(!session)session=Arrange.session(request.request);session.step(0);showReport(session.result(),session.done);if(!session.done)setTimeout(tick,16);
      }catch(e){fail(e.message,token);}
    };setTimeout(tick,30);
  }
  function calculate(){
    if(step!==3||quantityError)return;
    let request;
    try{request=isWood()?{kind:'wood',order:activeOrder(),stock:{...stock}}:{kind:'fabric',request:Presets.request(activeOrder())};if(isWood())Wood.normalize(request.order,request.stock);}catch(e){error(e.message);return;}
    invalidate();error('');job=isWood()?request:request.request;busy=true;goToStep(4);const token=generation;
    $('status').textContent='Calculando…';$('status').className='status busy';$('stageDescription').textContent='Las piezas conservan la dirección de la fibra.';
    if(isWood())$('woodLayouts').innerHTML='<p class="wood-loading">Preparando la distribución de los tablones…</p>';
    if(location.protocol==='file:'||typeof Worker==='undefined'){fallback(request,token);return;}
    try{
      worker=new Worker('planner-worker.js');
      worker.onmessage=({data})=>{if(token!==generation)return;if(data.error){fail(data.error,token);return;}try{showReport(data.result,data.done);}catch(e){fail(e.message,token);}};
      worker.onerror=()=>{if(token!==generation)return;worker.terminate();worker=null;fallback(request,token);};worker.postMessage(request);
    }catch{if(worker)worker.terminate();worker=null;fallback(request,token);}
  }
  function download(){
    if(!result)return;
    let svg;
    if(isWood()){
      const width=900,boardHeight=result.stock.width*(width-60)/result.stock.length+60;
      svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${result.boards.length*(boardHeight+60)+60}"><title>Arrange · ${result.boardCount} tablones · ${stock.length} × ${stock.width} cm · corte ${stock.kerf} mm</title><rect width="100%" height="100%" fill="white"/><text x="30" y="25" font-family="sans-serif" font-size="16">Arrange · ${result.boardCount} tablones · ${stock.length} × ${stock.width} cm · espesor ${stock.thickness} cm · corte ${stock.kerf} mm</text>${result.boards.map((_,i)=>`<g transform="translate(0 ${45+i*(boardHeight+60)})"><text x="30" y="15" font-family="sans-serif" font-size="14">Tablón ${i+1}</text><g transform="translate(0 20)">${woodSvg(result,i,width)}</g></g>`).join('')}</svg>`;
    }else{
      const margin=18,width=result.length+margin*2,height=150+margin*2,items=expandedItems(job);
      const shapes=result.placements.map(p=>`<polygon points="${p.polygon.map(([x,y])=>`${x+margin},${y+margin}`).join(' ')}" fill="${items[p.item].data.color}" stroke="#1c1c1b" stroke-width="0.5"><title>${Presets.PRESETS[items[p.item].data.type].name} · ${items[p.item].data.name} · ${items[p.item].data.size}</title></polygon>`).join('');
      svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}cm" height="${height}cm" viewBox="0 0 ${width} ${height}"><title>Arrange · ${number(Presets.purchase(result.length).buyYards)} yardas · Patrones ilustrativos</title><rect width="100%" height="100%" fill="white"/><text x="${margin}" y="10" font-family="sans-serif" font-size="4">Arrange · ${result.length} × 150 cm · ${number(Presets.purchase(result.length).buyYards)} yd · Patrones ilustrativos</text>${shapes}</svg>`;
    }
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download=isWood()?'arrange-tablones.svg':'telatetris-tendido.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('materialMode').addEventListener('valuechange',event=>{
    const next=event.detail.value[0];if(!Object.hasOwn(projects,next)||next===domain)return;
    queueMicrotask(()=>{invalidate();domain=next;order=projects[next].order;selectedTypes=projects[next].selected;step=1;furthestStep=1;quantityError=false;applyMaterial();renderPresets();renderSizes();renderSummary();error('');goToStep(1);});
  });
  $('presets').addEventListener('valuechange',event=>{const expected=domain,values=[...event.detail.value];queueMicrotask(()=>{if(expected===domain)selectionChanged(values);});});
  const action=(id,run)=>$(id).parentElement.addEventListener('action',run);
  action('wizardNext',()=>{if(step===1)goToStep(2);else if(step===2&&quantitiesComplete()&&!quantityError)goToStep(3);});
  action('wizardBack',()=>goToStep(step===4?3:step-1));
  action('changeGarment',()=>goToStep(1));action('addGarment',()=>goToStep(1));
  document.querySelectorAll('[data-step]').forEach(button=>{button.parentElement.addEventListener('action',()=>{if(!button.disabled)goToStep(Number(button.dataset.step));});});
  action('newOrder',()=>{for(const type of Object.keys(order))order[type]=rowDefaults(domain,type);selectedTypes.clear();quantityError=false;invalidate();furthestStep=1;renderPresets();renderSizes();renderSummary();error('');goToStep(1);});
  action('clear',()=>{for(const type of selectedTypes){if(isWood())order[type].quantity=0;else order[type]=rowDefaults(domain,type);}quantityError=false;invalidate();error('');renderSizes();renderSummary();});
  action('arrange',calculate);action('replay',()=>{if(result){if(isWood())renderWood(result);else setLayout(result,true);}});action('download',download);
  new ResizeObserver(()=>draw()).observe($('rollFrame').parentElement);document.fonts.ready.then(draw);
  applyMaterial();renderPresets();renderSizes();renderSummary();goToStep(1,false);
})();
