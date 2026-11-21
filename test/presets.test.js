'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Presets = require('../connectors/planner/presets.js');
const Arrange = require('../arrange/arrange.js');

test('every garment and size produces a complete grain-preserving layout on the fixed roll', () => {
  for(const type of Object.keys(Presets.PRESETS)) for(const size of Object.keys(Presets.sizes)) {
    const request=Presets.request({[type]:{[size]:1}},{iterations:1});
    assert.equal(request.strip.width,150);
    const result=Arrange.run(request);
    assert.equal(result.status,'ok',`${type} ${size}`);
    assert.equal(result.check.ok,true);
    assert.equal(result.placements.length,Presets.PRESETS[type].pieces.reduce((n,p)=>n+p.quantity,0));
    assert.ok(result.placements.every(p=>[0,180].includes(p.rotation)));
    assert.ok(Presets.purchase(result.length).buyYards*91.44>=result.length);
  }
});
test('mixed orders include every requested copy and size', () => {
  const request=Presets.request({playera:{S:1,M:2},pantalon:{L:1},chaqueta:{XL:1}},{iterations:1});
  assert.equal(request.items.reduce((n,p)=>n+p.quantity,0),34);
  const result=Arrange.run(request);
  assert.equal(result.status,'ok');assert.equal(result.check.ok,true);assert.equal(result.placements.length,34);
});
test('purchase rounds upward to a quarter yard without displaying an undersized purchase', () => {
  assert.equal(Presets.purchase(91.44).buyYards,1);
  assert.equal(Presets.purchase(91.44001).buyYards,1.25);
  assert.equal(Presets.purchase(114.3).buyYards,1.25);
  for(let length=1;length<3000;length++) {
    const p=Presets.purchase(length);
    assert.ok(p.buyYards*91.44>=length);
    assert.ok(p.buyYards-p.exactYards<.2500001);
  }
  for(const value of [-1,Infinity,NaN])assert.throws(()=>Presets.purchase(value));
});
test('empty, malformed and excessive orders fail before reaching the packing engine', () => {
  for(const order of [null,[],{}, {playera:{M:0}},{playera:{M:-1}},{playera:{M:1.5}},{playera:{M:'2'}},{playera:{XXL:1}},{foo:{M:1}},{playera:{M:12},pantalon:{M:1}}])assert.throws(()=>Presets.request(order));
  assert.doesNotThrow(()=>Presets.request({playera:{M:12}}));
});
