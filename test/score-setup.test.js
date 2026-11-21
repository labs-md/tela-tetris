'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ blocked = false } = {}) {
  const elements = new Map(['scoreConnection', 'ingestionToken', 'error', 'connectScores'].map((id) => [id, { value: '', hidden: true, disabled: false, focus() {} }]));
  const stored = new Map(), destinations = [];
  let submit;
  elements.get('scoreConnection').addEventListener = (type, listener) => { submit = listener; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../connectors/telatetris/score-setup.js'), 'utf8'), {
    document: { getElementById: (id) => elements.get(id) },
    sessionStorage: { setItem: (key, value) => { if (blocked) throw new Error('storage blocked'); stored.set(key, value); } },
    window: { TelaTetrisScoreClient: { TOKEN_KEY: 'synthetic-token-key' }, location: { assign: (value) => destinations.push(value) } },
  });
  return { elements, stored, destinations, submit: () => submit({ preventDefault() {} }) };
}

test('setup stores the token in this browser session and opens the game without putting it in a URL', () => {
  const page = setup();
  page.elements.get('ingestionToken').value = ' synthetic-session-token ';
  page.submit();
  assert.equal(page.stored.get('synthetic-token-key'), 'synthetic-session-token');
  assert.deepEqual(page.destinations, ['index.html']);
  assert.equal(page.elements.get('ingestionToken').value, '');
});

test('blank tokens and blocked storage keep the user on the setup page with a recoverable error', () => {
  const empty = setup();
  empty.submit();
  assert.equal(empty.stored.size, 0);
  assert.equal(empty.destinations.length, 0);
  assert.equal(empty.elements.get('error').hidden, false);
  const blocked = setup({ blocked: true });
  blocked.elements.get('ingestionToken').value = 'synthetic-session-token';
  blocked.submit();
  assert.equal(blocked.destinations.length, 0);
  assert.equal(blocked.elements.get('ingestionToken').value, 'synthetic-session-token');
  assert.equal(blocked.elements.get('error').hidden, false);
});
