'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Wood = require('../connectors/planner/woodworking.js');
const stock = { length:100, width:20, thickness:1.8, kerf:3 };

test('crosscuts include saw kerf when counting whole planks', () => {
  const order = { recto:{length:50,width:20,quantity:2} };
  assert.equal(Wood.plan(order,{...stock,kerf:0}).boardCount,1);
  assert.equal(Wood.plan(order,stock).boardCount,2);
  assert.equal(Wood.plan({recto:{length:49.85,width:20,quantity:2}},stock).boardCount,1);
});
test('rip cuts account for kerf in the width as well as the length', () => {
  assert.equal(Wood.plan({liston:{length:100,width:10,quantity:2}},stock).boardCount,2);
  assert.equal(Wood.plan({liston:{length:100,width:9.85,quantity:2}},stock).boardCount,1);
});
test('a piece exactly matching the stock needs one board and no invented edge gap', () => {
  const result=Wood.plan({recto:{length:100,width:20,quantity:1}},stock);
  assert.equal(result.boardCount,1);assert.equal(result.utilization,1);
});
test('common cuts and miter blanks produce complete, bounded, kerf-separated plans', () => {
  const order=Object.fromEntries(Object.entries(Wood.PRESETS).map(([key,p])=>[key,{length:p.length,width:p.width,quantity:2}]));
  const result=Wood.plan(order);
  const normalized=Wood.normalize(order,Wood.DEFAULT_STOCK);
  Wood.verify(result.boards,result.stock,normalized.pieces);
  assert.equal(result.pieceCount,14);
  assert.equal(new Set(result.boards.flatMap(b=>b.placements.map(p=>p.id))).size,14);
  assert.ok(result.utilization>0&&result.utilization<=1);
});
test('miters reserve rectangular blanks and report the actual finished shape', () => {
  const result=Wood.plan({inglete:{length:60,width:8,quantity:1}});
  const p=result.boards[0].placements[0];
  assert.deepEqual(Wood.polygon(p),[[0,0],[600,0],[520,80],[80,80]]);
  assert.equal(result.partArea,600*80-80*80);
});
test('bad dimensions, excess counts and parts that do not fit are rejected', () => {
  for(const order of [{},{recto:{length:0,width:10,quantity:1}},{recto:{length:101,width:20,quantity:1}},{recto:{length:20,width:21,quantity:1}},{recto:{length:10,width:10,quantity:1.5}},{recto:{length:10,width:10,quantity:101}},{inglete:{length:20,width:10,quantity:1}}])assert.throws(()=>Wood.plan(order,stock));
  for(const kerf of [-1,21,NaN])assert.throws(()=>Wood.plan({recto:{length:10,width:10,quantity:1}},{...stock,kerf}));
});
test('purchase plans remain deterministic and valid across mixed dimensions', () => {
  for(let i=1;i<=20;i++){
    const order={repisa:{length:20+i,width:5+i%8,quantity:3},liston:{length:40+i,width:3+i%5,quantity:4}};
    const result=Wood.plan(order,stock);
    assert.deepEqual(Wood.plan(order,stock),result);
    Wood.verify(result.boards,result.stock,Wood.normalize(order,stock).pieces);
  }
});
