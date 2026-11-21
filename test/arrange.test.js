'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Arrange = require('../arrange/arrange.js');
const Garments = require('../demo/garments.js');

const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const tri = (s) => [[0, 0], [s, 0], [0, s]];

function mixed(extra = {}) {
  return Arrange.createProblem({
    width: 60, gap: 1,
    items: [
      { polygon: rect(20, 10), rotations: [0, 90], quantity: 10 },
      { polygon: tri(11), rotations: [0, 90, 180, 270], quantity: 6 },
    ],
    ...extra,
  });
}

test('rotations by 90° swap the bounding box exactly', () => {
  const [it] = Arrange.prepareItems([{ polygon: rect(20, 7), rotations: [0, 90, 180, 270] }]);
  const dims = it.variants.map((v) => [v.rot, v.body.w, v.body.h]);
  assert.deepEqual(dims, [[0, 20, 7], [90, 7, 20], [180, 20, 7], [270, 7, 20]]);
  for (const v of it.variants) for (const [x, y] of v.poly) assert.ok(Number.isInteger(x) && Number.isInteger(y));
});

test('quantity copies share rasters and get consecutive ids', () => {
  const items = Arrange.prepareItems([{ polygon: rect(5, 5), quantity: 3, data: { k: 1 } }, { polygon: tri(4) }]);
  assert.deepEqual(items.map((i) => i.id), [0, 1, 2, 3]);
  assert.equal(items[0].variants, items[2].variants);
  assert.deepEqual(items[1].data, { k: 1 });
});

test('greedy, search and shelf layouts are valid', () => {
  const P = mixed();
  for (const placements of [P.shelf(), P.greedy().placements, P.pack({ iterations: 15 }).placements]) {
    assert.equal(P.validate(placements).ok, true);
  }
});

test('search never returns a longer layout than its first pass', () => {
  const P = mixed();
  const s = P.search({ seed: 5 });
  for (let i = 0; i < 20; i++) s.step();
  assert.equal(s.iterations, 21);
  assert.ok(s.best.length <= s.initial.length);
});

test('blocked regions are avoided by every method', () => {
  const spot = [[25, 20], [40, 20], [40, 40], [25, 40]];
  const P = mixed({ blocked: [spot] });
  const board = P.board(200);
  assert.equal(board.ownerAt(30, 30), -2);
  for (const placements of [P.shelf(), P.greedy().placements, P.pack({ iterations: 10 }).placements]) {
    assert.equal(P.validate(placements).ok, true);
  }
});

test('shelf terminates next to blocked cells with no gap', () => {
  const P = Arrange.createProblem({
    width: 30, gap: 0,
    items: [{ polygon: rect(10, 25), quantity: 3 }],
    blocked: [[[0, 10], [15, 10], [15, 12], [0, 12]]],
  });
  const placements = P.shelf();
  assert.equal(placements.length, 3);
  assert.equal(P.validate(placements).ok, true);
});

test('validate reports each broken rule', () => {
  const P = Arrange.createProblem({ width: 20, gap: 1, items: [{ polygon: rect(5, 5), quantity: 2 }] });
  const good = [{ id: 0, rot: 0, x: 1, y: 1 }, { id: 1, rot: 0, x: 8, y: 1 }];
  assert.equal(P.validate(good).ok, true);
  assert.equal(P.validate([good[0], { id: 1, rot: 0, x: 6, y: 1 }]).noOverlap, false); // touching: no gap
  assert.equal(P.validate([good[0], { id: 1, rot: 90, x: 8, y: 1 }]).rotations, false);
  assert.equal(P.validate([good[0], { id: 1, rot: 0, x: 8, y: 16 }]).inBounds, false);
  assert.equal(P.validate([good[0]]).complete, false);
  assert.equal(P.validate([good[0], good[0]]).complete, false);
});

test('items wider than the strip in every rotation are rejected', () => {
  assert.throws(() => Arrange.createProblem({ width: 10, items: [{ polygon: rect(20, 12), rotations: [0, 90] }] }), /wider than the strip/);
  assert.doesNotThrow(() => Arrange.createProblem({ width: 10, items: [{ polygon: rect(5, 20), rotations: [0, 90] }] }));
});

test('metrics leave blocked cells out of the used area', () => {
  const P = Arrange.createProblem({
    width: 10, items: [{ polygon: rect(4, 4) }],
    blocked: [rect(2, 10)],
  });
  const m = P.metrics([{ id: 0, rot: 0, x: 2, y: 0 }]);
  assert.equal(m.length, 6);
  assert.equal(m.used, 60 - 20);
  assert.equal(m.area, 16);
});

test('garment connector: grain kept, layout beats shelves', () => {
  const S = Arrange.session(Garments.request({ M: 1 }));
  const P = S.problem;
  assert.equal(P.items.length, Garments.PIECES_PER_GARMENT);
  assert.ok(P.items.every((it) => it.rotations.join() === '0,180'));
  const best = P.pack({ iterations: 10 });
  assert.equal(best.length, 81);
  assert.ok(best.length < P.layoutLength(P.shelf()));
  assert.equal(P.validate(best.placements).ok, true);
});
