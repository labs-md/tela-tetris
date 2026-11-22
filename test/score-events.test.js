'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { create, initialState, uuidv7, retryDelay, PREFIX, CONNECTION, SCHEMA } = require('../connectors/telatetris/score-events.js');

function sourceStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

function memoryStore() {
  let state = initialState(), writes = Promise.resolve(), failDelivery = false;
  return {
    update(change) {
      const operation = writes.then(() => {
        const next = structuredClone(state), result = change(next);
        if (failDelivery && next.records.some((r) => r.status === 'delivered')) throw new Error('storage unavailable');
        state = next;
        return result;
      });
      writes = operation.catch(() => {});
      return operation;
    },
    read: async () => { await writes; return structuredClone(state); },
    failDelivery(value) { failDelivery = value; },
  };
}

function receipt(body, status = 'accepted') {
  const batch = JSON.parse(body);
  return JSON.stringify({ receipt_id: '01a20466-a5a8-7098-aac8-1122dafca32a', batch_id: batch.batch_id,
    received_at: '2026-11-21T19:31:00.000Z', outcomes: batch.events.map((event) => ({ event_id: event.event_id, sequence: event.sequence, status })) });
}

function setup(fetch = async () => { throw new Error('offline'); }) {
  const store = memoryStore(), storage = sourceStorage();
  const clock = { time: Date.parse('2026-11-21T19:30:00.000Z') }, credential = { value: '' };
  const options = { store, sourceStorage: storage, fetch, token: () => credential.value, now: () => clock.time, random: () => 0.5 };
  const sender = create(options);
  return { sender, store, storage, clock, credential, options };
}

test('isolated browser fixture exposes the client without starting the real sender', () => {
  const window = { document: { currentScript: { hasAttribute: (name) => name === 'data-manual-start' } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../connectors/telatetris/score-events.js'), 'utf8'), { window });
  assert.equal(typeof window.TelaTetrisScoreClient.create, 'function');
  assert.equal(window.TelaTetrisScores, undefined);
});

test('the browser session token is used without embedding it into the sender queue', () => {
  const values = new Map([['telatetris-instabloom-post-session-token', 'synthetic-session-token']]);
  const window = {
    document: { currentScript: { hasAttribute: () => true } },
    sessionStorage: { getItem: (key) => values.get(key) ?? null },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../connectors/telatetris/score-events.js'), 'utf8'), { window });
  assert.equal(window.TelaTetrisScoreClient.sessionToken(), 'synthetic-session-token');
  assert.equal(JSON.stringify(initialState()).includes('synthetic-session-token'), false);
});

async function capture(context, score = 120) {
  const id = await context.sender.record(score);
  await new Promise(setImmediate);
  return id;
}

test('direct browser envelope uses exact typed human score, fixed schema, UUIDv7 IDs and no cookies', async () => {
  const calls = [];
  const c = setup(async (url, options) => { calls.push({ url, ...options }); return new Response(receipt(options.body)); });
  const id = await capture(c);
  assert.equal(calls.length, 0, 'blank token never transmits');
  c.credential.value = 'synthetic-instance-token';
  await c.sender.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CONNECTION + '/batches');
  assert.equal(calls[0].credentials, 'omit');
  assert.equal(calls[0].headers.Authorization, 'Bearer synthetic-instance-token');
  const batch = JSON.parse(calls[0].body);
  assert.equal(calls[0].headers['Idempotency-Key'], batch.batch_id);
  assert.equal(batch.first_sequence, '1');
  assert.equal(batch.events[0].event_id, id);
  assert.equal(batch.events[0].schema_version_id, SCHEMA);
  assert.deepEqual(batch.events[0].data, { score_cm: '120' });
  assert.equal(batch.events[0].event_time, '2026-11-21T19:30:00.000Z');
  for (const uuid of [batch.batch_id, batch.queue_id, id]) assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const saved = await c.sender.status();
  assert.equal(saved.records[0].status, 'delivered');
  assert.equal(saved.records[0].receipt, receipt(calls[0].body));
  assert.ok(!JSON.stringify(saved).includes('synthetic-instance-token'));
});

test('reload preserves durable queue ID, byte-for-byte batches and increasing sequences', async () => {
  const c = setup();
  await capture(c);
  const first = await c.sender.status();
  const restarted = create(c.options);
  await restarted.record(150);
  const restored = await restarted.status();
  assert.equal(restored.queue_id, first.queue_id);
  assert.equal(restored.records[0].body, first.records[0].body);
  assert.equal(JSON.parse(restored.records[1].body).first_sequence, '2');
  assert.throws(() => restarted.record(-1), /Invalid material length/);
  assert.throws(() => restarted.record(1.5), /Invalid material length/);
});

test('an immediate page close or old browser outbox recovers its original identity and time once', async () => {
  const c = setup();
  const event_id = uuidv7();
  const source = JSON.stringify({ event_id, score_cm: '130', event_time: '2026-11-21T18:00:00.000Z', captured_at: '2026-11-21T18:00:00.000Z' });
  c.storage.setItem(PREFIX + event_id, source);
  await c.sender.flush();
  await c.sender.flush();
  const state = await c.sender.status();
  assert.equal(c.storage.length, 0);
  assert.equal(state.records.length, 1);
  assert.equal(JSON.parse(state.records[0].body).events[0].event_time, '2026-11-21T18:00:00.000Z');
  assert.equal(state.records[0].event_id, event_id);
});

test('post-COMMIT 401 keeps the original batch and reconciles under replacement authority', async () => {
  let posted;
  const calls = [];
  const c = setup(async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/batches')) { posted = options.body; return new Response(null, { status: 401 }); }
    return new Response(receipt(posted));
  });
  await capture(c);
  c.credential.value = 'old-synthetic';
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].status, 'pending');
  c.credential.value = 'new-synthetic';
  c.clock.time += 301000;
  await create(c.options).flush();
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/receipts/' + JSON.parse(posted).batch_id));
  assert.equal(calls[1].headers.Authorization, 'Bearer new-synthetic');
  assert.equal((await c.sender.status()).records[0].body, posted);
  assert.equal((await c.sender.status()).records[0].status, 'delivered');
});

