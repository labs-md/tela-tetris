'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const Arrange = require('../arrange/arrange.js');
const schema = require('../arrange/protocol.schema.json');
const minimal = require('../arrange/examples/minimal.json');
const { validate } = require('./schema-lite.js');

const asRequest = (m) => validate(schema, schema.$defs.request, m);
const asResponse = (m) => validate(schema, schema.$defs.response, m);
const clone = (o) => JSON.parse(JSON.stringify(o));
const quick = (req) => ({ ...clone(req), search: { seed: 1, iterations: 5 } });

test('the example request matches the schema and solves', () => {
  assert.deepEqual(asRequest(minimal), []);
  const res = Arrange.solve(quick(minimal));
  assert.deepEqual(asResponse(res), []);
  assert.equal(res.status, 'ok');
  assert.equal(res.units, 'mm');
  assert.equal(res.placements.length, 7);
  assert.deepEqual(res.unplaced, []);
  assert.ok(res.baseline.length >= res.length);
});

test('placements come back in units, on the grid, with matching polygons', () => {
  const res = Arrange.solve(quick(minimal));
  for (const p of res.placements) {
    assert.equal(p.x % minimal.cellSize, 0);
    assert.equal(p.y % minimal.cellSize, 0);
    const src = minimal.items.find((it) => it.key === p.key).polygon;
    const moved = Arrange.rotatePolygon(src, p.rotation).map(([x, y]) => [x + p.translate[0], y + p.translate[1]]);
    moved.forEach(([x, y], i) => {
      assert.ok(Math.abs(x - p.polygon[i][0]) < 1e-6 && Math.abs(y - p.polygon[i][1]) < 1e-6);
    });
    const minX = Math.min(...p.polygon.map((q) => q[0])), minY = Math.min(...p.polygon.map((q) => q[1]));
    assert.ok(Math.abs(minX - p.x) < 1e-6 && Math.abs(minY - p.y) < 1e-6);
  }
  const copies = res.placements.filter((p) => p.key === 'bracket').map((p) => p.copy).sort();
  assert.deepEqual(copies, [0, 1, 2]);
});

test('invalid requests list every problem instead of throwing', () => {
  const res = Arrange.run({ protocol: 'arrange/0', strip: { width: 0 }, items: [{ polygon: [[0, 0], [1, 1]] }] });
  assert.equal(res.status, 'invalid');
  assert.deepEqual(asResponse(res), []);
  assert.equal(res.errors.length, 3);
  const wide = Arrange.solve({ protocol: 'arrange/1', strip: { width: 10 }, items: [{ polygon: [[0, 0], [20, 0], [20, 20]] }] });
  assert.equal(wide.status, 'invalid');
  assert.match(wide.errors[0], /wider than the strip/);
  assert.throws(() => Arrange.session({ protocol: 'arrange/1' }), /invalid request/);
});

test('maxLength leaves what does not fit in unplaced', () => {
  const req = { protocol: 'arrange/1', strip: { width: 10, gap: 0, maxLength: 25 }, items: [{ polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], quantity: 4 }], search: { iterations: 3 } };
  const res = Arrange.solve(req);
  assert.equal(res.status, 'incomplete');
  assert.equal(res.placements.length, 2);
  assert.deepEqual(res.unplaced.length, 2);
  assert.deepEqual(asResponse(res), []);
});

test('evaluate scores a layout made elsewhere', () => {
  const req = { protocol: 'arrange/1', task: 'evaluate', units: 'cm', strip: { width: 20, gap: 1 }, items: [{ polygon: [[0, 0], [5, 0], [5, 5], [0, 5]], quantity: 2 }] };
  const good = [{ item: 0, x: 1, y: 1 }, { item: 1, x: 8, y: 1 }];
  const ok = Arrange.run({ ...req, placements: good });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.length, 13);
  assert.deepEqual(asResponse(ok), []);
  assert.equal(ok.stats, undefined);
  assert.equal(Arrange.run({ ...req, placements: [good[0], { item: 1, x: 6, y: 1 }] }).status, 'rejected');
  assert.equal(Arrange.run({ ...req, placements: [good[0], good[0]] }).status, 'rejected');
  assert.equal(Arrange.run({ ...req, placements: [good[0]] }).status, 'incomplete');
  const bad = Arrange.run({ ...req, placements: [good[0], { item: 9, x: 1, y: 1 }, { item: 1, rotation: 90, x: 8, y: 1 }] });
  assert.equal(bad.status, 'invalid');
  assert.equal(bad.errors.length, 2);
  assert.equal(Arrange.run({ ...req }).status, 'invalid');
});

test('a session searches in steps and resets', () => {
  const s = Arrange.session(quick(minimal));
  assert.equal(s.progress().iterations, 0);
  s.step(0);
  const p = s.step(0);
  assert.ok(p.iterations >= 2 && p.length <= p.initialLength);
  assert.equal(s.result().stats.iterations, p.iterations);
  s.reset();
  assert.equal(s.progress().iterations, 0);
});

test('the CLI answers on stdout and signals invalid input with exit 1', () => {
  const cli = path.join(__dirname, '../arrange/cli.js');
  const out = JSON.parse(execFileSync('node', [cli], { input: JSON.stringify(quick(minimal)) }).toString());
  assert.equal(out.status, 'ok');
  const bad = spawnSync('node', [cli], { input: '{"protocol": "arrange/1"' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout.toString()).status, 'invalid');
});
