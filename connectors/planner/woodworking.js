(function (root) {
  'use strict';
  const PRESETS = {
    recto: { name:'Corte recto a medida', plural:'Cortes a medida', description:'Cortes transversales y longitudinales', length:40, width:20 },
    repisa: { name:'Repisa', plural:'Repisas', description:'Entrepaños y estantes', length:60, width:25 },
    lateral: { name:'Lateral de mueble', plural:'Laterales de mueble', description:'Paneles para muebles y cajoneras', length:80, width:25 },
    liston: { name:'Listón', plural:'Listones', description:'Tiras con corte longitudinal', length:60, width:5 },
    travesano: { name:'Travesaño', plural:'Travesaños', description:'Refuerzos y uniones de bastidor', length:40, width:8 },
    pata: { name:'Pata', plural:'Patas', description:'Piezas rectas para patas', length:70, width:7 },
    inglete: { name:'Inglete de 45°', plural:'Piezas con inglete', description:'Ambos extremos; largo entre puntas exteriores', length:60, width:8, shape:'miter' },
  };
  const DEFAULT_STOCK = { length:240, width:30, thickness:1.8, kerf:3 };
  const MAX_PIECES = 100;
  const EPS = 1e-7;
  function positive(value, name, max = 10000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${name}: usa una medida mayor que 0 y no mayor que ${max}.`);
    return value;
  }
  function normalize(order, stock) {
    if (!order || typeof order !== 'object' || Array.isArray(order)) throw new Error('Agrega piezas para calcular la madera.');
    if (!stock || typeof stock !== 'object') throw new Error('Define las medidas del tablón.');
    const board = {
      length:positive(stock.length, 'Largo del tablón') * 10,
      width:positive(stock.width, 'Ancho del tablón', 2000) * 10,
      thickness:positive(stock.thickness, 'Espesor del tablón', 50) * 10,
      kerf:stock.kerf,
    };
    if (typeof board.kerf !== 'number' || !Number.isFinite(board.kerf) || board.kerf < 0 || board.kerf > 20) throw new Error('El ancho de corte debe estar entre 0 y 20 mm.');
    const pieces = [];
    for (const [type, row] of Object.entries(order)) {
      if (!Object.hasOwn(PRESETS, type)) throw new Error('Selecciona un corte del catálogo de madera.');
      if (!row || typeof row !== 'object') throw new Error('Las medidas de las piezas no son válidas.');
      const length = positive(row.length, `Largo de ${PRESETS[type].name.toLowerCase()}`) * 10;
      const width = positive(row.width, `Ancho de ${PRESETS[type].name.toLowerCase()}`, 2000) * 10;
      if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > MAX_PIECES) throw new Error('Indica entre 1 y 100 piezas enteras por corte.');
      if (length > board.length + EPS || width > board.width + EPS) throw new Error(`${PRESETS[type].name}: ${row.length} × ${row.width} cm no cabe en el tablón de ${stock.length} × ${stock.width} cm. Ajusta la pieza o el tablón; se conserva la dirección de la fibra.`);
      if (PRESETS[type].shape === 'miter' && length <= 2 * width) throw new Error('Para el inglete de 45°, el largo exterior debe ser mayor que el doble del ancho.');
      for (let copy = 0; copy < row.quantity; copy++) {
        if (pieces.length >= MAX_PIECES) throw new Error('Puedes calcular hasta 100 piezas por pedido.');
        pieces.push({ id:pieces.length + 1, type, name:PRESETS[type].name, length, width, shape:PRESETS[type].shape || 'rectangle' });
      }
    }
    if (!pieces.length) throw new Error('Agrega al menos una pieza para calcular la madera.');
    return { board, pieces };
  }
  function partition(space, piece, kerf, mode) {
    const right = Math.max(0, space.length - piece.length - kerf);
    const bottom = Math.max(0, space.width - piece.width - kerf);
    if (mode === 'cross') return [
      { x:space.x + piece.length + kerf, y:space.y, length:right, width:space.width },
      { x:space.x, y:space.y + piece.width + kerf, length:piece.length, width:bottom },
    ].filter(r => r.length > EPS && r.width > EPS);
    return [
      { x:space.x, y:space.y + piece.width + kerf, length:space.length, width:bottom },
      { x:space.x + piece.length + kerf, y:space.y, length:right, width:piece.width },
    ].filter(r => r.length > EPS && r.width > EPS);
  }
  function pack(pieces, stock, split) {
    const boards = [];
    for (const piece of pieces) {
      let best = null;
      for (const [boardIndex, board] of boards.entries()) {
        for (const [spaceIndex, space] of board.free.entries()) {
          if (piece.length > space.length + EPS || piece.width > space.width + EPS) continue;
          const score = space.length * space.width - piece.length * piece.width;
          if (!best || score < best.score) best = { boardIndex, spaceIndex, space, score };
        }
      }
      if (!best) {
        boards.push({ placements:[], free:[{ x:0, y:0, length:stock.length, width:stock.width }] });
        best = { boardIndex:boards.length - 1, spaceIndex:0, space:boards.at(-1).free[0] };
      }
      const board = boards[best.boardIndex];
      board.free.splice(best.spaceIndex, 1, ...partition(best.space, piece, stock.kerf, split));
      board.placements.push({ ...piece, x:best.space.x, y:best.space.y });
    }
    return boards;
  }
  function verify(boards, stock, pieces) {
    const ids = new Set();
    for (const board of boards) {
      for (const piece of board.placements) {
        if (ids.has(piece.id) || piece.x < -EPS || piece.y < -EPS || piece.x + piece.length > stock.length + EPS || piece.y + piece.width > stock.width + EPS) throw new Error('El plan de madera no es válido.');
        ids.add(piece.id);
      }
      for (let a = 0; a < board.placements.length; a++) for (let b = a + 1; b < board.placements.length; b++) {
        const p = board.placements[a], q = board.placements[b], k = stock.kerf;
        if (!(p.x + p.length + k <= q.x + EPS || q.x + q.length + k <= p.x + EPS || p.y + p.width + k <= q.y + EPS || q.y + q.width + k <= p.y + EPS)) throw new Error('El plan no deja espacio para el ancho de corte.');
      }
    }
    if (ids.size !== pieces.length || pieces.some(p => !ids.has(p.id))) throw new Error('Faltan piezas en el plan de madera.');
  }
  function plan(order, stock = DEFAULT_STOCK) {
    const { board, pieces } = normalize(order, stock);
    const sorts = [
      (a,b) => b.length * b.width - a.length * a.width,
      (a,b) => b.length - a.length || b.width - a.width,
      (a,b) => b.width - a.width || b.length - a.length,
      (a,b) => (b.length + b.width) - (a.length + a.width),
    ];
    let best = null;
    for (const sort of sorts) for (const split of ['cross','rip']) {
      const candidate = pack([...pieces].sort(sort), board, split);
      const freeArea = candidate.reduce((sum,b) => sum + b.free.reduce((s,r) => s + r.length * r.width, 0), 0);
      if (!best || candidate.length < best.boards.length || candidate.length === best.boards.length && freeArea > best.freeArea) best = { boards:candidate, freeArea };
    }
    verify(best.boards, board, pieces);
    const partArea = pieces.reduce((sum,p) => sum + p.length * p.width - (p.shape === 'miter' ? p.width * p.width : 0), 0);
    return { kind:'wood', stock:board, boards:best.boards, boardCount:best.boards.length, pieceCount:pieces.length, utilization:partArea / (board.length * board.width * best.boards.length), partArea };
  }
  function polygon(piece) {
    const { x, y, length:l, width:w } = piece;
    return piece.shape === 'miter' ? [[x,y],[x+l,y],[x+l-w,y+w],[x+w,y+w]] : [[x,y],[x+l,y],[x+l,y+w],[x,y+w]];
  }
  const api = { PRESETS, DEFAULT_STOCK, MAX_PIECES, normalize, plan, verify, polygon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Woodworking = api;
})(typeof window !== 'undefined' ? window : globalThis);
