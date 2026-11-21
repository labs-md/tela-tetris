'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Arrange = require('../arrange/arrange.js');
const Garments = require('../connectors/telatetris/garments.js');

// The game runs normally, with only the DOM and animation timers replaced.
function game({ record, gamepad } = {}) {
  class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.clientWidth = 900;
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelectorAll() { return [new Element(), new Element()]; }
    getContext() { return {}; }
    getBoundingClientRect() { return { top: 100 }; }
    addEventListener() {}
  }

  const elements = new Map();
  const timers = [];
  const listeners = {};
  const frames = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() { return new Element(); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../connectors/telatetris/game.js'), 'utf8'), {
    document,
    window: {
      Arrange, Garments, innerHeight: 900,
      TelaTetrisScores: record ? { record } : undefined,
      addEventListener(type, listener) { listeners[type] = listener; },
    },
    performance: { now: () => 0 },
    navigator: { getGamepads: () => (gamepad ? [gamepad] : []) },
    console: { warn() {} },
    // Only the controller loop runs frames here; drawing needs a real canvas.
    requestAnimationFrame(callback) { if (callback.name === 'padTick') frames.push(callback); }, setInterval() {}, setTimeout(callback) { timers.push(callback); }, clearTimeout() {},
  });

  const element = (id) => document.getElementById(id);
  const tiles = () => element('queue').children.filter((el) => el.attributes['aria-label']);
  const tile = (name) => tiles().find((el) => el.children[2].textContent === name);
  const quantity = (name) => Number(tile(name).children[1].textContent.slice(1));
  const key = (key) => listeners.keydown({ key, preventDefault() {} });
  const runTimers = () => timers.splice(0).forEach((callback) => callback());
  let clock = 0;
  const frame = () => frames.splice(0).forEach((callback) => callback((clock += 16)));
  return { element, tiles, tile, quantity, key, runTimers, frame };
}

test('records only the final human length once, after review undo closes, and records a new round separately', () => {
  const scores = [];
  const g = game({ record: (length) => scores.push(length) });
  g.element('bShelf').onclick();
  assert.equal(scores.length, 0, 'review is still editable');
  g.runTimers();
  g.element('bUndo').onclick();
  assert.equal(scores.length, 0, 'undo never emits an event');
  g.key('Enter');
  const humanLength = Number(g.element('stageTitle').textContent.match(/(\d+) cm/)[1]);
  g.runTimers();
  g.element('bFinish').onclick();
  g.element('bFinish').onclick();
  g.key('Enter');
  assert.deepEqual(scores, [humanLength]);
  assert.equal(g.element('solveHuman').textContent, `${scores[0]} cm`);
  g.element('bAgain').onclick();
  g.element('bShelf').onclick();
  g.runTimers();
  g.element('bFinish').onclick();
  assert.equal(scores.length, 2);
});

test('recording failure does not interrupt the algorithm turn', () => {
  const g = game({ record: () => { throw new Error('storage unavailable'); } });
  g.element('bShelf').onclick();
  g.runTimers();
  assert.doesNotThrow(() => g.element('bFinish').onclick());
  assert.equal(g.element('solvePanel').hidden, false);
});

test('Siguiente groups all copies by part and size, including the held piece', () => {
  const g = game();
  assert.equal(g.tiles().length, 15);
  for (const size of ['S', 'M', 'L']) {
    for (const [type, copies] of Garments.GARMENT) {
      assert.equal(g.quantity(`${Garments.PIECE_TYPES[type].name} · ${size}`), copies * (size === 'M' ? 2 : 1));
    }
  }
  assert.equal(g.tiles().filter((el) => el.attributes['aria-pressed'] === 'true').length, 1);
});

test('selecting and cycling groups preserves quantities; placement reduces only the selected group', () => {
  const g = game();
  const name = 'Manga · M';
  g.tile(name).onclick();
  assert.equal(g.tile(name).attributes['aria-pressed'], 'true');
  assert.equal(g.quantity(name), 4);
  g.key('c');
  assert.equal(g.quantity(name), 4);
  g.tile(name).onclick();
  g.tile(name).onclick();
  g.key('Enter');
  assert.equal(g.quantity(name), 3);
  assert.equal(g.tile(name).attributes['aria-pressed'], 'true');
  assert.equal(g.quantity('Manga · S'), 2);
  assert.equal(g.element('sPieces').textContent, '1/24');
  g.key('Enter');
  assert.equal(g.quantity(name), 2);
  assert.equal(g.element('sPieces').textContent, '2/24');
});