test('network or CORS failure and missing receipt resend unchanged body and idempotency key', async () => {
  const posts = [];
  const c = setup(async (url, options) => {
    if (url.includes('/receipts/')) return new Response(null, { status: 404 });
    posts.push(options);
    if (posts.length === 1) throw new TypeError('Failed to fetch');
    return new Response(receipt(options.body));
  });
  await capture(c);
  c.credential.value = 'synthetic';
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].last_error, 'NETWORK_OR_STORAGE_ERROR');
  c.clock.time += 301000;
  await c.sender.flush();
  assert.equal(posts[0].body, posts[1].body);
  assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
  assert.equal((await c.sender.status()).records[0].status, 'delivered');
});

test('receipt write failure retains pending delivery for receipt reconciliation after reload', async () => {
  let posted;
  const c = setup(async (url, options) => {
    if (options.body) posted = options.body;
    return new Response(receipt(posted));
  });
  await capture(c);
  c.credential.value = 'synthetic';
  c.store.failDelivery(true);
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].status, 'pending');
  c.store.failDelivery(false);
  c.clock.time += 301000;
  await create(c.options).flush();
  assert.equal((await c.sender.status()).records[0].status, 'delivered');
  assert.equal((await c.sender.status()).records[0].receipt, receipt(posted));
});

