/*
 * Garment connector for the Arrange engine: T-shirt pattern pieces on a roll
 * of fabric, in cm, one cell = 1 cm. Pieces keep their grain line along the roll,
 * so the only allowed rotations are 0° and 180°.
 *
 * Replace PIECE_TYPES / GARMENT with real patterns (for example, polygons
 * exported from DXF) to show a factory its own order.
 *
 * Works as a browser <script> (window.Garments, needs window.Arrange) and as
 * a Node module.
 */
(function (root) {
  'use strict';

  const Arrange = typeof module !== 'undefined' && module.exports
    ? require('../arrange/arrange.js')
    : root.Arrange;

  const SIZE_SCALE = { S: 0.92, M: 1.0, L: 1.08, XL: 1.16 };

  const GRAIN = [0, 180];

  // Outlines in cm for size M, lying with the grain along x.
  const PIECE_TYPES = {
    delantero: {
      name: 'Delantero', color: '#e9fb5a', arrow: true,
      poly: [[2, 6], [0, 18], [8, 26], [0, 34], [2, 46], [10, 49], [22, 52],
             [70, 52], [70, 0], [22, 0], [10, 3]],
    },
    espalda: {
      name: 'Espalda', color: '#e9fb5a', arrow: true,
      poly: [[2, 6], [0, 18], [2, 26], [0, 34], [2, 46], [10, 49], [22, 52],
             [70, 52], [70, 0], [22, 0], [10, 3]],
    },
    manga: {
      name: 'Manga', color: '#c6b3e4', arrow: true,
      poly: [[8, 1], [22, 0], [22, 40], [8, 39], [3, 32], [0, 20], [3, 8]],
    },
    cuello: {
      name: 'Cuello', color: '#f6f6f1', arrow: false,
      poly: [[0, 0], [4, 0], [4, 44], [0, 44]],
    },
    bolsillo: {
      name: 'Bolsillo', color: '#cdc1ba', arrow: false,
      poly: [[0, 0], [11, 0], [14, 7], [11, 14], [0, 14]],
    },
  };

  // One T-shirt = these pieces.
  const GARMENT = [['delantero', 1], ['espalda', 1], ['manga', 2], ['cuello', 1], ['bolsillo', 1]];

  const PIECES_PER_GARMENT = GARMENT.reduce((a, [, q]) => a + q, 0);

  /**
   * The garment connector: an order like {S: 1, M: 2, L: 1} as an Arrange
   * request (arrange/PROTOCOL.md). Item keys read "<piece>-<size>-<garment>".
   */
  function request(counts, { width = 150, gap = 1, seed = 1, iterations, timeMs } = {}) {
    const items = [];
    let garment = 0;
    for (const size of Object.keys(SIZE_SCALE)) {
      for (let k = 0; k < (counts[size] || 0); k++) {
        garment++;
        for (const [type, qty] of GARMENT) {
          const t = PIECE_TYPES[type];
          items.push({
            key: `${type}-${size}-${garment}`,
            polygon: Arrange.scalePolygon(t.poly, SIZE_SCALE[size]),
            rotations: GRAIN,
            quantity: qty,
            data: { type, size, garment, name: t.name, color: t.color, arrow: t.arrow },
          });
        }
      }
    }
    const search = { seed };
    if (iterations !== undefined) search.iterations = iterations;
    if (timeMs !== undefined) search.timeMs = timeMs;
    return { protocol: Arrange.PROTOCOL, units: 'cm', cellSize: 1, strip: { width, gap }, items, search };
  }

  const Garments = { SIZE_SCALE, PIECE_TYPES, GARMENT, PIECES_PER_GARMENT, GRAIN, request };

  if (typeof module !== 'undefined' && module.exports) module.exports = Garments;
  else root.Garments = Garments;
})(typeof window !== 'undefined' ? window : globalThis);
