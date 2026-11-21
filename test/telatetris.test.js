'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Arrange = require('../arrange/arrange.js');
const Garments = require('../connectors/telatetris/garments.js');

// The game runs normally, with only the DOM and animation timers replaced.
function game() {
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
  const listeners = {};
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
      addEventListener(type, listener) { listeners[type] = listener; },
    },
    performance: { now: () => 0 },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {},
  });

  const element = (id) => document.getElementById(id);
  const tiles = () => element('queue').children.filter((el) => el.attributes['aria-label']);
  const tile = (name) => tiles().find((el) => el.children[2].textContent === name);
  const quantity = (name) => Number(tile(name).children[1].textContent.slice(1));
  const key = (key) => listeners.keydown({ key, preventDefault() {} });
  return { element, tiles, tile, quantity, key };
}

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