test('Retry-After delays requests and identity conflicts stop subsequent queue sequences', async () => {
  let requests = 0;
  const c = setup(async (url) => {
    requests++;
    if (requests === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '120' } });
    if (url.includes('/receipts/')) return new Response(null, { status: 404 });
    return new Response(null, { status: 409 });
  });
  await capture(c);
  await capture(c, 140);
  c.credential.value = 'synthetic';
  await c.sender.flush();
  c.clock.time += 119000;
  await c.sender.flush();
  assert.equal(requests, 1);
  c.clock.time += 2000;
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].status, 'blocked');
  c.clock.time += 301000;
  await c.sender.flush();
  assert.equal(requests, 3);
  assert.equal((await c.sender.status()).records[1].attempts, 0);
  assert.equal(retryDelay(100, null, c.clock.time, () => 1), 300000);
  assert.equal(retryDelay(0, '600', c.clock.time, () => 0), 600000);
});

test('concurrent tabs allocate distinct consecutive sequences with shared transactional storage', async () => {
  const c = setup();
  const other = create(c.options);
  await Promise.all([c.sender.record(100), other.record(200)]);
  const state = await c.sender.status();
  assert.equal(state.records.length, 2);
  assert.deepEqual(state.records.map((r) => JSON.parse(r.body).first_sequence), ['1', '2']);
  assert.equal(state.next_sequence, '3');
});

test('wrong-identity receipt never acknowledges a score', async () => {
  const c = setup(async (url, options) => {
    const invalid = JSON.parse(receipt(options.body));
    invalid.batch_id = uuidv7();
    return Response.json(invalid);
  });
  await capture(c);
  c.credential.value = 'synthetic';
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].status, 'pending');
  assert.equal((await c.sender.status()).records[0].last_error, 'INVALID_RECEIPT');
});

test('non-durable validation output cannot acknowledge delivery even with matching identities', async () => {
  const c = setup(async (url, options) => Response.json({ ...JSON.parse(receipt(options.body)), durable: false }));
  await capture(c);
  c.credential.value = 'synthetic';
  await c.sender.flush();
  assert.equal((await c.sender.status()).records[0].status, 'pending');
  assert.equal((await c.sender.status()).records[0].last_error, 'INVALID_RECEIPT');
});

test('a receipt needs its own identity and the original event and sequence', async () => {
  for (const invalidate of [
    (value) => { delete value.receipt_id; },
    (value) => { value.outcomes[0].event_id = uuidv7(); },
    (value) => { value.outcomes[0].sequence = '2'; },
  ]) {
    const c = setup(async (url, options) => {
      const value = JSON.parse(receipt(options.body));
      invalidate(value);
      return Response.json(value);
    });
    await capture(c);
    c.credential.value = 'synthetic';
    await c.sender.flush();
    const record = (await c.sender.status()).records[0];
    assert.equal(record.status, 'pending');
    assert.equal(record.last_error, 'INVALID_RECEIPT');
  }
});

test('synthetic validation uses independent identities and never opens, resets or advances the delivery queue', async () => {
  const calls = [];
  const c = setup(async (url, options) => {
    calls.push({ url, ...options });
    const batch = JSON.parse(options.body);
    return Response.json({ batch_id: batch.batch_id, durable: false, outcomes: [{
      event_id: batch.events[0].event_id, sequence: '1', valid: true, diagnostic: null,
    }] });
  });
  await capture(c);
  const before = await c.sender.status();
  c.credential.value = 'synthetic';
  await c.sender.validate();
  assert.equal(calls[0].url, CONNECTION + '/validate');
  const validation = JSON.parse(calls[0].body);
  assert.equal(validation.events[0].data.score_cm, '120');
  assert.notEqual(validation.queue_id, before.queue_id);
  assert.deepEqual(await c.sender.status(), before);
});

test('a failed live-format validation outcome is rejected without changing the queue', async () => {
  const c = setup(async (url, options) => {
    const batch = JSON.parse(options.body);
    return Response.json({ batch_id: batch.batch_id, durable: false, outcomes: [{
      event_id: batch.events[0].event_id, sequence: '1', valid: false, diagnostic: { code: 'INVALID_INPUT' },
    }] });
  });
  const before = await c.sender.status();
  c.credential.value = 'synthetic';
  await assert.rejects(c.sender.validate(), /Synthetic validation failed/);
  assert.deepEqual(await c.sender.status(), before);
});
