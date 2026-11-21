/* Illustrative pattern presets. All measurements are cm, not production sewing patterns. */
(function (root) {
  'use strict';
  const sizes = { S:0.92, M:1, L:1.08, XL:1.16 };
  const CM_PER_YARD = 91.44;
  const piece = (name, poly, color = '#E8FB5B', quantity = 1) => ({ name, poly, color, quantity });
  const PRESETS = {
    playera: {
      name: 'Playera', plural: 'Playeras', description: 'Manga corta · con bolsillo', fabric: 'Tejido de punto',
      pieces: [
        piece('Delantero', [[2,6],[0,18],[8,26],[0,34],[2,46],[10,49],[22,52],[70,52],[70,0],[22,0],[10,3]]),
        piece('Espalda', [[2,6],[0,18],[2,26],[0,34],[2,46],[10,49],[22,52],[70,52],[70,0],[22,0],[10,3]], '#C6D64C'),
        piece('Manga', [[8,1],[22,0],[22,40],[8,39],[3,32],[0,20],[3,8]], '#F3FCA8', 2),
        piece('Cuello', [[0,0],[4,0],[4,44],[0,44]], '#FFFFFF'),
        piece('Bolsillo', [[0,0],[11,0],[14,7],[11,14],[0,14]], '#F95300'),
      ],
    },
    pantalon: {
      name: 'Pantalón', plural: 'Pantalones', description: 'Corte recto · sin forro', fabric: 'Tejido plano',
      pieces: [
        piece('Pierna delantera', [[0,0],[100,0],[100,25],[35,29],[29,36],[17,32],[0,29]], '#E8FB5B', 2),
        piece('Pierna trasera', [[0,0],[104,0],[104,27],[37,33],[28,42],[15,36],[0,32]], '#C6D64C', 2),
        piece('Pretina', [[0,0],[8,0],[8,90],[0,90]], '#FFFFFF'),
        piece('Bolsillo', [[0,0],[24,0],[24,17],[8,21],[0,16]], '#F95300', 2),
      ],
    },
    chaqueta: {
      name: 'Chaqueta', plural: 'Chaquetas', description: 'Manga larga · sin forro', fabric: 'Tejido plano',
      pieces: [
        piece('Delantero', [[0,0],[74,0],[74,29],[22,29],[13,26],[8,18],[0,15]], '#E8FB5B', 2),
        piece('Espalda', [[0,7],[10,0],[76,0],[76,55],[10,55],[0,48],[8,39],[4,28],[8,16]], '#C6D64C'),
        piece('Manga', [[0,14],[10,4],[22,0],[65,7],[65,29],[22,37],[10,32]], '#F3FCA8', 2),
        piece('Cuello', [[0,0],[12,3],[12,48],[0,52]], '#FFFFFF', 2),
        piece('Bolsillo', [[0,0],[18,0],[21,9],[18,18],[0,18]], '#F95300', 2),
      ],
    },
  };
  const WIDTH = 150, MAX_GARMENTS = 12;
  function request(order, { iterations = 10000, timeMs = 1800, seed = 7 } = {}) {
    if (!order || typeof order !== 'object' || Array.isArray(order)) throw new Error('El pedido no es válido.');
    let total = 0;
    const items = [];
    for (const [type, counts] of Object.entries(order)) {
      const preset = PRESETS[type];
      if (!preset) throw new Error('Selecciona una prenda del catálogo.');
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Las cantidades no son válidas.');
      for (const [size, quantity] of Object.entries(counts)) {
        if (!(size in sizes) || !Number.isInteger(quantity) || quantity < 0) throw new Error('Usa cantidades enteras entre 0 y 12 para las tallas S a XL.');
        total += quantity;
        if (total > MAX_GARMENTS) throw new Error('Puedes calcular hasta 12 prendas por pedido.');
        for (const [index, p] of preset.pieces.entries()) {
          if (!quantity) continue;
          items.push({ key: `${type}-${size}-${index}`, polygon: p.poly.map(([x,y]) => [x * sizes[size], y * sizes[size]]), quantity: quantity * p.quantity, rotations: [0,180], data: { name:p.name, color:p.color, size, type } });
        }
      }
    }
    if (!total) throw new Error('Agrega al menos una prenda para calcular la tela.');
    return { protocol:'arrange/1', units:'cm', cellSize:1, strip:{ width:WIDTH, gap:1 }, items, search:{ iterations, timeMs, seed } };
  }
  function purchase(lengthCm) {
    if (!Number.isFinite(lengthCm) || lengthCm < 0) throw new Error('La longitud no es válida.');
    const exactYards = lengthCm / CM_PER_YARD;
    return { lengthCm, exactYards, buyYards:Math.ceil(exactYards * 4) / 4 };
  }
  const api = { PRESETS, sizes, WIDTH, MAX_GARMENTS, request, purchase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Presets = api;
})(typeof window !== 'undefined' ? window : globalThis);
