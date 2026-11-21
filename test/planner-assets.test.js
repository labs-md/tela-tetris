'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const planner = path.join(__dirname, '../connectors/planner');
const previewBase = new URL('http://localhost/api/assets/planner-preview/');

function asset(source, from = new URL('index.html', previewBase)) {
  const url = new URL(source, from);
  assert.ok(url.href.startsWith(previewBase.href), `Asset escapes the planner preview: ${source}`);
  return fs.readFileSync(path.join(planner, url.pathname.slice(previewBase.pathname.length)), 'utf8');
}

test('the planner loads its engine and presets inside a folder-restricted preview', () => {
  const html = fs.readFileSync(path.join(planner, 'index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), match => match[1]);
  const context = vm.createContext({ window: {} });
  for (const source of scripts) {
    const code = asset(source);
    if (source !== 'planner.js') vm.runInContext(code, context, { filename: source });
  }
  const { Arrange, Presets } = context.window;
  assert.equal(typeof Arrange.session, 'function');
  const session = Arrange.session(Presets.request({ playera: { M: 1 } }, { iterations: 1 }));
  session.step(0);
  assert.equal(session.result().status, 'ok');
});

test('the planner worker calculates using only files inside its preview folder', () => {
  const Presets = require('../connectors/planner/presets.js');
  const messages = [];
  const context = vm.createContext({
    postMessage: message => messages.push(message),
    setTimeout() { throw new Error('One iteration should complete synchronously'); },
    importScripts(source) {
      vm.runInContext(asset(source, new URL('planner-worker.js', previewBase)), context, { filename: source });
    },
  });
  vm.runInContext(asset('planner-worker.js'), context, { filename: 'planner-worker.js' });
  context.onmessage({ data: Presets.request({ pantalon: { L: 1 } }, { iterations: 1 }) });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].result.status, 'ok');
  assert.equal(messages[0].done, true);
});

test('the shipped planner engine matches the shared engine', () => {
  assert.equal(asset('arrange.js'), fs.readFileSync(path.join(__dirname, '../arrange/arrange.js'), 'utf8'),
    'Regenerate the planner engine with npm run build:planner');
});
