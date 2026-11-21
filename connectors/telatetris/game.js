/*
 * TelaTetris game.
 *   start  → a floating, turning T-shirt and EMPEZAR
 *   story  → Chepe gets an order, goes to the fabric shop, doesn't know how many yards to buy
 *   intro  → the order's T-shirt comes apart and its pieces fly into the piece bank
 *   play   → the player lays out the order
 *   review → the player's roll length is shown; the algorithm searches meanwhile
 *   move   → the player's own pieces fly into the algorithm's layout
 *   result → money saved: each roll length is the fabric to buy, priced in GTQ
 */
(() => {
  'use strict';
  const { Arrange, Garments } = window;

  const ROLL_W = 150;        // roll width, cm
  const TURN_MS = 90000;     // player's time limit (starts on first interaction)
  const GAP = 1;             // cutting gap, cm
  const REVIEW_MS = 4500;    // player's result on screen; algorithm searches meanwhile
  const MOVE_MS = 950;       // flight time of one piece
  const MOVE_TOTAL_MS = 4300; // target length of the whole rearrangement
  const MAX_PER_SIZE = 4;

  // Labs palette (labs.gt) plus the warm darks of the cabinet.
  const COL = {
    roll: '#262622', dot: '#3a3934', dot50: '#55534b', line50: '#2e2d29', edge: '#5c5a53',
    ink: '#141413', text: '#ffffff', muted: '#CFCFCD', dim: '#8F8C85',
    yellow: '#E8FB5B', orange: '#F95300', black: '#1C1C1B', olive: '#3B3D2B', panel: '#242420',
    hatchBg: '#3a1d0c', hatch: '#9c3f0d',
  };
  const FONT = '"IBM Plex Mono", monospace';
  const PIX = '"Press Start 2P", monospace';
  const PLAY_TITLE = 'Tu turno: acomoda el pedido';
  const PLAY_SUB = 'Gana el tendido que use menos rollo. El reloj corre desde tu primer movimiento.';

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let counts = { S: 1, M: 2, L: 1, XL: 0 };
  let G = null;              // current game
  let view = null;           // last layout geometry, for pointer mapping
  let renderQueued = false;
  let hatch = null;
  let intro = null;          // attract sequence state, or null
  const shirtIcons = {};     // size → canvas in the order card
  let refocus = null, refocusEl = null; // keeps keyboard focus on an order stepper across re-renders
  const sizeCards = {};      // size → its order card
  const tileEls = new Map(); // "<type>-<size>" → its piece-bank tile

  // ------------------------------------------------------------ sound ---
  // Tiny square-wave synth. Silent until the first user gesture.

  const Sound = (() => {
    let ac = null;
    let on = true;
    try { on = window.localStorage.getItem('telatetris-sound') !== 'off'; } catch (e) { /* no storage */ }
    function audio() {
      if (!on) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        if (!ac) ac = new AC();
        if (ac.state === 'suspended') ac.resume();
      } catch (e) { return null; }
      return ac;
    }
    function tone(f, dur = 0.08, { type = 'square', vol = 0.05, to = 0, at = 0 } = {}) {
      const a = audio();
      if (!a) return;
      const t = a.currentTime + at;
      const o = a.createOscillator();
      const gn = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      gn.gain.setValueAtTime(vol, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn);
      gn.connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    const seq = (notes, step, opts = {}) => notes.forEach((f, i) => tone(f, step * 1.15, { ...opts, at: i * step }));
    const fx = {
      place: () => { tone(196, 0.05, { vol: 0.06 }); tone(392, 0.07, { at: 0.04, vol: 0.035 }); },
      rotate: () => tone(660, 0.04, { vol: 0.03, type: 'triangle' }),
      pick: () => tone(520, 0.08, { to: 300, vol: 0.035 }),
      select: () => tone(880, 0.03, { vol: 0.02 }),
      bad: () => tone(98, 0.16, { type: 'sawtooth', vol: 0.045 }),
      shirt: () => seq([523, 659, 784, 1047], 0.07, { vol: 0.04 }),
      tick: () => tone(1046, 0.04, { vol: 0.025 }),
      timeUp: () => seq([440, 349, 294, 220], 0.12, { vol: 0.05 }),
      count: () => tone(587, 0.07, { vol: 0.035 }),
      go: () => seq([587, 880, 1175], 0.07, { vol: 0.045 }),
      fly: (i) => tone(320 + (i % 12) * 40, 0.05, { type: 'triangle', vol: 0.025 }),
      win: () => seq([523, 659, 784, 1047, 0.0001, 784, 1047, 1319], 0.085, { vol: 0.045 }),
      lose: () => seq([392, 330, 262, 196], 0.13, { vol: 0.045 }),
      pop: () => tone(180, 0.14, { to: 720, vol: 0.04 }),
      burst: () => tone(900, 0.28, { to: 140, vol: 0.035, type: 'sawtooth' }),
      whoosh: () => tone(140, 0.45, { to: 620, vol: 0.03, type: 'triangle' }),
      start: () => seq([392, 523, 659, 784], 0.06, { vol: 0.04 }),
    };
    return {
      fx,
      get on() { return on; },
      toggle() {
        on = !on;
        try { window.localStorage.setItem('telatetris-sound', on ? 'on' : 'off'); } catch (e) { /* no storage */ }
        if (on) fx.select();
        return on;
      },
    };
  })();
  // A controller in use also feels placements, bad drops and finished shirts.
  let padActive = false;
  const RUMBLE = { place: [40, 0.1, 0.35], bad: [120, 0.6, 0.3], shirt: [240, 0.35, 0.7], go: [120, 0.3, 0.5] };
  const sfx = (name, ...args) => {
    try { Sound.fx[name](...args); } catch (e) { /* audio is optional */ }
    if (padActive && RUMBLE[name]) rumble(...RUMBLE[name]);
  };

  // ----------------------------------------------------- T-shirt model ---
  // One T-shirt drawn from its real pattern pieces. Poses are in cm around the
  // shirt's centre: x, y, a = screen angle of the piece's grain axis (degrees),
  // ys = scale across the grain (a worn sleeve shows folded in half).

  const TYPES = Garments.PIECE_TYPES;
  const BOUNDS = {};
  for (const [k, t] of Object.entries(TYPES)) {
    BOUNDS[k] = {
      w: Math.max(...t.poly.map((p) => p[0])),
      h: Math.max(...t.poly.map((p) => p[1])),
    };
  }

  // Back to front.
  const PARTS = [
    { id: 'mangaL', type: 'manga', k: 1, label: 'MANGA' },
    { id: 'mangaR', type: 'manga', k: 2, label: 'MANGA' },
    { id: 'espalda', type: 'espalda', k: 1, label: 'ESPALDA' },
    { id: 'delantero', type: 'delantero', k: 1, label: 'DELANTERO' },
    { id: 'bolsillo', type: 'bolsillo', k: 1, label: 'BOLSILLO' },
    { id: 'cuello', type: 'cuello', k: 1, label: 'CUELLO' },
  ];

  const WORN = {
    mangaL: { x: -28.8, y: -20.7, a: 168, ys: 0.5 },
    mangaR: { x: 28.8, y: -20.7, a: 12, ys: 0.5 },
    espalda: { x: 0, y: 0, a: 90 },
    delantero: { x: 0, y: 0, a: 90 },
    bolsillo: { x: 12, y: -11, a: 90 },
    cuello: { pts: [[-8.5, -35.2], [0, -27.6], [8.5, -35.2]] },
  };
  const EXPLODED = {
    mangaL: { x: -90, y: -14, a: 168 },
    mangaR: { x: 90, y: -14, a: 12 },
    espalda: { x: 37, y: 2, a: 90 },
    delantero: { x: -37, y: 2, a: 90 },
    bolsillo: { x: 0, y: 26, a: 90 },
    cuello: { x: 0, y: -46, a: 90 },
  };
  const collarPts = (p) => {
    const r = (p.a * Math.PI) / 180;
    const dx = -Math.sin(r) * 22, dy = Math.cos(r) * 22;
    return [[p.x - dx, p.y - dy], [p.x, p.y], [p.x + dx, p.y + dy]];
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpPose = (A, B, t) => ({ x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), a: lerp(A.a, B.a, t), ys: lerp(A.ys ?? 1, B.ys ?? 1, t) });
  const lerpPts = (A, B, t) => A.map((p, i) => [lerp(p[0], B[i][0], t), lerp(p[1], B[i][1], t)]);

  function partPath(g, type, pose, s, cx, cy, sc = 1) {
    const { w, h } = BOUNDS[type];
    const r = (pose.a * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), ys = pose.ys ?? 1;
    g.beginPath();
    TYPES[type].poly.forEach(([x, y], i) => {
      const lx = (x - w / 2) * sc, ly = (y - h / 2) * sc * ys;
      const X = cx + (pose.x * sc + lx * c - ly * sn) * s;
      const Y = cy + (pose.y * sc + lx * sn + ly * c) * s;
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    });
    g.closePath();
  }

  function strokeCollar(g, pts, s, cx, cy, sc, style, outline = 3) {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const X = cx + x * sc * s, Y = cy + y * sc * s;
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    });
    g.lineJoin = 'round';
    g.lineCap = 'butt';
    if (style === 'empty') {
      g.setLineDash([2, 2]); g.strokeStyle = COL.dim; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
      return;
    }
    g.strokeStyle = COL.ink; g.lineWidth = 4 * sc * s + outline; g.stroke();
    g.strokeStyle = TYPES.cuello.color; g.lineWidth = Math.max(1, 4 * sc * s - 1); g.stroke();
  }

  function fillPart(g, type, style, lw = 2) {
    if (style === 'empty') {
      g.fillStyle = 'rgba(255,255,255,0.03)'; g.fill();
      g.setLineDash([2, 2]); g.strokeStyle = COL.dim; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
      return;
    }
    g.fillStyle = TYPES[type].color; g.fill();
    g.strokeStyle = COL.ink; g.lineWidth = lw; g.stroke();
  }

  /** The worn T-shirt; `styleOf(part)` returns 'fill' or 'empty'. */
  function drawShirt(g, cx, cy, s, sc, styleOf, lw = 2) {
    for (const part of PARTS) {
      const style = styleOf(part);
      if (part.type === 'cuello') { strokeCollar(g, WORN.cuello.pts, s, cx, cy, sc, style); continue; }
      partPath(g, part.type, WORN[part.id], s, cx, cy, sc);
      fillPart(g, part.type, style, lw);
    }
  }

  // ------------------------------------------------------------ setup ---

  function newGame() {
    if (G) G.token++;
    // The game is a connector: it sends the order to the engine as a protocol
    // request and keeps the session for live checks, the search and scoring.
    // The game controls the search time itself, so the request's budget is loose.
    const seed = 1000 + counts.S * 7 + counts.M * 31 + counts.L * 131 + counts.XL * 521;
    const job = Garments.request(counts, { width: ROLL_W, gap: GAP, seed, iterations: 1e6, timeMs: 6e5 });
    const S = Arrange.session(job);
    const P = S.problem;   // cells = cm, since the job's cellSize is 1
    const pieces = P.items;
    const groups = new Map();
    for (const piece of pieces) {
      const key = `${piece.data.type}-${piece.data.size}`;
      if (!groups.has(key)) groups.set(key, { piece, ids: [] });
      groups.get(key).ids.push(piece.id);
    }
    const shelf = P.shelf();
    const shelfLen = P.layoutLength(shelf);
    const L = Math.ceil(shelfLen + 20);
    const queue = pieces.map((p) => p.id);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    G = {
      phase: 'play', token: 0, S, P, pieces, groups, shelf, shelfLen, L,
      board: P.board(L),
      placements: [], queue, held: null,
      t0: null, elapsed: 0, timeUp: false, warned: false, autoIds: new Set(),
      searching: false, human: null, algo: null, final: null, from: null,
      shirtsDone: {}, flash: null, lastTick: null, lastCount: null, flown: -1,
    };
    spawn(G.queue.shift());
    showPanel('play');
    setHeading(PLAY_TITLE, PLAY_SUB);
    setStep(3);
    $('keys').style.visibility = '';
    renderOrder();
    updateSide();
    resize();
  }

  function setHeading(title, sub) {
    $('stageTitle').textContent = title;
    $('stageSub').textContent = sub;
  }

  /** Header rail: 1 Playeras · 2 Piezas · 3 Tu tendido · 4 TelaTetris · 5 Ahorro. */
  function setStep(n) {
    for (let i = 1; i <= 5; i++) {
      const el = $(`step${i}`);
      el.classList.toggle('done', i < n);
      el.classList.toggle('on', i === n);
      el.classList.toggle('tt', i === n && i === 4);
    }
  }

  const totalShirts = () => Object.values(counts).reduce((a, b) => a + b, 0);

  function renderOrder() {
    const box = $('sizes');
    box.innerHTML = '';
    const total = totalShirts();
    for (const size of Object.keys(Garments.SIZE_SCALE)) {
      const el = document.createElement('div');
      el.className = counts[size] ? 'size' : 'size zero';
      sizeCards[size] = el;
      const icon = document.createElement('canvas');
      icon.setAttribute('aria-hidden', 'true');
      shirtIcons[size] = icon;
      const name = document.createElement('b');
      name.textContent = size;
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.setAttribute('aria-label', `menos playeras ${size}`);
      const n = document.createElement('span');
      n.textContent = String(counts[size]);
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.setAttribute('aria-label', `más playeras ${size}`);
      minus.disabled = counts[size] === 0 || total === 1;
      plus.disabled = counts[size] >= MAX_PER_SIZE;
      minus.onclick = () => changeOrder(size, -1);
      plus.onclick = () => changeOrder(size, +1);
      if (refocus && refocus.size === size) {
        const target = (refocus.d > 0 ? plus : minus).disabled ? (refocus.d > 0 ? minus : plus) : (refocus.d > 0 ? plus : minus);
        refocusEl = target;
      }
      stepper.appendChild(minus); stepper.appendChild(n); stepper.appendChild(plus);
      el.appendChild(icon); el.appendChild(name); el.appendChild(stepper);
      box.appendChild(el);
    }
    $('orderShirts').textContent = `${total} ${total === 1 ? 'playera' : 'playeras'}`;
  }

  function changeOrder(size, d) {
    if (intro) endIntro();
    if (G && G.phase === 'move') return;
    if (G && (G.phase === 'play' || G.phase === 'review') && G.placements.length > 0 &&
        !confirm('Cambiar el pedido reinicia el tendido. ¿Continuar?')) return;
    counts[size] = Math.max(0, Math.min(MAX_PER_SIZE, counts[size] + d));
    const own = focusedControl();
    refocus = own ? { size, d } : null;
    newGame();
    if (refocusEl && refocusEl.focus) refocusEl.focus();
    refocus = null; refocusEl = null;
  }

  // -------------------------------------------------------- held piece ---

  // Placements in protocol form ({item, rotation, x, y} in cm) and in the
  // game's own form ({id, rot, x, y} in cells). With 1 cm cells only the
  // field names differ.
  const toJob = (p) => ({ item: p.id, rotation: p.rot, x: p.x, y: p.y });
  const fromJob = (p) => ({ id: p.item, rot: p.rotation, x: p.x, y: p.y });

  function variant(id, rot) { return Arrange.variantOf(G.pieces[id], rot); }

  function cutLength(placements = G.placements) { return G.P.layoutLength(placements); }

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
    h.ok = G.board.fitsVariant(v, h.x, h.y);
    h.ghost = null;
    if (h.ok) {
      let gx = h.x;
      while (gx - 1 >= GAP && G.board.fitsVariant(v, gx - 1, h.y)) gx--;
      h.ghost = gx;
    }
    requestRender();
  }

  function startClock() { if (G.t0 === null) G.t0 = performance.now(); }

  /** Complete T-shirts of one size whose every piece is on the roll. */
  function shirtsDone(size, placements = G.placements) {
    const placed = {};
    for (const p of placements) {
      const d = G.pieces[p.id].data;
      if (d.size === size) placed[d.type] = (placed[d.type] || 0) + 1;
    }
    return Math.min(...Garments.GARMENT.map(([type, qty]) => Math.floor((placed[type] || 0) / qty)));
  }

  function place() {
    const h = G.held;
    if (!h) return;
    if (!h.ok) { sfx('bad'); toast('Se traslapa o se sale del rollo'); return; }
    startClock();
    const piece = G.pieces[h.id];
    G.board.place(piece, h.rot, h.x, h.y);
    G.placements.push({ id: h.id, rot: h.rot, x: h.x, y: h.y });
    G.flash = { id: h.id, rot: h.rot, x: h.x, y: h.y, t0: performance.now() };
    const at = { x: h.x, y: h.y };
    G.held = null;
    ensureRoom();

    const { type, size } = piece.data;
    const done = shirtsDone(size);
    if (done > (G.shirtsDone[size] || 0)) {
      const of = counts[size];
      const r = canvas.getBoundingClientRect();
      shout(`¡PLAYERA ${size}!`, {
        kind: 'pop', size: 16, dur: 1900, sub: of > 1 ? `lista · ${done} de ${of}` : 'lista',
        x: r.left + view.ox + (at.x + piece.w / 2) * view.s, y: r.top + view.oy + (at.y + piece.h / 2) * view.s,
      });
      sfx('shirt');
    } else {
      sfx('place');
    }
    G.shirtsDone[size] = done;

    if (G.queue.length) {
      const next = G.queue.findIndex((id) => {
        const data = G.pieces[id].data;
        return data.type === type && data.size === size;
      });
      spawn(G.queue.splice(next < 0 ? 0 : next, 1)[0]);
    }
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
    if (h.ghost === null) { sfx('bad'); toast('Primero mueve la pieza a un lugar libre'); return; }
    h.x = h.ghost;
    h.ok = true;
    place();
  }

  function rotate() {
    const h = G.held;
    if (!h) return;
    // One quarter turn clockwise, about the piece's centre.
    const rs = G.pieces[h.id].rotations;
    const before = variant(h.id, h.rot);
    h.rot = rs[(rs.indexOf(h.rot) + 1) % rs.length];
    const after = variant(h.id, h.rot);
    sfx('rotate');
    setHeld(h.x + Math.round((before.w - after.w) / 2), h.y + Math.round((before.h - after.h) / 2), true);
  }

  function nextPiece() {
    const h = G.held;
    if (!h || !G.queue.length) return;
    G.queue.push(h.id);
    spawn(G.queue.shift(), { x: h.x, y: h.y });
    sfx('select');
    updateSide();
  }

  /** 1–5: hold that piece type; pressing it again moves to the next size that still has one. */
  function pickType(type) {
    const pending = (id) => G.queue.includes(id) || (G.held && G.held.id === id);
    const groups = [...G.groups.values()].filter(({ piece, ids }) => piece.data.type === type && ids.some(pending));
    if (!groups.length) { sfx('bad'); toast(`Ya no quedan piezas: ${TYPES[type].name.toLowerCase()}`); return; }
    const cur = groups.findIndex(({ ids }) => G.held && ids.includes(G.held.id));
    if (cur >= 0 && groups.length === 1) return;
    const next = groups[(cur + 1) % groups.length];
    const i = G.queue.findIndex((id) => next.ids.includes(id));
    if (i >= 0) selectFromQueue(i);
  }

  function selectFromQueue(i) {
    startClock();
    const h = G.held;
    const id = G.queue[i];
    if (h) G.queue[i] = h.id; else G.queue.splice(i, 1);
    spawn(id, h ? { x: h.x, y: h.y } : null);
    sfx('select');
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
    sfx('pick');
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
    growBoard(Math.ceil(need + 40));
    resize();
  }

  function growBoard(L) {
    G.L = L;
    G.board = G.P.board(G.L);
    for (const p of G.placements) G.board.place(G.pieces[p.id], p.rot, p.x, p.y);
  }

  /** Lay out every piece not yet placed in shelves after the cut line. */
  function fillShelves(check = true) {
    const ids = [...(G.held ? [G.held.id] : []), ...G.queue];
    if (!ids.length) return;
    startClock();
    const start = cutLength();
    const shelf = G.P.shelf(ids, start);
    ensureRoom(G.P.layoutLength(shelf) - start);
    for (const p of shelf) {
      G.board.place(G.pieces[p.id], p.rot, p.x, p.y);
      G.placements.push(p);
    }
    G.held = null;
    G.queue = [];
    sfx('place');
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
    sfx('timeUp');
    shout('¡TIEMPO!', { kind: 'big', color: COL.orange, dur: 1700 });
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
    G.human = G.S.evaluate(G.placements.map(toJob));
    G.lastCount = null;
    $('sTime').textContent = fmtClock(Math.max(0, TURN_MS - G.elapsed));
    $('sTime').classList.toggle('low', false);
    if (G.timeUp) {
      const n = G.autoIds.size;
      setHeading('¡Se acabó el tiempo!', n
        ? `Tu tendido: ${G.human.length} cm. ${n === 1 ? 'La pieza que faltaba se acomodó' : `Las ${n} piezas que faltaban se acomodaron`} por estantes.`
        : `Tu tendido: ${G.human.length} cm de rollo.`);
    } else {
      setHeading(`Tu tendido: ${G.human.length} cm de rollo`, 'Ahora TelaTetris reacomoda tus mismas piezas.');
      shout('¡COMPLETO!', { kind: 'big', dur: 1400 });
    }
    $('keys').style.visibility = 'hidden';
    updateSide();
    resize();

    const t0 = performance.now();
    G.reviewT0 = t0;

    // Let the "your result" frame paint before the first (synchronous) pass.
    setTimeout(() => {
      if (!G || G.token !== token) return;
      G.S.reset();
      G.searching = true;
      const loop = () => {
        if (!G || G.token !== token) return;
        G.S.step(20);
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
    if (left !== G.lastCount) {
      if (G.lastCount !== null) sfx('count');
      G.lastCount = left;
    }
    $('bFinish').textContent = `TelaTetris empieza en ${left}…`;
  }

  function cancelReview() {
    G.token++;
    G.phase = 'play';
    G.searching = false;
    G.S.reset();
    setHeading(PLAY_TITLE, PLAY_SUB);
    $('keys').style.visibility = '';
    resize();
  }

  // ------------------------------------- move: the algorithm rearranges ---

  function startMove() {
    if (G.phase !== 'review' || !G.searching) return;
    G.phase = 'move';
    G.token++;
    // The human layout is final here; review undo can no longer change it.
    try {
      if (window.TelaTetrisScores) {
        Promise.resolve(window.TelaTetrisScores.record(G.human.length)).catch(() => {
          console.warn('The human score could not be saved. The game will continue.');
        });
      }
    } catch { console.warn('The human score could not be saved. The game will continue.'); }
    G.result = G.S.result();
    G.final = G.result.placements.map(fromJob);
    G.from = new Map(G.placements.map((p) => [p.id, p]));
    G.stagger = Math.min(120, (MOVE_TOTAL_MS - MOVE_MS) / Math.max(1, G.final.length - 1));
    G.moveDur = (G.final.length - 1) * G.stagger + MOVE_MS;
    G.moveT0 = performance.now();
    G.flown = -1;
    showPanel('solve');
    setStep(4);
    sfx('go');
    shout('TURNO DE TELATETRIS', { color: COL.text, sub: 'Mismas piezas, mismos giros, misma separación.', dur: 2400 });
    $('solveIters').textContent = G.result.stats.iterations.toLocaleString('en-US');
    $('solveHuman').textContent = `${G.human.length} cm`;
    $('solveBest').textContent = `${G.result.length} cm`;
    setHeading('TelaTetris reacomoda tus piezas', 'Mismas piezas, mismos giros, misma separación de corte.');
    resize();

    const anim = () => {
      if (!G || G.phase !== 'move') return;
      const t = performance.now() - G.moveT0;
      const k = Math.min(G.final.length - 1, Math.floor(t / G.stagger));
      while (G.flown < k) sfx('fly', ++G.flown);
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
      // A quarter turn swaps width and height, so travel centre to centre.
      const vf = variant(to.id, from.rot), vt = variant(to.id, to.rot);
      const cx = lerp(from.x + vf.w / 2, to.x + vt.w / 2, e);
      const cy = lerp(from.y + vf.h / 2, to.y + vt.h / 2, e);
      const turn = ((((to.rot - from.rot) % 360) + 540) % 360) - 180;
      return {
        id: to.id,
        rot: from.rot,
        x: cx - vf.w / 2,
        y: cy - vf.h / 2,
        angle: (turn * Math.PI / 180) * e,
        state: p <= 0 ? 'waiting' : 'moving',
      };
    });
  }

  // ---------------------------------------------------------- result ---


  function showResults() {
    G.phase = 'result';
    G.algo = G.result;
    const shelf = G.result.baseline;
    const human = G.human;
    const saved = human.length - G.algo.length;
    const shirts = totalShirts();

    // Step 1 of the engine: each layout's roll length is the fabric to buy.
    const buy = (len) => Garments.purchase(len);
    const me = buy(human.length), tt = buy(G.algo.length), sh = buy(shelf.length);
    const money = me.gtq - tt.gtq;
    const yd = Math.abs(me.yards - tt.yards);
    const price = `a ${gtq(Garments.PRICE_PER_YARD_GTQ, 0)} la yarda`;

    // One message: the savings, at scale. The result hides everything else and
    // keeps the layout below, smaller.
    const SCALE = 1000;
    const shirtsLabel = `${shirts} ${shirts === 1 ? 'playera' : 'playeras'}`;
    const amount = Math.abs(money);
    const head = saved > 0
      ? { cls: 'hero', k: `En ${fmtInt(SCALE)} compras como esta, TelaTetris te ahorra`,
          sub: `${gtq(amount)} en esta compra de ${shirtsLabel} · ${yd.toFixed(2)} yd menos de tela` }
      : saved < 0
        ? { cls: 'hero lose', k: `¡Le ganaste a TelaTetris! En ${fmtInt(SCALE)} compras ahorrarías`,
            sub: `${gtq(amount)} menos que TelaTetris en esta compra de ${shirtsLabel}` }
        : { cls: 'hero tie', k: 'Empate con TelaTetris', sub: 'Tu tendido cuesta lo mismo que el suyo.' };
    const max = Math.max(me.gtq, tt.gtq);
    const bar = (cls, name, b) => `
        <div class="hbar ${cls}"><span class="hb-name">${name}</span><span class="hb-track"><i style="--w:${((b.gtq / max) * 100).toFixed(1)}%"></i></span><span class="hb-val">${gtq(b.gtq)}</span></div>`;
    const hero = $('hero');
    hero.className = head.cls;
    hero.innerHTML = `
      <div class="hero-main">
        <div class="hero-k">${head.k}</div>
        <div class="hero-big" id="heroBig">Q0</div>
        <div class="hero-sub">${head.sub}</div>
      </div>
      <div class="hero-side">
        <div class="hero-bars">
          <div class="hb-title">Tela de esta compra</div>${bar('me', 'Tú', me)}${bar('tt', 'TelaTetris', tt)}
          <p class="hero-note">${price}</p>
        </div>
        <div class="hero-actions">
          <a class="btn primary hero-platform" href="../planner/index.html">Ir a la plataforma</a>
          <button class="btn hero-again" id="bAgainHero">Jugar otra vez <kbd>Enter</kbd></button>
        </div>
      </div>`;
    hero.hidden = false;
    $('bAgainHero').onclick = () => { newGame(); sfx('start'); };
    fitText($('heroBig'), gtq(amount * SCALE, 0));
    countUp($('heroBig'), amount * SCALE, (v) => gtq(v, 0), 1600);
    shouts.length = 0;   // a skipped rearrangement leaves its caption behind
    if (saved > 0) { sfx('win'); shout('¡AHORRO!', { kind: 'big', burst: true, dur: 1800 }); }
    else if (saved === 0) { sfx('win'); shout('¡EMPATE!', { kind: 'big', dur: 1700 }); }
    else { sfx('lose'); shout('¡GANASTE!', { kind: 'big', burst: true, color: COL.orange, dur: 1800 }); }

    const shown = Math.min(G.elapsed, TURN_MS);
    const mins = Math.floor(shown / 60000), secs = Math.floor((shown % 60000) / 1000);
    const row = (cls, name, b) => `<tr class="${cls}"><td>${name}</td><td>${b.yards.toFixed(2)} yd</td><td>${gtq(b.gtq)}</td></tr>`;
    $('cmpTable').innerHTML = `
      <tr><th></th><th>Tela a comprar</th><th>Costo</th></tr>
      ${row('me', `Tú <span>(${mins}:${String(secs).padStart(2, '0')}${G.timeUp && G.autoIds.size ? ` · ${G.autoIds.size} por estantes` : ''})</span>`, me)}
      ${row('tt', 'TelaTetris', tt)}
      ${row('ref', 'Por estantes', sh)}`;
    $('cmpNote').textContent = `Rollo de ${ROLL_W} cm de ancho, ${price}.`;

    showPanel('result');
    setStep(5);
    if (focusedControl() === null && $('bAgainHero').focus) $('bAgainHero').focus({ preventScroll: true });
    setHeading(saved > 0 ? 'Mismas playeras, menos gasto en tela.' : 'Las mismas playeras.',
      'Abajo, el acomodo de TelaTetris en el rollo.');
    resize();
    // Fit the headline once the result layout (no side panel) is in place.
    fitText($('heroBig'), gtq(amount * SCALE, 0));
  }

  // ------------------------------------------------------------ side ---

  function showPanel(which) {
    $('playPanel').hidden = which !== 'play';
    $('solvePanel').hidden = which !== 'solve';
    $('resultPanel').hidden = which !== 'result';
    $('hero').hidden = which !== 'result';
    // The result shows only the savings and the layout: no side panel, stats or legend.
    $('app').classList.toggle('result-mode', which === 'result');
    if (which === 'solve') $('solveBar').style.width = '0%';
  }

  function div(className, text) {
    const el = document.createElement('div');
    el.className = className;
    if (text !== undefined) el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function updateSide() {
    if (!G || (G.phase !== 'play' && G.phase !== 'review')) return;
    const q = $('queue');
    q.innerHTML = '';
    tileEls.clear();
    const pending = new Set(G.queue);
    if (G.held) pending.add(G.held.id);

    // Pieces still to place, by size and type: they drive the order card's shirts.
    const left = {};
    for (const id of pending) {
      const d = G.pieces[id].data;
      left[d.size] = left[d.size] || {};
      left[d.size][d.type] = (left[d.size][d.type] || 0) + 1;
    }

    // Matrix: one row per size, one column per pattern piece.
    if (pending.size) {
      q.appendChild(div('qhead', ''));
      Garments.GARMENT.forEach(([type], k) => {
        const head = div('qhead');
        head.innerHTML = `<span class="qk">${k + 1}</span>${TYPES[type].name}`;
        head.title = `Tecla ${k + 1}: ${TYPES[type].name}`;
        q.appendChild(head);
      });
    }
    let rowSize = null;
    for (const { piece, ids } of G.groups.values()) {
      if (!pending.size) break;
      if (piece.data.size !== rowSize) {
        rowSize = piece.data.size;
        q.appendChild(div('qrow', rowSize));
      }
      const remaining = ids.filter((id) => pending.has(id)).length;
      const active = G.held !== null && ids.includes(G.held.id);
      const b = document.createElement('button');
      const key = `${piece.data.type}-${piece.data.size}`;
      tileEls.set(key, b);
      if (intro) b.className = tileHidden(key) ? 'out' : 'in';
      const label = `${piece.data.name} · ${piece.data.size}`;
      b.title = `${label}: ${remaining} ${remaining === 1 ? 'pieza restante' : 'piezas restantes'}`;
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(active));
      b.disabled = remaining === 0;
      const c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      b.appendChild(c);
      const count = document.createElement('span');
      count.className = 'queue-count';
      count.textContent = `×${remaining}`;
      b.appendChild(count);
      const name = document.createElement('span');
      name.className = 'sr';
      name.textContent = label;
      b.appendChild(name);
      b.onclick = () => {
        if (active) return;
        const i = G.queue.findIndex((id) => ids.includes(id));
        if (i >= 0) selectFromQueue(i);
      };
      q.appendChild(b);
      requestAnimationFrame(() => drawMini(c, piece));
    }
    if (!pending.size) {
      const e = document.createElement('div');
      e.className = 'queue-empty';
      e.textContent = 'Todas las piezas están en el rollo.';
      q.appendChild(e);
    }

    let done = 0;
    for (const size of Object.keys(Garments.SIZE_SCALE)) {
      if (!counts[size]) continue;
      G.shirtsDone[size] = shirtsDone(size);
      done += G.shirtsDone[size];
    }
    const total = totalShirts();
    $('orderMeta').innerHTML = `<b>${done}/${total}</b> playeras completas en el rollo · ${G.pieces.length} piezas · rollo ${ROLL_W} cm`;
    requestAnimationFrame(() => drawShirtIcons(left));

    const n = G.pieces.length, placed = G.placements.length;
    $('sPieces').textContent = `${placed}/${n}`;
    const m = G.P.metrics(G.placements);
    $('sLen').innerHTML = `${m.length}<small>cm</small>`;
    $('sWaste').textContent = placed ? pc(m.waste) : '–';
    $('bUndo').disabled = placed === 0 || G.timeUp;
    $('bRotate').disabled = !G.held;
    $('bShelf').disabled = !G.held && !G.queue.length;
    const reviewing = G.phase === 'review';
    $('bFinish').hidden = !reviewing;
    if (reviewing) updateCountdown(0);
  }

  /** Each size's shirt keeps the pieces still waiting; placed ones turn to outlines. */
  function drawShirtIcons(left) {
    for (const size of Object.keys(Garments.SIZE_SCALE)) {
      const c = shirtIcons[size];
      if (!c || !c.getContext) continue;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth || 70, h = c.clientHeight || 40;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext('2d');
      if (!g || !g.setTransform) continue;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      // Fit the largest size, so S looks smaller than XL.
      const s = Math.min((w - 6) / (94 * 1.16), (h - 4) / (74 * 1.16));
      const sc = Garments.SIZE_SCALE[size];
      const rem = (left[size]) || {};
      drawShirt(g, w / 2, h / 2 + 1, s, sc, (part) =>
        (counts[size] && (rem[part.type] || 0) >= part.k ? 'fill' : 'empty'), 1);
    }
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
    const sec = Math.ceil(left / 1000);
    if (sec <= 10 && sec > 0 && sec !== G.lastTick) { G.lastTick = sec; sfx('tick'); }
    if (left <= 10000 && !G.warned) { G.warned = true; shout('¡10 SEGUNDOS!', { color: COL.orange, dur: 1700 }); }
    if (left <= 0) timeUp();
  }
  setInterval(tickClock, 200);

  function drawMini(c, piece) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 50, h = c.clientHeight || 36;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min((w - 8) / piece.w, (h - 8) / piece.h, 1.2);
    drawPiece(g, piece, 0, (w - piece.w * s) / 2, (h - piece.h * s) / 2 + 2, s, { noLabel: true, thin: true });
  }

  // ---------------------------------------------------------- render ---

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  const PAD = 14, LABEL_H = 30, RULER_H = 24;

  // Laptop screens: the board fills the space the layout leaves it.
  // Narrow screens: the board's height follows its width and the page scrolls.
  function fitMode() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 981px) and (min-height: 560px)').matches);
  }

  function resize() {
    const wrap = $('canvasWrap');
    const cssW = wrap.clientWidth || 900;
    const labelH = cssW < 600 ? LABEL_H + 16 : LABEL_H;
    let showL = displayLength();
    let cssH, s;
    if (fitMode()) {
      cssH = Math.max(220, wrap.clientHeight || 420);
      s = Math.max(0.6, Math.min((cssW - 2 * PAD) / showL, (cssH - labelH - RULER_H - 6) / ROLL_W));
      canvas.style.height = '';
    } else {
      const maxH = Math.max(280, (window.innerHeight || 800) * 0.6);
      s = Math.max(0.6, Math.min((cssW - 2 * PAD) / showL, (maxH - labelH - RULER_H - 6) / ROLL_W));
      cssH = Math.ceil(labelH + ROLL_W * s + RULER_H + 6);
      canvas.style.height = `${cssH}px`;
    }
    // Show the whole frame's worth of roll; while playing, all of it is usable.
    showL = Math.max(showL, Math.floor((cssW - 2 * PAD) / s));
    if (G && G.phase === 'play' && showL > G.L) growBoard(showL);
    const oy = Math.round(labelH + Math.max(0, (cssH - labelH - RULER_H - 6 - ROLL_W * s) / 2));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view = { cssW, cssH, s, dpr, ox: PAD, oy, showL };
    fxResize();
    hatch = null;
    requestRender();
  }

  // The roll on screen: the playable length while placing, then just enough
  // to frame the player's layout and TelaTetris's.
  function displayLength() {
    if (!G) return 300;
    if (G.phase === 'play') return G.L;
    // After play, frame both layouts instead of the spare roll left for placing.
    let L = cutLength() + 30;
    if (G.final) L = Math.max(L, G.P.layoutLength(G.final) + 30);
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
      drawFlash(g, ox, oy, s);
      if (!intro) drawHeld(g, ox, oy, s);
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
      if (G.algo.length < humanLen) box(g, ox, oy, s, { from: G.algo.length, to: humanLen }, COL.yellow, 'MENOS TELA');
      else if (G.algo.length > humanLen) box(g, ox, oy, s, { from: humanLen, to: G.algo.length }, COL.orange, 'VENTAJA TUYA');
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

    drawCut(g, ox, oy, s, humanLen, done ? COL.orange : 'rgba(249,83,0,0.6)', `Tu corte · ${humanLen} cm`, 'right', view.cssW < 600 ? 1 : 0);
    if (extent < humanLen - 2 || done) {
      drawCut(g, ox, oy, s, extent, COL.yellow, `TelaTetris · ${extent} cm`, 'left');
    }
    drawRuler(g, ox, oy, s, showL);
  }

  function drawRoll(g, ox, oy, s, L, cut) {
    const W = ROLL_W * s, len = L * s;
    g.fillStyle = COL.roll;
    g.fillRect(ox, oy, len, W);
    // 50 cm guides, then a dot every 10 cm (the Labs dot grid).
    g.fillStyle = COL.line50;
    for (let x = 50; x < L; x += 50) g.fillRect(Math.round(ox + x * s), oy, 1, W);
    for (let y = 50; y < ROLL_W; y += 50) g.fillRect(ox, Math.round(oy + y * s), len, 1);
    for (let x = 10; x < L; x += 10) {
      for (let y = 10; y < ROLL_W; y += 10) {
        const big = x % 50 === 0 && y % 50 === 0;
        const d = big ? 3 : 2;
        g.fillStyle = big ? COL.dot50 : COL.dot;
        g.fillRect(Math.round(ox + x * s - d / 2), Math.round(oy + y * s - d / 2), d, d);
      }
    }
    if (cut > 0) {
      g.fillStyle = hatchPattern(g);
      g.fillRect(ox, oy, cut * s, W);
    }
    g.fillStyle = COL.edge;
    g.fillRect(ox, oy - 2, len, 2);
    g.fillRect(ox, oy + W, len, 2);
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

  /** A white lock flash on the piece that was just placed. */
  function drawFlash(g, ox, oy, s) {
    const f = G.flash;
    if (!f) return;
    const p = (performance.now() - f.t0) / 260;
    if (p >= 1 || reducedMotion) { G.flash = null; return; }
    const v = variant(f.id, f.rot);
    tracePoly(g, v.poly, ox + f.x * s, oy + f.y * s, s);
    g.fillStyle = `rgba(255,255,255,${0.55 * (1 - p)})`;
    g.fill();
    g.strokeStyle = `rgba(255,255,255,${1 - p})`;
    g.lineWidth = 3;
    g.stroke();
    requestRender();
  }

  function drawCut(g, ox, oy, s, at, color, label, side, row = 0) {
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
    g.fillText(label, tx, oy - 9 - row * 16);
  }

  function drawRuler(g, ox, oy, s, L) {
    const W = ROLL_W * s;
    g.fillStyle = COL.dim;
    g.font = `500 11px ${FONT}`;
    g.textBaseline = 'top';
    for (let x = 0; x <= L; x += 10) {
      const major = x % 50 === 0;
      g.fillRect(Math.round(ox + x * s), oy + W + 3, 1, major ? 7 : 4);
      if (major && x > 0 && x < L - 22) g.fillText(String(x), ox + x * s - 8, oy + W + 11);
    }
    g.fillText('cm', ox + L * s - 16, oy + W + 11);
  }

  /** "You used X cm" slab over the empty part of the roll. */
  function drawBanner(g, ox, oy, s, L) {
    const h = G.human;
    const W = ROLL_W * s;
    const freeFrom = ox + h.length * s, freeTo = ox + L * s;
    const bw = Math.max(250, Math.min(340, freeTo - freeFrom - 30));
    const bh = Math.min(W - 16, 184);
    const roomy = freeTo - freeFrom >= bw + 24;
    const cx = roomy ? (freeFrom + freeTo) / 2 : ox + (L * s) / 2;
    const x = Math.round(cx - bw / 2), y = Math.round(oy + (W - bh) / 2);
    const k = bh / 184;
    g.fillStyle = COL.black;
    g.fillRect(x + 6, y + 6, bw, bh);
    g.fillStyle = COL.orange;
    g.fillRect(x, y, bw, bh);

    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = COL.black;
    g.font = `400 9px ${PIX}`;
    g.fillText(G.timeUp ? '¡SE ACABÓ EL TIEMPO!' : 'TU TENDIDO', cx, y + 28 * k);
    g.font = `400 ${Math.round(30 * k)}px ${PIX}`;
    g.fillText(`${h.length} cm`, cx, y + 76 * k);
    g.font = `700 14px ${FONT}`;
    const b = Garments.purchase(h.length);
    g.fillText(`${b.yards.toFixed(2)} yd · ${gtq(b.gtq)} de tela`, cx, y + 104 * k);
    g.font = `600 12px ${FONT}`;
    const n = G.timeUp ? G.autoIds.size : 0;
    g.fillText(n ? `${n} ${n === 1 ? 'pieza' : 'piezas'} por estantes` : `${pc(h.utilization)} de la tela aprovechada`, cx, y + 124 * k);
    // countdown bar
    const p = G.reviewT0 ? Math.min(1, (performance.now() - G.reviewT0) / REVIEW_MS) : 0;
    g.fillStyle = 'rgba(28,28,27,0.25)';
    g.fillRect(x + 24, y + bh - 40 * k, bw - 48, 8);
    g.fillStyle = COL.black;
    g.fillRect(x + 24, y + bh - 40 * k, Math.round((bw - 48) * p / 0.125) * 0.125, 8);
    g.font = `400 8px ${PIX}`;
    g.fillText(`TELATETRIS EN ${Math.max(1, Math.ceil(REVIEW_MS * (1 - p) / 1000))}`, cx, y + bh - 14 * k);
    g.textAlign = 'left';
  }

  function box(g, ox, oy, s, r, color, label) {
    const x = ox + r.from * s, w = (r.to - r.from) * s, H = ROLL_W * s;
    g.fillStyle = color === COL.yellow ? 'rgba(232,251,91,0.14)' : 'rgba(249,83,0,0.16)';
    g.fillRect(x, oy, w, H);
    g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.strokeRect(x + 1, oy + 1, w - 2, H - 2);
    g.setLineDash([]);
    if (w > 70) {
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const big = Math.round(Math.min(16, Math.max(10, w / 12)));
      g.font = `400 ${big}px ${PIX}`;
      g.fillText(`${Garments.purchase(r.to - r.from).yards.toFixed(2)} yd`, x + w / 2, oy + H / 2 - 12);
      g.font = `400 8px ${PIX}`;
      g.fillText(label, x + w / 2, oy + H / 2 + big / 2 + 8);
      g.textAlign = 'left';
    }
  }

  /** Draw a piece turned by `angle` around its own centre (quarter and half turns). */
  function drawPieceRotated(g, piece, rot, px, py, s, angle, o) {
    if (!angle) { drawPiece(g, piece, rot, px, py, s, o); return; }
    const v = Arrange.variantOf(piece, rot);
    const hw = (v.w * s) / 2, hh = (v.h * s) / 2;
    g.save();
    g.translate(px + hw, py + hh);
    g.rotate(angle);
    drawPiece(g, piece, rot, -hw, -hh, s, { ...o, noLabel: true });
    g.restore();
  }

  function tracePoly(g, poly, px, py, s) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(px + x * s, py + y * s) : g.moveTo(px + x * s, py + y * s)));
    g.closePath();
  }

  function drawPiece(g, piece, rot, px, py, s, o) {
    const v = Arrange.variantOf(piece, rot);
    if (o.ghost) {
      tracePoly(g, v.poly, px, py, s);
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
      return;
    }
    if (o.bad) {
      tracePoly(g, v.poly, px, py, s);
      g.fillStyle = 'rgba(28,28,27,0.82)';
      g.fill();
      g.strokeStyle = COL.orange; g.lineWidth = 3; g.setLineDash([5, 4]);
      g.stroke();
      g.setLineDash([]);
      // ✕ in the middle
      const cx = px + (v.w * s) / 2, cy = py + (v.h * s) / 2, r = Math.min(10, v.w * s / 4, v.h * s / 4);
      g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r);
      g.stroke();
      return;
    }
    if (o.held) {
      tracePoly(g, v.poly, px + 5, py + 5, s);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fill();
    }
    tracePoly(g, v.poly, px, py, s);
    const a = g.globalAlpha;
    g.fillStyle = piece.data.color;
    if (o.held) g.globalAlpha = a * 0.94;
    g.fill();
    g.globalAlpha = a;
    g.shadowColor = 'transparent';
    g.strokeStyle = o.held || o.lifted ? '#ffffff' : COL.ink;
    g.lineWidth = o.thin ? 1.25 : 2;
    g.stroke();

    // grain line: a double arrow along the piece's grain, which turns with it
    const vert = rot % 180 !== 0;
    const along = vert ? v.h : v.w, across = vert ? v.w : v.h;
    if (piece.data.arrow && along * s > 26) {
      const off0 = piece.data.type === 'manga' ? 0.58 : 0.55;
      const off = rot === 0 || rot === 90 ? off0 : 1 - off0;
      const cx = vert ? px + (v.w * s) / 2 : px + v.w * s * off;
      const cy = vert ? py + v.h * s * off : py + (v.h * s) / 2;
      const half = Math.min(along * 0.22, 14) * s;
      const hs = Math.max(3, Math.min(6, s * 2));
      g.save();
      g.translate(cx, cy);
      if (vert) g.rotate(Math.PI / 2);
      g.strokeStyle = COL.olive; g.fillStyle = COL.olive; g.lineWidth = Math.max(1, Math.min(1.6, s * 0.6));
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath();
      g.moveTo(-half, 0); g.lineTo(-half + hs * 1.4, -hs); g.lineTo(-half + hs * 1.4, hs); g.closePath();
      g.moveTo(half, 0); g.lineTo(half - hs * 1.4, -hs); g.lineTo(half - hs * 1.4, hs); g.closePath();
      g.fill();
      g.restore();
      if (across * s > 50 && !o.noLabel) {
        g.fillStyle = COL.olive;
        g.font = `700 ${Math.max(9, Math.min(12, s * 4))}px ${FONT}`;
        if (vert) { g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(piece.data.size, cx + hs + 4, cy); }
        else { g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(piece.data.size, cx, cy + hs + 3); }
        g.textAlign = 'left';
      }
    }
  }

  // -------------------------------------------------------- announcer ---
  // Fighting-game call-outs on a full-screen overlay: words slam in large,
  // shake on impact and slide away. Kinds: 'caption' (on a slanted band over
  // the stage), 'big' (centre of the stage), 'pop' (small, at a point).

  const fxCanvas = $('fx');
  const fxg = fxCanvas && fxCanvas.getContext ? fxCanvas.getContext('2d') : null;
  let fxView = { w: 0, h: 0, dpr: 1 };
  let fxRunning = false;
  const shouts = [];
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const SHADE = { [COL.yellow]: '#a9bb22', [COL.orange]: '#b33b00', [COL.text]: '#bdbdb8' };

  function fxResize() {
    if (!fxCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth || 0, h = window.innerHeight || 0;
    fxCanvas.width = Math.round(w * dpr);
    fxCanvas.height = Math.round(h * dpr);
    fxView = { w, h, dpr };
  }

  function shout(text, o = {}) {
    shouts.push({ text, t0: performance.now(), dur: 1300, kind: 'caption', color: COL.yellow, ...o });
    runFx();
  }

  function runFx() {
    if (fxRunning || !fxg) return;
    fxRunning = true;
    requestAnimationFrame(fxFrame);
  }

  function fxFrame() {
    const g = fxg;
    const now = performance.now();
    g.setTransform(fxView.dpr, 0, 0, fxView.dpr, 0, 0);
    g.clearRect(0, 0, fxView.w, fxView.h);
    if (intro) drawJourney(g, introT(now));
    for (let i = shouts.length - 1; i >= 0; i--) if (now - shouts[i].t0 > shouts[i].dur) shouts.splice(i, 1);
    for (const s of shouts) drawShout(g, s, now - s.t0);
    if (intro || shouts.length) requestAnimationFrame(fxFrame);
    else { g.clearRect(0, 0, fxView.w, fxView.h); fxRunning = false; }
  }

  const stageRect = () => $('canvasWrap').getBoundingClientRect();

  /** Pixel text, italic-sheared, with a thick outline, a drop layer and a glossy fill. */
  function slamText(g, text, x, y, size, sc, alpha, color, flash) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.transform(1, 0, -0.2, 1, 0, 0);
    g.scale(sc, sc);
    g.font = `400 ${size}px ${PIX}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const d = Math.max(3, size * 0.1);
    g.lineWidth = Math.max(5, size * 0.34);
    g.strokeStyle = COL.black;
    g.strokeText(text, d, d);
    g.fillStyle = color === COL.orange ? COL.yellow : COL.orange;
    g.fillText(text, d, d);
    g.strokeText(text, 0, 0);
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.42, color);
    gr.addColorStop(1, SHADE[color] || color);
    g.fillStyle = gr;
    g.fillText(text, 0, 0);
    if (flash > 0) { g.globalAlpha = alpha * flash; g.fillStyle = '#ffffff'; g.fillText(text, 0, 0); }
    g.restore();
  }

  function drawShout(g, s, age) {
    const r = stageRect();
    const IN = s.kind === 'pop' ? 160 : 240, OUT = 260;
    const kin = clamp01(age / IN), kout = clamp01((age - (s.dur - OUT)) / OUT);
    const still = reducedMotion;
    // Zoom in from far, wobble on impact, then leave.
    let sc = still ? 1 : kin < 1 ? lerp(s.kind === 'pop' ? 2 : 3, 1, easeOut(kin))
      : 1 + 0.06 * Math.exp(-(age - IN) / 80) * Math.sin((age - IN) / 16);
    const hit = age - IN;
    const amp = still || hit < 0 || hit > 200 ? 0 : (s.kind === 'pop' ? 3 : 8) * (1 - hit / 200);
    const jx = (Math.random() - 0.5) * 2 * amp, jy = (Math.random() - 0.5) * 2 * amp;
    const flash = hit >= 0 && hit < 160 ? 1 - hit / 160 : 0;
    let alpha = Math.min(1, kin * 2) * (1 - kout);

    if (s.kind === 'caption') {
      const cx = r.left + r.width / 2;
      const y = s.y !== undefined ? s.y : r.top + Math.min(86, r.height * 0.16);
      const size = Math.round(Math.max(12, Math.min(30, (r.width * 0.86) / (s.text.length * 1.12))));
      const bandH = size * 2 + (s.sub ? 30 : 0);
      const bw = r.width * 0.86;
      const slide = still ? 0 : (1 - easeOut(clamp01(age / 230))) * -fxView.w + easeOut(kout) * fxView.w;
      g.save();
      g.globalAlpha = Math.min(1, age / 120) * (1 - kout * 0.6);
      g.translate(cx + slide, y);
      g.transform(1, 0, -0.35, 1, 0, 0);
      g.fillStyle = 'rgba(20,20,19,0.93)';
      g.fillRect(-bw / 2, -bandH / 2, bw, bandH);
      g.fillStyle = s.color;
      g.fillRect(-bw / 2, -bandH / 2, bw, 3);
      g.fillRect(-bw / 2, bandH / 2 - 3, bw, 3);
      g.fillRect(-bw / 2, -bandH / 2, 14, bandH);
      g.fillRect(-bw / 2 + 20, -bandH / 2, 5, bandH);
      g.fillRect(bw / 2 - 14, -bandH / 2, 14, bandH);
      g.restore();
      const ty = y - (s.sub ? 13 : 0);
      slamText(g, s.text, cx + jx + (still ? 0 : kout * 160), ty + jy, size, sc, alpha, s.color, flash);
      if (s.sub) {
        const n = still ? s.sub.length : Math.floor(clamp01((age - IN) / 750) * s.sub.length);
        g.save();
        g.globalAlpha = 1 - kout;
        g.font = `600 ${r.width > 700 ? 15 : 12}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = COL.text;
        g.fillText(s.sub.slice(0, n), cx + (still ? 0 : kout * 160), y + size * 0.62 + 8);
        g.restore();
      }
      return;
    }

    if (s.kind === 'big') {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const size = Math.round(Math.max(24, Math.min(104, r.width / (s.text.length * 1.25))));
      sc *= 1 + (still ? 0 : kout * 0.6);
      if (s.burst && !still) {
        const k = clamp01(age / 520);
        g.save();
        g.translate(cx, cy);
        g.globalAlpha = 1 - k;
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2 + 0.2;
          const r0 = size * (0.9 + k * 1.6), r1 = r0 + size * (0.5 + (i % 3) * 0.35) * (1 - k * 0.5);
          g.strokeStyle = i % 2 ? COL.yellow : COL.text;
          g.lineWidth = Math.max(1, 7 * (1 - k));
          g.beginPath();
          g.moveTo(Math.cos(a) * r0 * 1.6, Math.sin(a) * r0);
          g.lineTo(Math.cos(a) * r1 * 1.6, Math.sin(a) * r1);
          g.stroke();
        }
        g.restore();
        if (age < 160) {
          g.fillStyle = `rgba(255,255,255,${0.28 * (1 - age / 160)})`;
          g.fillRect(r.left, r.top, r.width, r.height);
        }
      }
      slamText(g, s.text, cx + jx, cy + jy, size, sc, alpha, s.color, flash);
      return;
    }

    // pop: rises from a point on the board
    const size = s.size || 16;
    const y = s.y - (still ? 0 : easeOut(clamp01(age / s.dur)) * 34);
    const x = Math.max(r.left + 140, Math.min(r.right - 140, s.x));
    alpha = Math.min(1, kin * 2) * (1 - kout);
    slamText(g, s.text, x + jx, y + jy, size, sc, alpha, s.color, flash);
    if (s.sub) {
      g.save();
      g.globalAlpha = alpha;
      g.font = `700 12px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = COL.black;
      g.strokeText(s.sub, x, y + size + 6);
      g.fillStyle = COL.text;
      g.fillText(s.sub, x, y + size + 6);
      g.restore();
    }
  }

  // ---------------------------------------------------------- journey ---
  // Before the first round: the order card's T-shirt rises to the stage, comes
  // apart into its six pattern pieces, the pieces fly into the piece bank,
  // and the round starts with ¿LISTOS? ¡YA!

  // The story, slow enough to read, pauses on the controls screen until OK.
  const T_FLY = 500, T_EXPLODE = 2800, T_BANK = 5200, T_ROLL = 7600, T_CONTROLS = 9600;
  const T_READY = T_CONTROLS + 100, T_GO = T_CONTROLS + 1050, T_END = T_CONTROLS + 1900;
  const FLY_MS = 1000, BURST_MS = 800, LAND_MS = 900, LAND_GAP = 150;
  let swallowClick = 0;

  function introSize() {
    return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), 'M');
  }

  function startIntro() {
    if (!G || G.phase !== 'play' || G.t0 !== null || !fxg) return;
    const size = introSize();
    const n = totalShirts();
    const sizes = Object.keys(counts).filter((k) => counts[k]);
    const cues = [
      [0, () => {
        const card = sizeCards[size];
        if (card) { card.classList.add('pulse'); setTimeout(() => card.classList.remove('pulse'), 1300); }
      }],
      [120, () => shout('UN PEDIDO DE PLAYERAS', { sub: `${n} ${n === 1 ? 'playera' : 'playeras'} · ${sizes.length === 1 ? 'talla' : 'tallas'} ${sizes.join(', ')}`, dur: 2550 })],
      [T_FLY, () => sfx('pop')],
      [T_EXPLODE, () => { sfx('burst'); shout('¡SE DESARMA EN 6 PIEZAS!', { sub: 'delantero · espalda · 2 mangas · cuello · bolsillo', dur: 2300 }); }],
      [T_BANK, () => { sfx('whoosh'); shout('¡AL BANCO DE PIEZAS!', { sub: 'Ahí eliges qué pieza acomodar.', dur: 2300 }); }],
      [T_BANK + 5 * LAND_GAP + LAND_MS + 250, () => revealAllTiles(true)],
      [T_ROLL, () => shout('ACOMÓDALAS EN EL ROLLO', { sub: 'Gana el tendido más corto. Tienes 1:30.', dur: 1950 })],
      [T_CONTROLS, () => openControls()],
      [T_READY, () => { sfx('count'); shout('¿LISTOS?', { kind: 'big', color: COL.text, dur: 900 }); }],
      [T_GO, () => { intro.stage = 'go'; sfx('go'); shout('¡YA!', { kind: 'big', burst: true, dur: 900 }); }],
      [T_END, () => endIntro(false)],
    ];
    intro = {
      t0: performance.now(), cue: 0, step: 0, size, cues, landed: new Set(), revealed: new Set(),
      stage: 'journey', pauseAt: 0,
    };
    $('keys').style.visibility = 'hidden';
    setHeading('Así se hace una playera', 'De la playera a sus piezas, y de las piezas al rollo de tela.');
    updateSide();
    requestRender();
    const tick = () => {
      if (!intro) return;
      const t = introT();
      while (intro && intro.cue < intro.cues.length && t >= intro.cues[intro.cue][0]) intro.cues[intro.cue++][1]();
      if (!intro) return;
      const step = t < T_EXPLODE ? 1 : t < T_ROLL ? 2 : 3;
      if (step !== intro.step) { intro.step = step; setStep(step); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    runFx();
  }

  /** Journey time, frozen while the controls screen waits for OK. */
  function introT(now = performance.now()) {
    return (intro.stage === 'controls' ? intro.pauseAt : now) - intro.t0;
  }

  /** Skip: the story jumps to the controls screen; on it, OK; during ¡YA!, play. */
  function skipIntro() {
    if (!intro) return;
    if (intro.stage === 'journey') {
      shouts.length = 0;
      revealAllTiles(false);
      intro.t0 = performance.now() - T_CONTROLS;
      intro.cue = intro.cues.findIndex(([t]) => t >= T_CONTROLS);
    } else if (intro.stage === 'controls') {
      confirmControls();
    } else {
      endIntro(false);
    }
  }

  function openControls() {
    if (!intro) return;
    intro.stage = 'controls';
    intro.pauseAt = performance.now();
    revealAllTiles(false);
    const el = $('controls');
    el.hidden = false;
    sfx('select');
    if ($('bOk').focus) $('bOk').focus({ preventScroll: true });
  }

  function confirmControls() {
    if (!intro || intro.stage !== 'controls') return;
    intro.t0 += performance.now() - intro.pauseAt;
    intro.stage = 'ready';
    const el = $('controls');
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, reducedMotion ? 0 : 260);
    if ($('bOk').blur) $('bOk').blur();
    sfx('start');
  }

  /** Ends the journey; a skip still gets a short ¡YA!. */
  function endIntro(skipped = true) {
    if (!intro) return;
    if (intro.stage === 'controls') { const el = $('controls'); el.hidden = true; }
    intro = null;
    if (skipped) {
      shouts.length = 0;
      sfx('go');
      shout('¡YA!', { kind: 'big', burst: true, dur: 650 });
    }
    setStep(3);
    setHeading(PLAY_TITLE, PLAY_SUB);
    $('keys').style.visibility = '';
    updateSide();
    requestRender();
  }

  function tileHidden(key) {
    return !!intro && !intro.revealed.has(key);
  }

  function revealTile(key) {
    if (!intro || intro.revealed.has(key)) return;
    intro.revealed.add(key);
    const b = tileEls.get(key);
    if (b) b.className = 'in';
  }

  function revealAllTiles(cascade) {
    if (!intro) return;
    let k = 0;
    for (const key of tileEls.keys()) {
      if (intro.revealed.has(key)) continue;
      if (cascade) setTimeout(() => revealTile(key), 26 * k++);
      else revealTile(key);
    }
  }

  function rectOf(el) {
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return r && r.width ? r : null;
  }

  function spotlight(g, rect, t) {
    if (!rect) return;
    const pad = 6;
    g.clearRect(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
    g.strokeStyle = COL.yellow;
    g.lineWidth = 3;
    g.setLineDash([10, 6]);
    g.lineDashOffset = -t / 30;
    g.strokeRect(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
    g.setLineDash([]);
  }

  function drawJourney(g, t) {
    if (reducedMotion) t = Math.max(t, T_BANK + 5 * LAND_GAP + LAND_MS);
    const stage = stageRect();
    const fade = clamp01(t / 250) * (1 - clamp01((t - T_GO) / 450));
    g.fillStyle = `rgba(12,12,11,${0.8 * fade})`;
    g.fillRect(0, 0, fxView.w, fxView.h);
    if (t < T_EXPLODE) spotlight(g, rectOf($('orderCard')), t);
    else if (t >= T_BANK && t < T_ROLL) spotlight(g, rectOf($('piecesCard')), t);
    else if (t >= T_ROLL && t < T_GO + 200) spotlight(g, stage, t);

    const size = intro.size, sc = Garments.SIZE_SCALE[size];
    const S = Math.min((stage.height * 0.5) / (80 * sc), (stage.width * 0.72) / (212 * sc));
    const cx = stage.left + stage.width / 2, cy = stage.top + stage.height * 0.56;

    // 1 · the shirt rises out of its size card
    if (t < T_EXPLODE) {
      const icon = rectOf(shirtIcons[size]);
      const p = easeBack(clamp01((t - T_FLY) / FLY_MS));
      const s0 = icon ? Math.min((icon.width - 6) / (94 * 1.16), (icon.height - 4) / (74 * 1.16)) : S * 0.2;
      const x0 = icon ? icon.left + icon.width / 2 : cx, y0 = icon ? icon.top + icon.height / 2 : cy;
      const bob = t > T_FLY + FLY_MS && !reducedMotion ? Math.sin((t - T_FLY) / 160) * 3 : 0;
      if (t >= T_FLY) drawShirt(g, lerp(x0, cx, p), lerp(y0, cy, p) + bob, lerp(s0, S, clamp01(p)), sc, () => 'fill', 2);
      return;
    }

    // 2 · it comes apart  ·  3 · the pieces fly into the bank
    PARTS.forEach((part, i) => {
      const p1 = easeBack(clamp01((t - T_EXPLODE - i * 60) / BURST_MS));
      const q = clamp01((t - T_BANK - i * LAND_GAP) / LAND_MS);
      if (q <= 0) {
        if (part.type === 'cuello') {
          const pts = lerpPts(WORN.cuello.pts, collarPts(EXPLODED.cuello), clamp01(p1));
          strokeCollar(g, pts, S, cx, cy, sc, 'fill');
        } else {
          const pose = lerpPose(WORN[part.id], EXPLODED[part.id], p1);
          if (!reducedMotion && t > T_EXPLODE + BURST_MS + 100) pose.y += Math.sin((t + i * 300) / 220) * 1.2;
          partPath(g, part.type, pose, S, cx, cy, sc);
          fillPart(g, part.type, 'fill', 2);
        }
        return;
      }
      const key = `${part.type}-${size}`;
      if (q >= 1) {
        if (!intro.landed.has(part.id)) { intro.landed.add(part.id); revealTile(key); sfx('place'); }
        return;
      }
      const tile = rectOf(tileEls.get(key));
      const E = EXPLODED[part.id];
      const x0 = cx + E.x * sc * S, y0 = cy + E.y * sc * S;
      const { w, h } = BOUNDS[part.type];
      const tw = tile ? tile.width : 50, th = tile ? tile.height : 40;
      const sT = Math.min((tw - 8) / (w * sc), (th - 8) / (h * sc), 1.2);
      const x1 = tile ? tile.left + tw / 2 : 40, y1 = tile ? tile.top + th / 2 + 2 : 300;
      const e = ease(q);
      const lift = Math.min(140, Math.hypot(x1 - x0, y1 - y0) * 0.35) * Math.sin(Math.PI * e);
      const a1 = part.id === 'mangaL' ? 360 : 0;
      const pose = { x: 0, y: 0, a: lerp(E.a, a1, e), ys: 1 };
      partPath(g, part.type, pose, lerp(S, sT, e), lerp(x0, x1, e), lerp(y0, y1, e) - lift, sc);
      fillPart(g, part.type, 'fill', 2);
    });
  }

  // -------------------------------------------------------------- story ---
  // After EMPEZAR: a short adventure-game cutscene. Chepe, a tailor, gets an
  // order for T-shirts, crosses town to the fabric shop, and is asked how many
  // yards he needs. He doesn't know; the game is how he finds out. Player-paced:
  // each line waits for Enter, Space, a click or a controller button.

  const ART_W = 192, ART_H = 108;   // scene resolution; scaled up without smoothing
  const STORY_PAL = {
    k: '#1C1C1B', o: '#3B3D2B', g: '#46423F', d: '#2E2D29', G: '#8F8C85', l: '#CFCFCD', w: '#FFFFFF',
    y: '#E8FB5B', Y: '#C6D64C', r: '#F95300', p: '#E2B48C', b: '#5B3B24',
  };
  // 10×14 sprites, one character per pixel ('.' = clear).
  const SPR = {
    chepeFront: [
      '..kkkkkk..', '.kkkkkkkk.', '.kkppppkk.', '.kpkppkpk.', '.kppppppk.', '..kpppk...',
      '.kyyyyyyk.', 'kyyyyyyyyk', 'kpyyyyyypk', 'kpyyyyyypk', '.kyyyyyyk.', '.kggkkggk.',
      '.kgk..kgk.', '.kkk..kkk.',
    ],
    chepeSideA: [
      '..kkkkk...', '.kkkkkkk..', '.kkkpppk..', '.kkppkpk..', '.kkppppk..', '..kpppk...',
      '..kyyyk...', '.kyyyyyk..', '.kyypyyk..', '.kyypyyk..', '..kyyyk...', '..kgggk...',
      '.kgk.kgk..', '.kk...kk..',
    ],
    chepeSideB: [
      '..kkkkk...', '.kkkkkkk..', '.kkkpppk..', '.kkppkpk..', '.kkppppk..', '..kpppk...',
      '..kyyyk...', '.kyyyyyk..', '.kyyyyyk..', '.kyyyypk..', '..kyyyk...', '..kgggk...',
      '..kgkgk...', '..kkkk....',
    ],
    rosa: [
      '...llll...', '..llllll..', '.llppppll.', '.lpkppkpl.', '.lppppppl.', '..lpprpl..',
      '.kwwwwwwk.', 'kwrrrrrrwk', 'kprrrrrrpk', 'kprrrrrrpk',
    ],
    letter: ['kkkkkkkk', 'kwwwwwwk', 'kkwwwwkk', 'kwkwwkwk', 'kwwkkwwk', 'kkkkkkkk'],
  };

  let story = null;

  function storyBeats() {
    const n = totalShirts();
    const order = Object.keys(counts).filter((k) => counts[k])
      .map((k) => `${counts[k] === 1 ? 'una' : counts[k] === 2 ? 'dos' : counts[k] === 3 ? 'tres' : 'cuatro'} ${k}`);
    const list = order.length > 1 ? `${order.slice(0, -1).join(', ')} y ${order[order.length - 1]}` : order[0];
    return [
      { scene: 'taller', who: '', text: 'Ciudad de Guatemala. En un pequeño taller de costura...' },
      { scene: 'taller', who: '', text: '¡Llega un pedido nuevo!', letter: true, sfx: 'pop' },
      { scene: 'taller', who: 'CHEPE', text: `¡${n} ${n === 1 ? 'playera' : 'playeras'}! ${list[0].toUpperCase()}${list.slice(1)}.`, letter: true, order: true },
      { scene: 'taller', who: 'CHEPE', text: 'Primero tengo que comprar la tela. ¡A la tienda!', order: true },
      { scene: 'mapa', who: '', text: 'Chepe cruza el pueblo en busca de la tienda de telas...', walk: true, sfx: 'whoosh' },
      { scene: 'tienda', who: 'DOÑA ROSA', text: '¡Buenas! Bienvenido a la tienda. ¿Qué le doy?', sfx: 'select' },
      { scene: 'tienda', who: 'CHEPE', text: `Tela de algodón, del rollo de 150 cm, para ${n} ${n === 1 ? 'playera' : 'playeras'}.` },
      { scene: 'tienda', who: 'DOÑA ROSA', text: 'Con gusto. ¿Cuántas yardas le corto?' },
      { scene: 'tienda', who: 'CHEPE', text: '¿Cuántas... yardas? Eh... mmm...', confused: true, sfx: 'bad' },
      { scene: 'tienda', who: '', text: 'Si compra de más, pierde dinero. Si compra de menos, no le alcanza.', confused: true },
      { scene: 'tienda', who: '', text: '¡Ayuda a Chepe a saber cuánta tela comprar!', confused: true },
    ];
  }

  function startStory() {
    const el = $('story');
    if (!el || !fxg) { startIntro(); return; }
    story = { beats: storyBeats(), i: -1, chars: 0, beatT0: 0, sceneT0: 0, scene: null, fadeT0: 0, off: document.createElement('canvas') };
    el.hidden = false;
    setStep(1);
    nextBeat();
    const loop = () => {
      if (!story) return;
      tickStory(performance.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function nextBeat() {
    story.i++;
    if (story.i >= story.beats.length) { endStory(); return; }
    const b = story.beats[story.i];
    const now = performance.now();
    if (b.scene !== story.scene) { story.scene = b.scene; story.sceneT0 = now; story.fadeT0 = now; }
    story.beatT0 = now;
    story.chars = 0;
    story.typed = 0;
    if (b.sfx) sfx(b.sfx);
    $('storyName').textContent = b.who;
    $('storyName').hidden = !b.who;
    $('storyText').textContent = '';
    $('storyBox').classList.toggle('narrator', !b.who);
  }

  /** Finish the line if it's still typing; otherwise go on. */
  function advanceStory() {
    if (!story) return;
    const b = story.beats[story.i];
    if (story.chars < b.text.length) { story.chars = b.text.length; $('storyText').textContent = b.text; return; }
    sfx('select');
    nextBeat();
  }

  function endStory() {
    if (!story) return;
    story = null;
    const el = $('story');
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); startIntro(); }, reducedMotion ? 0 : 320);
  }

  /** For pitches: skip the story, the intro and the controls, straight to the round. */
  function skipToGame() {
    if (story) { story = null; $('story').hidden = true; }
    if (intro) { endIntro(); return; }
    sfx('go');
    shout('¡YA!', { kind: 'big', burst: true, dur: 650 });
    setStep(3);
    setHeading(PLAY_TITLE, PLAY_SUB);
    $('keys').style.visibility = '';
    updateSide();
    requestRender();
  }

  function tickStory(now) {
    const b = story.beats[story.i];
    if (!b) return;
    // typewriter, slow enough to read along
    const want = reducedMotion ? b.text.length : Math.min(b.text.length, Math.floor((now - story.beatT0 - 250) / 34));
    if (want > story.chars) {
      if (Math.floor(want / 3) > Math.floor(story.chars / 3)) sfx('tick');
      story.chars = want;
      $('storyText').textContent = b.text.slice(0, story.chars);
    }
    $('storyBox').classList.toggle('done', story.chars >= b.text.length);
    drawStory(now);
  }

  function sprite(o, rows, x, y, flip = false) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[flip ? row.length - 1 - c : c];
        if (ch === '.') continue;
        o.fillStyle = STORY_PAL[ch];
        o.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }

  function rect(o, x, y, w, h, c) { o.fillStyle = STORY_PAL[c] || c; o.fillRect(x, y, w, h); }

  function tree(o, x, y) {
    rect(o, x + 4, y + 9, 3, 5, 'b');
    rect(o, x + 1, y + 1, 9, 9, 'k');
    rect(o, x, y + 3, 11, 5, 'k');
    rect(o, x + 2, y + 2, 7, 7, 'Y');
    rect(o, x + 1, y + 4, 9, 3, 'Y');
    rect(o, x + 3, y + 3, 3, 2, 'y');
  }

  function drawStory(now) {
    const c = $('storyCanvas');
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const off = story.off;
    if (off.width !== ART_W) { off.width = ART_W; off.height = ART_H; }
    const o = off.getContext('2d');
    const b = story.beats[story.i];
    const st = now - story.sceneT0, bt = now - story.beatT0;
    o.clearRect(0, 0, ART_W, ART_H);
    const labels = [];   // [text, artX, artY, color, size] drawn crisp after scaling

    if (story.scene === 'taller') {
      rect(o, 0, 0, ART_W, 56, 'd');
      rect(o, 0, 54, ART_W, 2, 'k');
      for (let y = 56; y < ART_H; y += 7) { rect(o, 0, y, ART_W, 7, y % 14 ? 'g' : '#4b4743'); rect(o, 0, y, ART_W, 1, 'k'); }
      // window
      rect(o, 18, 10, 32, 24, 'k'); rect(o, 20, 12, 28, 20, 'o'); rect(o, 20, 12, 28, 6, '#55583a');
      rect(o, 33, 12, 2, 20, 'k'); rect(o, 20, 21, 28, 2, 'k');
      // fabric shelf
      rect(o, 128, 14, 40, 3, 'b'); rect(o, 128, 32, 40, 3, 'b');
      [['y', 130], ['r', 140], ['w', 150], ['l', 159]].forEach(([col, x]) => { rect(o, x, 6, 8, 8, 'k'); rect(o, x + 1, 7, 6, 6, col); });
      [['Y', 132], ['y', 142], ['r', 152]].forEach(([col, x]) => { rect(o, x, 24, 8, 8, 'k'); rect(o, x + 1, 25, 6, 6, col); });
      // door
      rect(o, 172, 24, 18, 32, 'k'); rect(o, 174, 26, 14, 30, 'o'); rect(o, 185, 40, 2, 2, 'y');
      // table + sewing machine
      rect(o, 52, 56, 52, 4, 'k'); rect(o, 53, 56, 50, 3, 'G'); rect(o, 56, 60, 3, 14, 'k'); rect(o, 97, 60, 3, 14, 'k');
      rect(o, 62, 42, 26, 14, 'k'); rect(o, 63, 43, 24, 12, 'w'); rect(o, 63, 43, 6, 12, 'l'); rect(o, 80, 47, 4, 9, 'k');
      rect(o, 72, 39, 3, 4, 'r'); rect(o, 66, 55, 18, 1, 'G');
      labels.push(['TALLER', 34, 6, COL.dim, 3]);
      // Chepe
      const bob = reducedMotion ? 0 : Math.round(Math.sin(st / 260));
      sprite(o, SPR.chepeFront, 116, 62 + bob);
      // the order arrives through the door
      if (b.letter) {
        const p = b.order ? 1 : clamp01(bt / 700);
        const lx = lerp(176, 118, ease(p)), ly = lerp(36, 52, ease(p)) - Math.sin(p * Math.PI) * 14;
        if (!b.order || p < 1) sprite(o, SPR.letter, lx, ly);
      }
      if (b.order) {
        rect(o, 60, 12, 72, 30, 'k'); rect(o, 61, 13, 70, 28, 'w'); rect(o, 61, 13, 70, 7, 'y');
        labels.push(['PEDIDO', 96, 14.6, COL.black, 3.4]);
        const sizes = Object.keys(counts).filter((k) => counts[k]);
        sizes.forEach((k, i) => {
          const x = 64 + i * (66 / sizes.length) + 2;
          for (let s = 0; s < counts[k]; s++) {
            const sx = x + s * 6, sy = 24;
            rect(o, sx, sy, 5, 2, 'y'); rect(o, sx - 1, sy + 1, 7, 1, 'y'); rect(o, sx + 1, sy + 2, 3, 3, 'y');
            rect(o, sx - 1, sy, 1, 1, 'k');
          }
          labels.push([`${counts[k]}× ${k}`, x + 8, 32, COL.black, 3]);
        });
      }
    } else if (story.scene === 'mapa') {
      rect(o, 0, 0, ART_W, ART_H, 'o');
      for (let i = 0; i < 90; i++) {
        const x = (i * 53) % ART_W, y = (i * 29 + (i % 5) * 7) % ART_H;
        rect(o, x, y, 1, 1, '#55583a'); rect(o, x + 1, y - 1, 1, 1, '#55583a');
      }
      // path
      rect(o, 26, 64, 146, 10, '#6e6b64'); rect(o, 26, 65, 146, 8, 'G');
      for (let x = 30; x < 170; x += 9) rect(o, x, 68, 3, 1, '#a19e97');
      // workshop
      rect(o, 4, 40, 30, 26, 'k'); rect(o, 6, 46, 26, 19, 'l');
      for (let i = 0; i < 4; i++) rect(o, 4 + i * 2, 40 - i * 3, 30 - i * 4, 4, i % 2 ? 'r' : '#c94400');
      rect(o, 16, 54, 7, 11, 'k'); rect(o, 17, 55, 5, 10, 'b');
      labels.push(['TALLER', 19, 26, COL.text, 3]);
      // fabric shop
      rect(o, 154, 36, 34, 30, 'k'); rect(o, 156, 44, 30, 21, 'w');
      for (let i = 0; i < 4; i++) rect(o, 154 + i * 2, 36 - i * 3, 34 - i * 4, 4, i % 2 ? 'y' : 'Y');
      for (let x = 156; x < 186; x += 6) { rect(o, x, 44, 3, 4, 'y'); rect(o, x + 3, 44, 3, 4, 'w'); }
      rect(o, 166, 54, 8, 11, 'k'); rect(o, 167, 55, 6, 10, 'r');
      rect(o, 158, 50, 6, 5, 'k'); rect(o, 159, 51, 4, 3, 'l'); rect(o, 177, 50, 6, 5, 'k'); rect(o, 178, 51, 4, 3, 'l');
      labels.push(['TELAS', 171, 21, COL.yellow, 3.4]);
      // trees
      [[44, 34], [62, 42], [84, 30], [108, 40], [128, 32], [52, 80], [76, 88], [100, 80], [124, 90], [146, 82], [20, 84], [168, 86]]
        .forEach(([x, y]) => tree(o, x, y));
      // HUD: the order, like an adventure-game inventory
      rect(o, 3, 3, 46, 11, 'k'); rect(o, 4, 4, 44, 9, 'd');
      for (let i = 0; i < totalShirts(); i++) {
        const sx = 7 + i * 7, sy = 6;
        rect(o, sx, sy, 5, 2, 'y'); rect(o, sx - 1, sy + 1, 7, 1, 'y'); rect(o, sx + 1, sy + 2, 3, 3, 'y');
      }
      // Chepe walks to the shop
      const p = reducedMotion ? 1 : clamp01((st - 400) / 4200);
      const x = lerp(22, 160, p);
      const frame = p < 1 && Math.floor(st / 150) % 2 ? SPR.chepeSideB : SPR.chepeSideA;
      sprite(o, frame, x, 54 - (p < 1 && Math.floor(st / 150) % 2 ? 1 : 0));
      if (p < 1 && Math.floor(st / 300) % 2) rect(o, x - 2, 66, 2, 1, 'l');
      if (p >= 1 && Math.floor(st / 400) % 2) labels.push(['!', x + 5, 44, COL.yellow, 6]);
    } else {
      // the shop
      rect(o, 0, 0, ART_W, 60, 'd'); rect(o, 0, 58, ART_W, 2, 'k');
      for (let y = 60; y < ART_H; y += 8) for (let x = 0; x < ART_W; x += 8) rect(o, x, y, 8, 8, ((x + y) / 8) % 2 ? 'g' : '#3d3a37');
      // shelves of rolls
      const cols = ['y', 'r', 'w', 'l', 'Y', 'r', 'y', 'w', 'G', 'y', 'l', 'r', 'Y', 'w'];
      for (let s = 0; s < 3; s++) {
        const y = 8 + s * 16;
        rect(o, 8, y + 12, 176, 3, 'b');
        for (let i = 0; i < 14; i++) {
          const x = 10 + i * 12.4;
          rect(o, x, y + 2, 11, 10, 'k'); rect(o, x + 1, y + 3, 9, 8, cols[(i + s * 5) % cols.length]);
          rect(o, x + 1, y + 3, 2, 8, 'k');
        }
      }
      // counter and the big roll
      rect(o, 98, 66, 90, 4, 'k'); rect(o, 99, 66, 88, 3, 'G'); rect(o, 99, 70, 88, 26, 'g'); rect(o, 99, 70, 88, 2, 'k');
      rect(o, 150, 56, 32, 10, 'k'); rect(o, 151, 57, 30, 8, 'y'); rect(o, 151, 57, 4, 8, 'Y'); rect(o, 177, 57, 4, 8, 'Y');
      labels.push(['150 cm', 166, 52, COL.yellow, 3]);
      // Doña Rosa behind the counter
      const rb = reducedMotion ? 0 : Math.round(Math.sin(st / 330));
      sprite(o, SPR.rosa, 122, 56 + rb);
      // Chepe, puzzled when asked how much
      const shake = b.confused && !reducedMotion && bt < 600 ? Math.round(Math.sin(bt / 30)) : 0;
      const cx = 86;
      sprite(o, SPR.chepeSideA, cx + shake, 64);
      if (b.confused) {
        const t2 = bt / 220;
        labels.push(['?', cx + 2, 52 - Math.abs(Math.sin(t2)) * 3, COL.yellow, 7]);
        labels.push(['?', cx + 12, 48 - Math.abs(Math.sin(t2 + 1.3)) * 3, COL.orange, 5]);
        labels.push(['?', cx - 6, 50 - Math.abs(Math.sin(t2 + 2.1)) * 3, COL.text, 4]);
        if (Math.floor(bt / 500) % 2 === 0) { rect(o, cx + 11, 63, 2, 3, 'l'); rect(o, cx + 12, 66, 1, 1, 'w'); }
      }
    }

    // scale up: cover the screen, keep pixels square
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.black;
    g.fillRect(0, 0, W, H);
    const scale = Math.max(W / ART_W, H / ART_H);
    const dw = ART_W * scale, dh = ART_H * scale;
    const ox = (W - dw) / 2, oy = Math.min(0, (H - dh) / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, ox, oy, dw, dh);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const [text, x, y, color, size] of labels) {
      g.font = `400 ${Math.round(size * scale)}px ${PIX}`;
      if (color !== COL.black) {   // dark text sits on light cards and needs no outline
        g.lineWidth = Math.max(2, scale * 0.9);
        g.strokeStyle = COL.black;
        g.strokeText(text, ox + x * scale, oy + y * scale);
      }
      g.fillStyle = color;
      g.fillText(text, ox + x * scale, oy + y * scale);
    }
    // scene fade-in
    const f = reducedMotion ? 1 : clamp01((now - story.fadeT0) / 350);
    if (f < 1) { g.fillStyle = `rgba(0,0,0,${1 - f})`; g.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------- start screen ---
  // A pixel T-shirt floats and turns; EMPEZAR (or Space) leads into the journey.

  let startOn = false;
  const BACK_COLLAR = [[-8.5, -35.2], [0, -33.4], [8.5, -35.2]];
  const SPARKS = [[0.14, 0.22], [0.86, 0.3], [0.2, 0.74], [0.8, 0.7], [0.5, 0.06], [0.07, 0.48], [0.93, 0.52]];

  function showStart() {
    const el = $('start');
    if (!el || !fxg) return false;
    el.hidden = false;
    startOn = true;
    setStep(1);
    const c = $('startShirt');
    const off = document.createElement('canvas');
    const t0 = performance.now();
    const loop = () => {
      if (!startOn) return;
      drawStartShirt(c, off, performance.now() - t0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if ($('bStart').focus) $('bStart').focus();
    return true;
  }

  function beginFromStart() {
    if (!startOn) return;
    startOn = false;
    sfx('start');
    const el = $('start');
    el.classList.add('leaving');
    const skipStory = typeof location !== 'undefined' && /[?&]story=0\b/.test(location.search);
    setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); if (skipStory) startIntro(); else startStory(); }, reducedMotion ? 0 : 320);
  }

  /** Drawn small and scaled up without smoothing, so the shirt stays pixel art. */
  function drawStartShirt(c, off, t) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const PX = 4;
    const lw = Math.ceil(w / PX), lh = Math.ceil(h / PX);
    if (off.width !== lw || off.height !== lh) { off.width = lw; off.height = lh; }
    const o = off.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, lw, lh);

    const turn = reducedMotion ? 0.45 : t / 1150;
    const cos = Math.cos(turn);
    const sx = Math.sign(cos || 1) * Math.max(0.06, Math.abs(cos));
    const bob = reducedMotion ? 0 : Math.sin(t / 480) * 2.4;
    const s = Math.min((lw * 0.9) / 94, (lh * 0.74) / 74);
    const cx = lw / 2, cy = lh * 0.45;

    // floor shadow: smaller when the shirt floats up or turns edge-on
    o.fillStyle = 'rgba(0,0,0,0.5)';
    o.beginPath();
    o.ellipse(cx, lh * 0.9, lw * 0.3 * (0.55 + 0.45 * Math.abs(cos)) * (1 - bob * 0.03), lh * 0.035, 0, 0, Math.PI * 2);
    o.fill();

    o.save();
    o.translate(cx, cy + bob);
    o.scale(sx, 1);
    if (cos >= 0) {
      drawShirt(o, 0, 0, s, 1, () => 'fill', 1);
    } else {
      // seen from behind: sleeves, the back panel and the back of the collar
      for (const part of PARTS) {
        if (part.id === 'delantero' || part.id === 'bolsillo') continue;
        if (part.type === 'cuello') { strokeCollar(o, BACK_COLLAR, s, 0, 0, 1, 'fill', 1.5); continue; }
        partPath(o, part.type, WORN[part.id], s, 0, 0);
        fillPart(o, part.type, 'fill', 1);
      }
    }
    // turn shading
    o.globalCompositeOperation = 'source-atop';
    o.fillStyle = `rgba(20,20,19,${(1 - Math.abs(cos)) * 0.5})`;
    o.fillRect(-lw, -lh, lw * 2, lh * 2);
    o.restore();
    o.globalCompositeOperation = 'source-over';

    // twinkles
    SPARKS.forEach(([fx, fy], i) => {
      const on = reducedMotion || Math.floor(t / 260 + i * 1.7) % 3 === 0;
      if (!on) return;
      const x = Math.round(fx * lw), y = Math.round(fy * lh);
      o.fillStyle = i % 2 ? COL.yellow : COL.orange;
      o.fillRect(x, y - 1, 1, 3);
      o.fillRect(x - 1, y, 3, 1);
    });

    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, 0, 0, lw * PX, lh * PX);
  }

  // ----------------------------------------------------------- input ---

  let pointer = null;   // last pointer position in cm, or null
  let lastWheel = 0;

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

  const interactive = () => G && !intro && (G.phase === 'play' || G.phase === 'review');

  canvas.addEventListener('pointermove', (e) => {
    if (!G || intro || G.phase !== 'play') return;
    startClock();
    pointer = toCm(e);
    followPointer();
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  window.addEventListener('pointerdown', (e) => {
    if (!intro || intro.stage === 'controls') return;   // the controls screen takes its own clicks
    e.preventDefault();
    e.stopPropagation();
    swallowClick = performance.now();
    skipIntro();
  }, true);
  window.addEventListener('click', (e) => {
    if (performance.now() - swallowClick < 600) { e.preventDefault(); e.stopPropagation(); swallowClick = 0; return; }
    // After a mouse click, hand the keyboard back to the board (keyboard clicks have detail 0).
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && e.detail > 0) setTimeout(() => b.blur(), 0);
  }, true);
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
    if (!G || intro || G.phase !== 'play' || !G.held) return;
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 220) return;   // trackpads send bursts; one quarter turn each
    lastWheel = now;
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
    sfx('bad');
    toast('Se traslapa o se sale del rollo');
  }

  function toggleSound() {
    const on = Sound.toggle();
    const b = $('bSound');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '♪ On' : '♪ Off';
  }

  function help() {
    if (G.phase === 'result') newGame();
    if (G.phase === 'play' && G.t0 === null && !G.placements.length) startStory();
    else toast('La intro se ve antes de empezar o al final');
  }

  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'r', 'R', 'c', 'C', 'z', 'Z', 'Backspace',
    '1', '2', '3', '4', '5'];

  /** A control the player reached with Tab keeps its native keyboard behavior. */
  function focusedControl() {
    const el = document.activeElement;
    return el && el !== document.body && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || (el.tagName === 'A' && el.hasAttribute('href'))) ? el : null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const own = focusedControl();
    if (own && (e.key === 'Enter' || e.key === ' ')) return;
    if (own && e.key === 'Escape') { own.blur(); return; }
    if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
    if (startOn) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); beginFromStart(); }
      return;
    }
    if (story) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceStory(); }
      else if (e.key === 'Escape') { e.preventDefault(); endStory(); }
      else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); skipToGame(); }
      return;
    }
    if (intro) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); skipIntro(); }
      return;
    }
    if (e.key === 'h' || e.key === 'H') { help(); return; }
    if (G.phase === 'move' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); G.moveT0 = -1e9; return; }
    if (G.phase === 'result' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); newGame(); sfx('start'); return; }
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
      case '1': case '2': case '3': case '4': case '5': pickType(Garments.GARMENT[+e.key - 1][0]); break;
      default: undo(); break;   // z, Z, Backspace
    }
  });

  const guard = (fn) => () => { if (intro) endIntro(); fn(); };
  $('bRotate').onclick = guard(() => { startClock(); rotate(); });
  $('bUndo').onclick = guard(undo);
  $('bShelf').onclick = guard(fillShelves);
  $('bFinish').onclick = () => { if (G.phase === 'review') startMove(); };
  $('bAgain').onclick = () => { newGame(); sfx('start'); };
  $('bHelp').onclick = help;
  $('bStart').onclick = beginFromStart;
  $('bSkipStory').onclick = (e) => { e.stopPropagation(); endStory(); };
  $('bSkipAll').onclick = (e) => { e.stopPropagation(); skipToGame(); };
  $('story').addEventListener('click', () => advanceStory());
  $('bOk').onclick = confirmControls;
  $('bSound').onclick = toggleSound;
  if (!Sound.on) { $('bSound').setAttribute('aria-pressed', 'false'); $('bSound').textContent = '♪ Off'; }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------ misc ---

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1300);
  }

  /** Shrinks a line's font until its final text fits its box. */
  function fitText(el, finalText) {
    if (typeof getComputedStyle !== 'function' || !el.style) return;
    el.style.fontSize = '';
    el.textContent = finalText;
    let size = parseFloat(getComputedStyle(el).fontSize) || 0;
    while (size > 20 && el.scrollWidth > el.clientWidth + 1) { size -= 2; el.style.fontSize = `${size}px`; }
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
  const fmtInt = (x) => Math.round(x).toLocaleString('en-US');
  const gtq = (x, d = 2) => `Q${x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

  // ----------------------------------------------------------- gamepad ---
  // Browsers expose Xbox, PlayStation and Switch Pro controllers with the
  // "standard" layout: A/✕ 0, B/○ 1, X/□ 2, Y/△ 3, L1 4, R1 5, L2 6, R2 7,
  // Select 8, Start 9, D-pad 12–15, left stick axes 0–1.
  const BTN = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const DEAD = 0.22;          // stick dead zone
  let padLoop = false;
  let padLast = 0;
  const padPrev = new Map();  // gamepad index → buttons pressed last frame
  const padHold = { dir: null, t0: 0, next: 0 };
  const stick = { x: 0, y: 0 };

  function pads() {
    try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean); } catch (e) { return []; }
  }

  function rumble(ms, strong, weak) {
    for (const gp of pads()) {
      try {
        if (gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      } catch (e) { /* rumble is optional */ }
    }
  }

  function setPadUI(on) {
    if (document.body && document.body.classList) document.body.classList.toggle('pad-on', on);
  }

  function startPadLoop() {
    if (padLoop) return;
    padLoop = true;
    padLast = performance.now();
    requestAnimationFrame(padTick);
  }

  function padTick(now) {
    const list = pads();
    if (!list.length) { padLoop = false; return; }
    const dt = Math.min(0.05, Math.max(0, (now - padLast) / 1000));
    padLast = now;
    for (const gp of list) {
      const prev = padPrev.get(gp.index) || [];
      const pressed = gp.buttons.map((b) => b.pressed || b.value > 0.5);
      padPrev.set(gp.index, pressed);
      const down = (i) => !!pressed[i] && !prev[i];
      if (pressed.some((p, i) => p && !prev[i])) { padActive = true; setPadUI(true); onPadPress(down); }
      padMove(gp, pressed, now, dt);
    }
    requestAnimationFrame(padTick);
  }

  /** Cycles the held piece through the five types; L1 forward, L2 back. */
  function cycleType(dir) {
    const types = Garments.GARMENT.map(([t]) => t);
    const left = (t) => G.queue.some((id) => G.pieces[id].data.type === t);
    const cur = G.held ? types.indexOf(G.pieces[G.held.id].data.type) : -1;
    for (let k = 1; k <= types.length; k++) {
      const t = types[(cur + dir * k + types.length * 2) % types.length];
      if (t !== types[cur] && left(t)) { pickType(t); return; }
    }
  }

  function onPadPress(down) {
    // Any button starts from the start screen and skips the journey.
    if (startOn) { beginFromStart(); return; }
    // In the story, Start skips it and any other button goes to the next line.
    if (story) { if (down(BTN.START)) endStory(); else if (down(BTN.SELECT)) skipToGame(); else advanceStory(); return; }
    // On the controls screen only A or Start means OK; elsewhere any button skips ahead.
    if (intro) { if (intro.stage !== 'controls' || down(BTN.A) || down(BTN.START)) skipIntro(); return; }
    if (G.phase === 'move') { G.moveT0 = -1e9; return; }
    if (G.phase === 'result') { if (down(BTN.A) || down(BTN.START)) { newGame(); sfx('start'); } return; }
    if (G.phase === 'review') {
      if (down(BTN.A) || down(BTN.START)) startMove();
      else if (down(BTN.B)) undo();
      return;
    }
    if (G.phase !== 'play') return;
    pointer = null;
    if (down(BTN.R1) || down(BTN.R2)) { startClock(); rotate(); }
    if (down(BTN.A)) { startClock(); if (G.held) place(); }
    if (down(BTN.X)) { startClock(); hardDrop(); }
    if (down(BTN.B)) undo();
    if (down(BTN.Y)) { startClock(); nextPiece(); }
    if (down(BTN.L1)) { startClock(); cycleType(1); }
    if (down(BTN.L2)) { startClock(); cycleType(-1); }
    if (down(BTN.SELECT)) toggleSound();
  }

  /** D-pad: 1 cm per press, repeating while held (3 cm steps after a second). Stick: speed grows with the push. */
  function padMove(gp, pressed, now, dt) {
    if (startOn || intro || !G || G.phase !== 'play' || !G.held) { padHold.dir = null; stick.x = stick.y = 0; return; }
    const step = (dx, dy) => {
      if (!dx && !dy) return;
      startClock();
      pointer = null;
      setHeld(G.held.x + dx, G.held.y + dy);
    };
    const dx = (pressed[BTN.RIGHT] ? 1 : 0) - (pressed[BTN.LEFT] ? 1 : 0);
    const dy = (pressed[BTN.DOWN] ? 1 : 0) - (pressed[BTN.UP] ? 1 : 0);
    const dir = dx || dy ? `${dx},${dy}` : null;
    if (dir !== padHold.dir) {
      padHold.dir = dir;
      if (dir) { step(dx, dy); padHold.t0 = now; padHold.next = now + 220; }
    } else if (dir && now >= padHold.next) {
      const n = now - padHold.t0 > 1000 ? 3 : 1;
      step(dx * n, dy * n);
      padHold.next = now + 45;
    }
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag > DEAD) {
      const k = Math.min(1, (mag - DEAD) / (1 - DEAD));
      const speed = 12 + 98 * k * k;          // cm per second
      stick.x += (ax / mag) * speed * dt;
      stick.y += (ay / mag) * speed * dt;
      const sx = Math.trunc(stick.x), sy = Math.trunc(stick.y);
      stick.x -= sx; stick.y -= sy;
      step(sx, sy);
    } else {
      stick.x = stick.y = 0;
    }
  }

  window.addEventListener('gamepadconnected', () => { setPadUI(true); toast('Control conectado'); startPadLoop(); });
  window.addEventListener('gamepaddisconnected', () => { if (!pads().length) { setPadUI(false); padActive = false; } });
  if (pads().length) startPadLoop();

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { resize(); updateSide(); });
  newGame();
  // Start screen, then the journey; ?intro=0 skips both (handy at a booth that restarts often).
  if (typeof location !== 'undefined' && !/[?&]intro=0\b/.test(location.search)) showStart();
})();
