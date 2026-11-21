/*
 * Sheet-metal connector: steel parts cut by laser from a 1 m wide coil.
 *
 * Unlike fabric, metal has no grain, so parts may turn in 90° steps. The coil
 * has a rust spot that no part may cover. Everything is in mm; the engine
 * works on a 5 mm grid.
 *
 *   node connectors/sheet-metal/sheet-metal.js [layout.svg]   solve and report
 *   node connectors/sheet-metal/sheet-metal.js --request      print the request only
 *
 * The second form shows the connector/engine split: pipe its output into
 * `node arrange/cli.js` and you get the same response the first form reads.
 */
'use strict';

const fs = require('fs');
const Arrange = require('../../arrange/arrange.js');

// Outlines in mm.
const PARTS = [
  { key: 'l-bracket', qty: 6, color: '#e9fb5a', poly: [[0, 0], [160, 0], [160, 40], [40, 40], [40, 120], [0, 120]] },
  { key: 'gusset', qty: 8, color: '#c6b3e4', poly: [[0, 0], [110, 0], [0, 110]] },
  { key: 'base-plate', qty: 3, color: '#9fd8cb', poly: [[0, 0], [300, 0], [300, 180], [190, 180], [190, 130], [110, 130], [110, 180], [0, 180]] },
  { key: 'flange', qty: 5, color: '#f2a679', poly: octagon(60) },
  { key: 'strip', qty: 4, color: '#cdc1ba', poly: [[0, 0], [420, 0], [420, 30], [0, 30]] },
];
const RUST = [[320, 380], [400, 360], [430, 430], [370, 480], [310, 450]];

function octagon(r) {
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const t = (Math.PI / 4) * k + Math.PI / 8;
    pts.push([+(r + r * Math.cos(t)).toFixed(3), +(r + r * Math.sin(t)).toFixed(3)]);
  }
  return pts;
}

/** The job, as a protocol request. */
function request() {
  return {
    protocol: Arrange.PROTOCOL,
    units: 'mm',
    cellSize: 5,
    strip: { width: 1000, gap: 5, blocked: [RUST] },
    items: PARTS.map((p) => ({
      key: p.key,
      polygon: p.poly,
      rotations: [0, 90, 180, 270],
      quantity: p.qty,
      data: { color: p.color },
    })),
    search: { seed: 3, timeMs: 4000, iterations: 1000 },
  };
}

function toSvg(req, res) {
  const s = 0.8, L = res.length + req.strip.gap, W = req.strip.width;
  const pts = (poly) => poly.map(([x, y]) => `${(x * s).toFixed(1)},${(y * s).toFixed(1)}`).join(' ');
  const colors = Object.fromEntries(PARTS.map((p) => [p.key, p.color]));
  const shapes = res.placements.map((p) => `<polygon points="${pts(p.polygon)}" fill="${colors[p.key]}" stroke="#141414"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(L * s).toFixed(0)}" height="${(W * s).toFixed(0)}">
<rect width="100%" height="100%" fill="#262626"/>
<polygon points="${pts(RUST)}" fill="#b84a16"/>
${shapes.join('\n')}
</svg>\n`;
}

if (require.main === module) {
  const req = request();
  if (process.argv[2] === '--request') {
    process.stdout.write(JSON.stringify(req, null, 2) + '\n');
    process.exit(0);
  }
  const res = Arrange.solve(req);
  if (res.status === 'invalid') { console.error(res.errors); process.exit(1); }
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const n = req.items.reduce((a, it) => a + it.quantity, 0);
  console.log(`${n} parts on a ${req.strip.width} mm coil, rust spot avoided: ${res.status}`);
  console.log(`  by shelves: ${res.baseline.length} mm  (uses ${pct(res.baseline.utilization)})`);
  console.log(`  arranged:   ${res.length} mm  (uses ${pct(res.utilization)}, ${res.stats.iterations} orders tried in ${res.stats.ms} ms)`);
  console.log(`  saved:      ${res.baseline.length - res.length} mm of coil`);
  const out = process.argv[2];
  if (out) {
    fs.writeFileSync(out, toSvg(req, res));
    console.log(`  wrote ${out}`);
  }
}

module.exports = { request, toSvg };