test('exhausted groups disable and undo restores their quantity and selection', () => {
  const g = game();
  const name = 'Delantero · M';
  g.tile(name).onclick();
  g.key('Enter');
  g.key('Enter');
  assert.equal(g.quantity(name), 0);
  assert.equal(g.tile(name).disabled, true);
  assert.equal(g.tile(name).attributes['aria-pressed'], 'false');
  g.element('bUndo').onclick();
  assert.equal(g.quantity(name), 1);
  assert.equal(g.tile(name).disabled, false);
  assert.equal(g.tile(name).attributes['aria-pressed'], 'true');
  assert.equal(g.element('sPieces').textContent, '1/24');
  assert.equal(g.tiles().reduce((sum, el) => sum + Number(el.children[1].textContent.slice(1)), 0), 23);
});

test('the last held piece stays counted, completion clears the groups, and review undo restores one', () => {
  const g = game();
  for (let i = 0; i < 23; i++) g.key('Enter');
  assert.equal(g.element('sPieces').textContent, '23/24');
  const last = g.tiles().find((el) => !el.disabled);
  assert.ok(last);
  assert.equal(last.children[1].textContent, '×1');
  assert.equal(last.attributes['aria-pressed'], 'true');
  g.key('Enter');
  assert.equal(g.element('sPieces').textContent, '24/24');
  assert.equal(g.tiles().length, 0);
  assert.equal(g.element('queue').children[0].textContent, 'Todas las piezas están en el rollo.');
  g.element('bUndo').onclick();
  assert.equal(g.element('sPieces').textContent, '23/24');
  assert.equal(g.tiles().filter((el) => !el.disabled).length, 1);
});

test('purchase turns a roll length into yards to buy and their cost in GTQ', () => {
  assert.deepEqual(Garments.purchase(Garments.CM_PER_YARD), { yards: 1, gtq: Garments.PRICE_PER_YARD_GTQ });
  const p = Garments.purchase(274.32, 40);
  assert.ok(Math.abs(p.yards - 3) < 1e-9);
  assert.ok(Math.abs(p.gtq - 120) < 1e-9);
});

test('number keys pick a piece type, and pressing again steps through its sizes', () => {
  const g = game();
  const held = () => g.tiles().find((el) => el.attributes['aria-pressed'] === 'true').children[2].textContent;
  g.key('2');
  const first = held();
  assert.match(first, /^Espalda · /);
  g.key('2');
  const second = held();
  assert.match(second, /^Espalda · /);
  assert.notEqual(second, first);
  g.key('2');
  assert.match(held(), /^Espalda · /);
  g.key('2');
  assert.equal(held(), first, 'three sizes in the order, so the fourth press is back to the first');
  g.key('5');
  assert.match(held(), /^Bolsillo · /);
});

function fakePad() {
  return { index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}

test('controller: A places, B undoes, X slides, L1 changes piece type, Y takes the next piece', () => {
  const pad = fakePad();
  const g = game({ gamepad: pad });
  const tap = (i) => { pad.buttons[i].pressed = true; g.frame(); pad.buttons[i].pressed = false; g.frame(); };
  const held = () => g.tiles().find((el) => el.attributes['aria-pressed'] === 'true').children[2].textContent;
  tap(0);
  assert.equal(g.element('sPieces').textContent, '1/24');
  tap(1);
  assert.equal(g.element('sPieces').textContent, '0/24');
  const type = held().split(' · ')[0];
  tap(4);
  assert.notEqual(held().split(' · ')[0], type);
  const before = held();
  tap(3);
  assert.equal(g.tiles().filter((el) => el.attributes['aria-pressed'] === 'true').length, 1);
  tap(2);
  assert.equal(g.element('sPieces').textContent, '1/24');
  assert.ok(before);
});

test('controller: holding a button counts once; R1 and R2 both turn without placing', () => {
  const pad = fakePad();
  const g = game({ gamepad: pad });
  pad.buttons[0].pressed = true;
  g.frame(); g.frame(); g.frame();
  assert.equal(g.element('sPieces').textContent, '1/24', 'a held A places one piece');
  pad.buttons[0].pressed = false;
  g.frame();
  pad.buttons[5].pressed = true; g.frame(); pad.buttons[5].pressed = false; g.frame();
  pad.buttons[7].value = 0.9; g.frame(); pad.buttons[7].value = 0; g.frame();
  assert.equal(g.element('sPieces').textContent, '1/24');
});
