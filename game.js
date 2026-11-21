/*
 * TelaTetris game.
 *   play   → the player lays out the order
 *   review → the player's roll length is shown; the algorithm searches meanwhile
 *   move   → the player's own pieces fly into the algorithm's layout
 *   result → roll saved
 */
(() => {
  'use strict';
  const TT = window.TT;

  const ROLL_W = 150;        // roll width, cm
  const TURN_MS = 90000;     // player's time limit (starts on first interaction)
  const GAP = 1;             // cutting gap, cm
  const REVIEW_MS = 3500;    // player's result on screen; algorithm searches meanwhile
  const MOVE_MS = 700;       // flight time of one piece
  const MOVE_TOTAL_MS = 3200; // target length of the whole rearrangement
  const MAX_PER_SIZE = 4;

  const COL = {
    roll: '#262626', grid: '#2f2f2f', grid50: '#3a3a3a', edge: '#5e5e5e',
    ink: '#141414', text: '#f2f2ee', muted: '#a3a39c',
    lime: '#e9fb5a', orange: '#ff5a00', hatchBg: '#46220f', hatch: '#b84a16',
  };
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  let counts = { S: 1, M: 2, L: 1, XL: 0 };
  let G = null;              // current game
  let view = null;           // last layout geometry, for pointer mapping
  let renderQueued = false;
  let hatch = null;

  // ------------------------------------------------------------ setup ---

  function newGame() {
    if (G) G.token++;
    const pieces = TT.makeOrder(counts, GAP);
    const shelf = TT.shelfPack(pieces, ROLL_W, GAP);
    const shelfLen = TT.layoutLength(pieces, shelf);
    const L = Math.ceil(shelfLen + 20);
    const queue = pieces.map((p) => p.id);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    G = {
      phase: 'play', token: 0, pieces, shelf, shelfLen, L,
      board: new TT.Board(ROLL_W, L, GAP),
      placements: [], queue, held: null,
      t0: null, elapsed: 0, timeUp: false, warned: false, autoIds: new Set(),
      search: null, human: null, algo: null, final: null, from: null,
    };
    spawn(G.queue.shift());
    showPanel('play');
    setHeading('Tu turno: acomoda el pedido', 'Gana el tendido que use menos rollo.');
    $('keys').style.visibility = '';
    renderOrder();
    updateSide();
    resize();
  }

  function setHeading(title, sub) {
    $('stageTitle').textContent = title;
    $('stageSub').textContent = sub;
  }

  function renderOrder() {
    const box = $('sizes');
    box.innerHTML = '';
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const size of Object.keys(TT.SIZE_SCALE)) {
      const el = document.createElement('div');
      el.className = 'size';
      el.innerHTML = `<b>${size}</b><button aria-label="menos ${size}">−</button><span>${counts[size]}</span><button aria-label="más ${size}">+</button>`;
      const [minus, plus] = el.querySelectorAll('button');
      minus.disabled = counts[size] === 0 || total === 1;
      plus.disabled = counts[size] >= MAX_PER_SIZE;
      minus.onclick = () => changeOrder(size, -1);
      plus.onclick = () => changeOrder(size, +1);
      box.appendChild(el);
    }
    const n = total * TT.GARMENT.reduce((a, [, q]) => a + q, 0);
    $('orderMeta').textContent = `${total} ${total === 1 ? 'playera' : 'playeras'} · ${n} piezas · rollo ${ROLL_W} cm`;
  }

  function changeOrder(size, d) {
    if (G && G.phase === 'move') return;
    if (G && (G.phase === 'play' || G.phase === 'review') && G.placements.length > 0 &&
        !confirm('Cambiar el pedido reinicia el tendido. ¿Continuar?')) return;
    counts[size] = Math.max(0, Math.min(MAX_PER_SIZE, counts[size] + d));
    newGame();
  }

  // -------------------------------------------------------- held piece ---

  function variant(id, rot) { return TT.variantOf(G.pieces[id], rot); }

  function cutLength(placements = G.placements) { return TT.layoutLength(G.pieces, placements); }

  function spawn(id, at = null) {
    if (id === undefined) { G.held = null; return; }
    const v = variant(id, 0);
    const x = at ? at.x : cutLength() + GAP + 6;
    const y = at ? at.y : Math.round((ROLL_W - v.body.h) / 2);
    G.held = { id, rot: 0, x, y, ok: false, ghost: null };
    setHeld(x, y, true);
  }

  function clampHeld(x, y) {
    const v = variant(G.held.id, G.held.rot);
    return {
      x: Math.max(GAP, Math.min(G.L - GAP - v.body.w, x)),
      y: Math.max(GAP, Math.min(ROLL_W - GAP - v.body.h, y)),
    };
  }

  function setHeld(x, y, force = false) {
    const h = G.held;
    if (!h) return;
    const c = clampHeld(Math.round(x), Math.round(y));
    if (!force && c.x === h.x && c.y === h.y) return;
    h.x = c.x; h.y = c.y;
    const v = variant(h.id, h.rot);
    h.ok = G.board.fits(v, h.x, h.y);
    h.ghost = null;
    if (h.ok) {
      let gx = h.x;
      while (gx - 1 >= GAP && G.board.fits(v, gx - 1, h.y)) gx--;
      h.ghost = gx;
    }
    requestRender();
  }

  function startClock() { if (G.t0 === null) G.t0 = performance.now(); }

  function place() {
    const h = G.held;
    if (!h) return;
    if (!h.ok) { toast('Se traslapa o se sale del rollo'); return; }
    startClock();
    G.board.place(G.pieces[h.id], h.rot, h.x, h.y);
    G.placements.push({ id: h.id, rot: h.rot, x: h.x, y: h.y });
    const at = { x: h.x, y: h.y };
    G.held = null;
    ensureRoom();
    if (G.queue.length) spawn(G.queue.shift());
    if (G.held) {
      if (pointer) followPointer();
      else setHeld(cutLength() + GAP + 6, at.y, true);
    }
    updateSide();
    requestRender();
    checkDone();
  }

  function hardDrop() {
    const h = G.held;
    if (!h) return;
    if (h.ghost === null) { toast('Primero mueve la pieza a un lugar libre'); return; }
    h.x = h.ghost;
    h.ok = true;
    place();
  }

  function rotate() {
    const h = G.held;
    if (!h) return;
    h.rot = h.rot === 0 ? 180 : 0;
    setHeld(h.x, h.y, true);
  }

  function nextPiece() {
    const h = G.held;
    if (!h || !G.queue.length) return;
    G.queue.push(h.id);
    spawn(G.queue.shift(), { x: h.x, y: h.y });
    updateSide();
  }

  function selectFromQueue(i) {
    startClock();
    const h = G.held;
    const id = G.queue[i];
    if (h) G.queue[i] = h.id; else G.queue.splice(i, 1);
    spawn(id, h ? { x: h.x, y: h.y } : null);
    updateSide();
  }

  function pickUp(id) {
    if (G.timeUp) return;
    if (G.phase === 'review') cancelReview();
    const k = G.placements.findIndex((p) => p.id === id);
    if (k < 0) return;
    const pl = G.placements[k];
    G.board.remove(G.pieces[id], pl.rot, pl.x, pl.y);
    G.placements.splice(k, 1);
    if (G.held) G.queue.unshift(G.held.id);
    G.held = { id, rot: pl.rot, x: pl.x, y: pl.y, ok: false, ghost: null };
    setHeld(pl.x, pl.y, true);
    updateSide();
  }

  function undo() {
    if (!G.placements.length) return;
    pickUp(G.placements[G.placements.length - 1].id);
  }

  function ensureRoom(extra = 0) {
    const need = cutLength() + extra + 110;
    if (need <= G.L) return;
    G.L = Math.ceil(need + 40);
    G.board = new TT.Board(ROLL_W, G.L, GAP);
    for (const p of G.placements) G.board.place(G.pieces[p.id], p.rot, p.x, p.y);
    resize();
  }

  /** Lay out every piece not yet placed in shelves after the cut line. */
  function fillShelves(check = true) {
    const ids = [...(G.held ? [G.held.id] : []), ...G.queue];
    if (!ids.length) return;
    startClock();
    const shelf = TT.shelfPack(G.pieces, ROLL_W, GAP, ids);
    const start = cutLength();
    ensureRoom(TT.layoutLength(G.pieces, shelf));
    for (const p of shelf) {
      const q = { ...p, x: p.x + start };
      G.board.place(G.pieces[q.id], q.rot, q.x, q.y);
      G.placements.push(q);
    }
    G.held = null;
    G.queue = [];
    updateSide();
    requestRender();
    if (check) checkDone();
  }

  /** Time is up: lay out what is left by shelves, then hand over. */
  function timeUp() {
    if (G.phase !== 'play') return;
    G.timeUp = true;
    const ids = [...(G.held ? [G.held.id] : []), ...G.queue];
    G.autoIds = new Set(ids);
    if (ids.length) fillShelves(false);
    startReview();
  }

  function checkDone() {
    if (G.phase === 'play' && !G.held && !G.queue.length) startReview();
  }

  // ---------------------------------------------- review: your result ---

  function startReview() {
    G.phase = 'review';
    const token = ++G.token;
    G.elapsed = G.t0 === null ? 0 : performance.now() - G.t0;
    G.human = TT.metrics(G.pieces, G.placements, ROLL_W);
    $('sTime').textContent = fmtClock(Math.max(0, TURN_MS - G.elapsed));
    if (G.timeUp) {
      const n = G.autoIds.size;
      setHeading('¡Se acabó el tiempo!', n
        ? `Tu tendido: ${G.human.length} cm. ${n === 1 ? 'La pieza que faltaba se acomodó' : `Las ${n} piezas que faltaban se acomodaron`} por estantes.`
        : `Tu tendido: ${G.human.length} cm de rollo.`);
    } else {
      setHeading(`Tu tendido: ${G.human.length} cm de rollo`, 'Ahora TelaTetris reacomoda tus mismas piezas.');
    }
    $('keys').style.visibility = 'hidden';
    updateSide();
    requestRender();

    const seed = 1000 + counts.S * 7 + counts.M * 31 + counts.L * 131 + counts.XL * 521;
    G.algoL = Math.max(G.L, Math.ceil(G.shelfLen * 1.3 + 40));
    const t0 = performance.now();
    G.reviewT0 = t0;

    // Let the "your result" frame paint before the first (synchronous) pass.
    setTimeout(() => {
      if (!G || G.token !== token) return;
      G.search = TT.createSearch(G.pieces, ROLL_W, G.algoL, GAP, seed);
      const loop = () => {
        if (!G || G.token !== token) return;
        const s = performance.now();
        while (performance.now() - s < 20) G.search.step();
        const e = performance.now() - t0;
        updateCountdown(e);
        requestRender();
        if (e >= REVIEW_MS) startMove();
        else setTimeout(loop, 0);
      };
      loop();
    }, 60);
  }

  function updateCountdown(e) {
    const left = Math.max(1, Math.ceil((REVIEW_MS - e) / 1000));
    $('bFinish').textContent = `TelaTetris empieza en ${left}…`;
  }

  function cancelReview() {
    G.token++;
    G.phase = 'play';
    G.search = null;
    setHeading('Tu turno: acomoda el pedido', 'Gana el tendido que use menos rollo.');
    $('keys').style.visibility = '';
    requestRender();
  }

  // ------------------------------------- move: the algorithm rearranges ---

  function startMove() {
    if (!G.search) return;
    G.phase = 'move';
    G.token++;
    G.final = G.search.best.placements;
    G.from = new Map(G.placements.map((p) => [p.id, p]));
    G.stagger = Math.min(120, (MOVE_TOTAL_MS - MOVE_MS) / Math.max(1, G.final.length - 1));
    G.moveDur = (G.final.length - 1) * G.stagger + MOVE_MS;
    G.moveT0 = performance.now();
    showPanel('solve');
    $('solveIters').textContent = G.search.iterations;
    $('solveHuman').textContent = `${G.human.length} cm`;
    $('solveBest').textContent = `${G.search.best.length} cm`;
    setHeading('TelaTetris reacomoda tus piezas', 'Mismas piezas, mismo hilo, misma separación de corte.');
    resize();

    const anim = () => {
      if (!G || G.phase !== 'move') return;
      const t = performance.now() - G.moveT0;
      $('solveBar').style.width = `${Math.min(100, (t / G.moveDur) * 100).toFixed(1)}%`;
      requestRender();
      if (t < G.moveDur + 300) requestAnimationFrame(anim);
      else showResults();
    };
    requestAnimationFrame(anim);
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Where every piece is drawn at time t of the rearrangement. */
  function pieceStates(t) {
    return G.final.map((to, k) => {
      const from = G.from.get(to.id);
      const p = Math.max(0, Math.min(1, (t - k * G.stagger) / MOVE_MS));
      const e = ease(p);
      if (p >= 1) return { id: to.id, rot: to.rot, x: to.x, y: to.y, angle: 0, state: 'done' };
      return {
        id: to.id,
        rot: from.rot,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        angle: from.rot !== to.rot ? Math.PI * e : 0,
        state: p <= 0 ? 'waiting' : p >= 1 ? 'done' : 'moving',
      };
    });
  }

  // ---------------------------------------------------------- result ---

  function showResults() {
    G.phase = 'result';
    G.algo = TT.metrics(G.pieces, G.final, ROLL_W);
    const shelf = TT.metrics(G.pieces, G.shelf, ROLL_W);
    const human = G.human;
    const saved = human.length - G.algo.length;
    const pct = human.length ? (saved / human.length) * 100 : 0;

    const card = $('savedCard');
    card.classList.toggle('lose', saved < 0);
    if (saved > 0) {
      card.innerHTML = `
        <div class="k">Rollo ahorrado</div>
        <div class="big" id="cntCm">0<small>cm</small></div>
        <div class="pct" id="cntPct">0%</div>
        <div class="note">En 1,000 tendidos iguales: ${fmt(saved * 10)} m de tela.</div>
        <span class="badge">MEDIDO EN VIVO</span>`;
      countUp($('cntCm'), saved, (v) => `${Math.round(v)}<small>cm</small>`);
      countUp($('cntPct'), pct, (v) => `${v.toFixed(1)}%`);
    } else if (saved === 0) {
      card.innerHTML = `
        <div class="k">Empate</div>
        <div class="big">0<small>cm</small></div>
        <div class="note">Tu tendido mide lo mismo que el de TelaTetris. Muy bien.</div>
        <span class="badge">MEDIDO EN VIVO</span>`;
    } else {
      card.innerHTML = `
        <div class="k">Le ganaste a TelaTetris</div>
        <div class="big">${-saved}<small>cm</small></div>
        <div class="pct">${(-pct).toFixed(1)}% menos rollo</div>
        <div class="note">Buen ojo. Así medimos el ahorro: contra el mejor tendido, no contra el peor.</div>
        <span class="badge">MEDIDO EN VIVO</span>`;
    }

    const shown = Math.min(G.elapsed, TURN_MS);
    const mins = Math.floor(shown / 60000), secs = Math.floor((shown % 60000) / 1000);
    $('cmpTable').innerHTML = `
      <tr><th></th><th>Rollo</th><th>Aprovecha</th></tr>
      <tr class="me"><td>Tú <span style="color:var(--muted)">(${mins}:${String(secs).padStart(2, '0')}${G.timeUp && G.autoIds.size ? ` · ${G.autoIds.size} por estantes` : ''})</span></td><td>${human.length} cm</td><td>${pc(human.utilization)}</td></tr>
      <tr class="tt"><td>TelaTetris</td><td>${G.algo.length} cm</td><td>${pc(G.algo.utilization)}</td></tr>
      <tr class="ref"><td>Por estantes</td><td>${shelf.length} cm</td><td>${pc(shelf.utilization)}</td></tr>`;

    const vh = TT.validate(G.pieces, G.placements, ROLL_W, G.L, GAP);
    const va = TT.validate(G.pieces, G.final, ROLL_W, G.algoL, GAP);
    const mark = (b) => `<span class="${b ? 'ok' : 'bad'}">${b ? '✓' : '✕'}</span>`;
    $('checks').innerHTML = `
      <span></span><span class="h">Tú</span><span class="h">TelaTetris</span>
      <span>Sin traslapes</span>${mark(vh.noOverlap)}${mark(va.noOverlap)}
      <span>Hilo respetado</span>${mark(vh.grain)}${mark(va.grain)}
      <span>Piezas completas</span>${mark(vh.complete)}${mark(va.complete)}`;

    showPanel('result');
    setHeading(saved > 0 ? 'El mismo pedido, menos tela.' : 'El mismo pedido.',
      `Tú: ${human.length} cm · TelaTetris: ${G.algo.length} cm`);
    requestRender();
  }

  // ------------------------------------------------------------ side ---

  function showPanel(which) {
    $('playPanel').hidden = which !== 'play';
    $('solvePanel').hidden = which !== 'solve';
    $('resultPanel').hidden = which !== 'result';
    if (which === 'solve') $('solveBar').style.width = '0%';
  }

  function updateSide() {
    if (!G || (G.phase !== 'play' && G.phase !== 'review')) return;
    const q = $('queue');
    q.innerHTML = '';
    const show = G.queue.slice(0, 5);
    show.forEach((id, i) => {
      const b = document.createElement('button');
      b.title = `${G.pieces[id].name} ${G.pieces[id].size}`;
      if (i === 0) b.className = 'first';
      const c = document.createElement('canvas');
      b.appendChild(c);
      b.onclick = () => selectFromQueue(i);
      q.appendChild(b);
      requestAnimationFrame(() => drawMini(c, G.pieces[id]));
    });
    if (G.queue.length > 5) {
      const more = document.createElement('button');
      more.className = 'more';
      more.textContent = `+${G.queue.length - 5}`;
      more.tabIndex = -1;
      q.appendChild(more);
    }
    if (!G.queue.length) {
      const e = document.createElement('div');
      e.className = 'queue-empty';
      e.textContent = G.held ? 'Última pieza en la mano.' : 'Todas las piezas están en el rollo.';
      q.appendChild(e);
    }
    const n = G.pieces.length, placed = G.placements.length;
    $('sPieces').textContent = `${placed}/${n}`;
    const m = TT.metrics(G.pieces, G.placements, ROLL_W);
    $('sLen').innerHTML = `${m.length}<small>cm</small>`;
    $('sWaste').textContent = placed ? pc(m.waste) : '–';
    $('bUndo').disabled = placed === 0 || G.timeUp;
    $('bRotate').disabled = !G.held;
    $('bShelf').disabled = !G.held && !G.queue.length;
    const reviewing = G.phase === 'review';
    $('bFinish').hidden = !reviewing;
    if (reviewing) updateCountdown(0);
  }

  function fmtClock(ms) {
    const t = Math.ceil(ms / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  function tickClock() {
    if (!G || G.phase !== 'play') return;
    const left = G.t0 === null ? TURN_MS : Math.max(0, TURN_MS - (performance.now() - G.t0));
    const el = $('sTime');
    el.textContent = fmtClock(left);
    el.classList.toggle('low', left <= 15000);
    if (G.t0 === null) return;
    if (left <= 10000 && !G.warned) { G.warned = true; toast('¡Quedan 10 segundos!'); }
    if (left <= 0) timeUp();
  }
  setInterval(tickClock, 200);

  function drawMini(c, piece) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 90, h = c.clientHeight || 72;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min((w - 14) / piece.w, (h - 14) / piece.h, 1.6);
    drawPiece(g, piece, 0, (w - piece.w * s) / 2, (h - piece.h * s) / 2, s, {});
  }

  // ---------------------------------------------------------- render ---

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  const PAD = 12, LABEL_H = 28, RULER_H = 22;

  function resize() {
    const wrap = $('canvasWrap');
    const cssW = wrap.clientWidth;
    const showL = displayLength();
    const maxH = Math.max(260, window.innerHeight - wrap.getBoundingClientRect().top - 70);
    const fitH = (maxH - LABEL_H - RULER_H) / ROLL_W;
    const s = Math.max(0.6, Math.min((cssW - 2 * PAD) / showL, fitH));
    const cssH = Math.ceil(LABEL_H + ROLL_W * s + RULER_H + 4);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view = { cssW, cssH, s, dpr, ox: PAD, oy: LABEL_H, showL };
    hatch = null;
    requestRender();
  }

  // The same roll stays on screen from play to result; it only grows if a
  // layout would not fit.
  function displayLength() {
    if (!G) return 300;
    let L = G.L;
    if (G.phase !== 'play') L = Math.max(L, cutLength() + 25);
    if (G.final) L = Math.max(L, TT.layoutLength(G.pieces, G.final) + 25);
    return L;
  }

  function hatchPattern(g) {
    if (hatch) return hatch;
    const dpr = view.dpr;
    const n = Math.round(10 * dpr);
    const off = document.createElement('canvas');
    off.width = n; off.height = n;
    const o = off.getContext('2d');
    o.fillStyle = COL.hatchBg; o.fillRect(0, 0, n, n);
    o.strokeStyle = COL.hatch; o.lineWidth = 2.2 * dpr;
    o.beginPath();
    for (let k = -1; k <= 1; k++) { o.moveTo(k * n, n); o.lineTo(k * n + n, 0); }
    o.stroke();
    hatch = g.createPattern(off, 'repeat');
    hatch.setTransform(new DOMMatrix().scale(1 / dpr));
    return hatch;
  }

  function render() {
    if (!G || !view) return;
    const g = ctx;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.cssW, view.cssH);
    const { s, ox, oy, showL } = view;

    if (G.phase === 'play') {
      drawRoll(g, ox, oy, s, showL, cutLength());
      for (const p of G.placements) drawPiece(g, G.pieces[p.id], p.rot, ox + p.x * s, oy + p.y * s, s, {});
      drawHeld(g, ox, oy, s);
      drawCut(g, ox, oy, s, cutLength(), COL.orange, `${cutLength()} cm`, 'right');
      drawRuler(g, ox, oy, s, showL);
      return;
    }

    if (G.phase === 'review') {
      const len = G.human.length;
      drawRoll(g, ox, oy, s, showL, len);
      for (const p of G.placements) {
        g.globalAlpha = G.autoIds.has(p.id) ? 0.6 : 1;
        drawPiece(g, G.pieces[p.id], p.rot, ox + p.x * s, oy + p.y * s, s, {});
      }
      g.globalAlpha = 1;
      drawCut(g, ox, oy, s, len, COL.orange, `Tu corte · ${len} cm`, 'right');
      drawRuler(g, ox, oy, s, showL);
      drawBanner(g, ox, oy, s, showL);
      return;
    }

    // move / result: the player's pieces travel to the algorithm's layout
    const t = G.phase === 'result' ? Infinity : performance.now() - G.moveT0;
    const states = pieceStates(t);
    let extent = 0;
    for (const st of states) extent = Math.max(extent, st.x + variant(st.id, st.rot).body.w);
    extent = Math.round(extent);
    drawRoll(g, ox, oy, s, showL, extent);

    const humanLen = G.human.length;
    const done = G.phase === 'result';
    if (done) {
      if (G.algo.length < humanLen) box(g, ox, oy, s, { from: G.algo.length, to: humanLen }, COL.lime, 'rollo ahorrado');
      else if (G.algo.length > humanLen) box(g, ox, oy, s, { from: humanLen, to: G.algo.length }, COL.orange, 'ventaja tuya');
    }

    const order = { waiting: 0, done: 1, moving: 2 };
    states.slice().sort((a, b) => order[a.state] - order[b.state]).forEach((st) => {
      const piece = G.pieces[st.id];
      const px = ox + st.x * s, py = oy + st.y * s;
      if (st.state === 'waiting') {
        g.globalAlpha = 0.6;
        drawPiece(g, piece, st.rot, px, py, s, {});
        g.globalAlpha = 1;
      } else if (st.state === 'moving') {
        g.save();
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
        drawPieceRotated(g, piece, st.rot, px, py, s, st.angle, { lifted: true });
        g.restore();
      } else {
        drawPieceRotated(g, piece, st.rot, px, py, s, st.angle, {});
      }
    });

    drawCut(g, ox, oy, s, humanLen, done ? COL.orange : 'rgba(255,90,0,0.6)', `Tu corte · ${humanLen} cm`, 'right');
    if (extent < humanLen - 2 || done) {
      drawCut(g, ox, oy, s, extent, COL.lime, `TelaTetris · ${extent} cm`, 'left');
    }
    drawRuler(g, ox, oy, s, showL);
  }

  function drawRoll(g, ox, oy, s, L, cut) {
    const W = ROLL_W * s, len = L * s;
    g.fillStyle = COL.roll;
    g.fillRect(ox, oy, len, W);
    for (let x = 10; x < L; x += 10) {
      g.fillStyle = x % 50 === 0 ? COL.grid50 : COL.grid;
      g.fillRect(ox + x * s, oy, 1, W);
    }
    if (cut > 0) {
      g.fillStyle = hatchPattern(g);
      g.fillRect(ox, oy, cut * s, W);
    }
    g.fillStyle = COL.edge;
    g.fillRect(ox, oy - 1, len, 1);
    g.fillRect(ox, oy + W, len, 1);
  }

  function drawHeld(g, ox, oy, s) {
    const h = G.held;
    if (!h) return;
    const piece = G.pieces[h.id];
    if (h.ghost !== null && h.ghost !== h.x) {
      drawPiece(g, piece, h.rot, ox + h.ghost * s, oy + h.y * s, s, { ghost: true });
    }
    drawPiece(g, piece, h.rot, ox + h.x * s, oy + h.y * s, s, { held: true, bad: !h.ok });
  }

  function drawCut(g, ox, oy, s, at, color, label, side) {
    if (at <= 0) return;
    const W = ROLL_W * s;
    const x = ox + at * s + 0.5;
    g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(x, oy - 6); g.lineTo(x, oy + W + 4); g.stroke();
    g.setLineDash([]);
    g.fillStyle = color;
    g.font = `700 12px ${FONT}`;
    g.textBaseline = 'alphabetic';
    const tw = g.measureText(label).width;
    const right = ox + view.showL * s;
    let tx = side === 'left' ? x - 6 - tw : x + 6;
    tx = Math.max(ox, Math.min(right - tw, tx));
    g.fillText(label, tx, oy - 9);
  }

  function drawRuler(g, ox, oy, s, L) {
    const W = ROLL_W * s;
    g.fillStyle = COL.muted;
    g.font = `500 11px ${FONT}`;
    g.textBaseline = 'top';
    for (let x = 0; x <= L; x += 10) {
      const major = x % 50 === 0;
      g.fillRect(ox + x * s, oy + W + 2, 1, major ? 7 : 4);
      if (major && x > 0 && x < L - 22) g.fillText(String(x), ox + x * s - 8, oy + W + 10);
    }
    g.fillText('cm', ox + L * s - 16, oy + W + 10);
  }

  /** "You used X cm" card over the empty part of the roll. */
  function drawBanner(g, ox, oy, s, L) {
    const h = G.human;
    const W = ROLL_W * s;
    const freeFrom = ox + h.length * s, freeTo = ox + L * s;
    const bw = Math.max(220, Math.min(320, freeTo - freeFrom - 16));
    const bh = Math.min(W - 8, 172);
    const cx = Math.min(freeTo - bw / 2 - 6, Math.max((freeFrom + freeTo) / 2, ox + bw / 2));
    const x = cx - bw / 2, y = oy + (W - bh) / 2;
    g.fillStyle = 'rgba(22,22,22,0.94)';
    g.strokeStyle = '#4a4a4a'; g.lineWidth = 1;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, bw, bh, 14); else g.rect(x, y, bw, bh);
    g.fill(); g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = COL.muted;
    g.font = `700 12px ${FONT}`;
    const k = bh / 172;
    if (G.timeUp) g.fillStyle = COL.orange;
    g.fillText(G.timeUp ? '¡SE ACABÓ EL TIEMPO!' : 'TU TENDIDO', cx, y + 28 * k);
    g.fillStyle = COL.orange;
    g.font = `800 ${Math.round(44 * k)}px ${FONT}`;
    g.fillText(`${h.length} cm`, cx, y + 76 * k);
    g.fillStyle = COL.text;
    g.font = `600 14px ${FONT}`;
    g.fillText(`${pc(h.utilization)} aprovechado`, cx, y + 104 * k);
    g.fillStyle = COL.muted;
    g.font = `500 13px ${FONT}`;
    const n = G.timeUp ? G.autoIds.size : 0;
    g.fillText(n ? `${n} ${n === 1 ? 'pieza' : 'piezas'} por estantes` : `${pc(h.waste)} desperdicio`, cx, y + 124 * k);
    // countdown bar
    const p = G.reviewT0 ? Math.min(1, (performance.now() - G.reviewT0) / REVIEW_MS) : 0;
    g.fillStyle = '#333';
    g.fillRect(x + 24, y + bh - 26, bw - 48, 5);
    g.fillStyle = COL.lime;
    g.fillRect(x + 24, y + bh - 26, (bw - 48) * p, 5);
    g.textAlign = 'left';
  }

  function box(g, ox, oy, s, r, color, label) {
    const x = ox + r.from * s, w = (r.to - r.from) * s, H = ROLL_W * s;
    g.fillStyle = color === COL.lime ? 'rgba(233,251,90,0.13)' : 'rgba(255,90,0,0.15)';
    g.fillRect(x, oy, w, H);
    g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.strokeRect(x + 1, oy + 1, w - 2, H - 2);
    g.setLineDash([]);
    if (w > 60) {
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${Math.min(30, Math.max(12, w / 6))}px ${FONT}`;
      g.fillText(`${r.to - r.from} cm`, x + w / 2, oy + H / 2 - 12);
      g.font = `600 13px ${FONT}`;
      g.fillText(label, x + w / 2, oy + H / 2 + 14);
      g.textAlign = 'left';
    }
  }

  /** Draw a piece turned by `angle` around its own centre (for 0°→180° flips). */
  function drawPieceRotated(g, piece, rot, px, py, s, angle, o) {
    if (!angle) { drawPiece(g, piece, rot, px, py, s, o); return; }
    const hw = (piece.w * s) / 2, hh = (piece.h * s) / 2;
    g.save();
    g.translate(px + hw, py + hh);
    g.rotate(angle);
    drawPiece(g, piece, rot, -hw, -hh, s, { ...o, noLabel: true });
    g.restore();
  }

  function drawPiece(g, piece, rot, px, py, s, o) {
    const v = TT.variantOf(piece, rot);
    g.beginPath();
    v.poly.forEach(([x, y], i) => (i ? g.lineTo(px + x * s, py + y * s) : g.moveTo(px + x * s, py + y * s)));
    g.closePath();
    if (o.ghost) {
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(242,242,238,0.55)';
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
      return;
    }
    const a = g.globalAlpha;
    g.fillStyle = o.bad ? COL.orange : piece.color;
    if (o.held) g.globalAlpha = a * (o.bad ? 0.75 : 0.92);
    g.fill();
    g.globalAlpha = a;
    g.shadowColor = 'transparent';
    g.strokeStyle = (o.held && !o.bad) || o.lifted ? '#ffffff' : COL.ink;
    g.lineWidth = o.held || o.lifted ? 2 : 1.25;
    g.stroke();

    // grain line: double arrow along x
    if (piece.arrow && piece.w * s > 26) {
      const cxOff = piece.type === 'manga' ? (rot === 0 ? 0.58 : 0.42) : 0.55;
      const cx = px + piece.w * s * (rot === 0 ? cxOff : 1 - cxOff);
      const cy = py + (piece.h * s) / 2;
      const half = Math.min(piece.w * 0.22, 14) * s;
      const hs = Math.max(3, Math.min(6, s * 2));
      g.strokeStyle = '#3d3d32'; g.fillStyle = '#3d3d32'; g.lineWidth = Math.max(1, Math.min(1.6, s * 0.6));
      g.beginPath(); g.moveTo(cx - half, cy); g.lineTo(cx + half, cy); g.stroke();
      g.beginPath();
      g.moveTo(cx - half, cy); g.lineTo(cx - half + hs * 1.4, cy - hs); g.lineTo(cx - half + hs * 1.4, cy + hs); g.closePath();
      g.moveTo(cx + half, cy); g.lineTo(cx + half - hs * 1.4, cy - hs); g.lineTo(cx + half - hs * 1.4, cy + hs); g.closePath();
      g.fill();
      if (piece.h * s > 50 && !o.noLabel) {
        g.font = `700 ${Math.max(9, Math.min(12, s * 4))}px ${FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(piece.size, cx, cy + hs + 3);
        g.textAlign = 'left';
      }
    }
  }

  // ----------------------------------------------------------- input ---

  let pointer = null;   // last pointer position in cm, or null

  function toCm(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    return { x: (mx - view.ox) / view.s, y: (my - view.oy) / view.s };
  }

  function pointerCell() {
    if (!pointer || !G.held) return null;
    const v = variant(G.held.id, G.held.rot);
    return { x: Math.round(pointer.x - v.body.w / 2), y: Math.round(pointer.y - v.body.h / 2) };
  }

  function followPointer() {
    const c = pointerCell();
    if (c) setHeld(c.x, c.y);
  }

  const interactive = () => G && (G.phase === 'play' || G.phase === 'review');

  canvas.addEventListener('pointermove', (e) => {
    if (!G || G.phase !== 'play') return;
    startClock();
    pointer = toCm(e);
    followPointer();
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('pointerdown', (e) => {
    if (!interactive()) return;
    pointer = toCm(e);
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { rotate(); return; }
      clickAt(pointer);
    } else if (G.phase === 'play') {
      canvas.setPointerCapture(e.pointerId);
      followPointer();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!interactive() || e.pointerType === 'mouse') return;
    pointer = toCm(e);
    clickAt(pointer);
    pointer = null;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!G || G.phase !== 'play' || !G.held) return;
    e.preventDefault();
    rotate();
  }, { passive: false });

  // In review, clicking a placed piece picks it up and cancels the hand-off.
  function clickAt(p) {
    if (!G.held) {
      const id = G.board.ownerAt(Math.floor(p.x), Math.floor(p.y));
      if (id >= 0) pickUp(id);
      return;
    }
    followPointer();
    if (G.held.ok) { place(); return; }
    const id = G.board.ownerAt(Math.floor(p.x), Math.floor(p.y));
    if (id >= 0) { pickUp(id); return; }
    toast('Se traslapa o se sale del rollo');
  }

  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'r', 'R', 'c', 'C', 'z', 'Z', 'Backspace'];
  window.addEventListener('keydown', (e) => {
    if (!interactive() || !KEYS.includes(e.key)) return;
    e.preventDefault();
    pointer = null;
    if (G.phase === 'review') {
      if (e.key === 'Enter') startMove();
      else if (['z', 'Z', 'Backspace'].includes(e.key)) undo();
      return;
    }
    startClock();
    const h = G.held;
    const step = e.shiftKey ? 5 : 1;
    switch (e.key) {
      case 'ArrowLeft': if (h) setHeld(h.x - step, h.y); break;
      case 'ArrowRight': if (h) setHeld(h.x + step, h.y); break;
      case 'ArrowUp': if (h) setHeld(h.x, h.y - step); break;
      case 'ArrowDown': if (h) setHeld(h.x, h.y + step); break;
      case ' ': hardDrop(); break;
      case 'Enter': if (h) place(); break;
      case 'r': case 'R': rotate(); break;
      case 'c': case 'C': nextPiece(); break;
      default: undo(); break;   // z, Z, Backspace
    }
  });

  $('bRotate').onclick = () => { startClock(); rotate(); };
  $('bUndo').onclick = undo;
  $('bShelf').onclick = fillShelves;
  $('bFinish').onclick = () => { if (G.phase === 'review') startMove(); };
  $('bAgain').onclick = newGame;
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------ misc ---

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1100);
  }

  function countUp(el, target, format, ms = 900) {
    const t0 = performance.now();
    const f = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      el.innerHTML = format(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(f);
    };
    f();
  }

  const pc = (x) => `${(x * 100).toFixed(1)}%`;
  const fmt = (x) => Math.round(x).toLocaleString('en-US');

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestRender());
  newGame();
})();
