/* Direct browser ingestion. This instance intentionally embeds its short-lived token. */
(function (root) {
  'use strict';

  const INGESTION_TOKEN = 'ib_ing_1.01a20460-16b9-7184-9097-8d4bd4af2104.0QcQNhOpulrQtrmuJ4pfMhxwMAKiXPbmJUUwtRU0RqY'; // Expires 2026-11-23 at 17:48 UTC.
  const CONNECTION = 'https://stg-capture.lid.gt/ingest/v2/workspaces/01a1ff84-784e-75bc-9fa9-6284885c72bc/campaigns/01a2045e-05f0-712b-91f6-e8860a376163/connections/01a2045f-a3ea-7022-8e76-4e0dcba7d735';
  const SCHEMA = '01a2045f-1767-7204-9261-3cf0114a87c7';
  const PREFIX = 'telatetris-score-post:';
  const TOKEN_KEY = 'telatetris-instabloom-post-session-token';

  function sessionToken() {
    try { return root.sessionStorage.getItem(TOKEN_KEY) || INGESTION_TOKEN; }
    catch { return INGESTION_TOKEN; }
  }

  function uuidv7() {
    const bytes = root.crypto.getRandomValues(new Uint8Array(16));
    let time = BigInt(Date.now());
    for (let i = 5; i >= 0; i--) { bytes[i] = Number(time & 255n); time >>= 8n; }
    bytes[6] = (bytes[6] & 15) | 112;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function initialState(uuid = uuidv7) {
    return { version: 2, connection: CONNECTION, schema: SCHEMA, queue_id: uuid(), next_sequence: '1', records: [] };
  }

  function indexedStore(indexedDB, name = 'telatetris-instabloom-post-v2') {
    let database;
    const open = () => {
      if (!database) database = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return database;
    };
    async function transact(change) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore('state');
        const request = store.get('sender');
        let result, failure;
        request.onsuccess = () => {
          try {
            const state = request.result || initialState();
            if (state.version !== 2 || state.connection !== CONNECTION || state.schema !== SCHEMA) throw new Error('Score queue configuration mismatch');
            result = change(state);
            store.put(state, 'sender');
          } catch (error) { failure = error; transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure || transaction.error || new Error('Score queue transaction failed'));
        transaction.onerror = () => {};
      });
    }
    return { update: transact, read: () => transact((state) => structuredClone(state)), close: async () => { if (database) (await database).close(); } };
  }

  function retryDelay(attempt, retryAfter, now, random = Math.random) {
    const seconds = Number(retryAfter);
    const requested = retryAfter == null ? 0 : Number.isFinite(seconds)
      ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - now) || 0;
    return Math.max(1000, requested, random() * Math.min(300000, 1000 * 2 ** Math.min(attempt, 9)));
  }

  function receiptStatus(text, item) {
    const receipt = JSON.parse(text), batch = JSON.parse(item.body), event = batch.events[0];
    if (receipt.durable === false || receipt.batch_id !== batch.batch_id ||
        typeof receipt.receipt_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(receipt.receipt_id) ||
        typeof receipt.received_at !== 'string' || !Number.isFinite(Date.parse(receipt.received_at)) ||
        !Array.isArray(receipt.outcomes) || receipt.outcomes.length !== 1) throw new Error('INVALID_RECEIPT');
    const outcome = receipt.outcomes[0];
    if (outcome.event_id !== event.event_id || outcome.sequence !== event.sequence ||
        !['accepted', 'duplicate', 'rejected', 'retryable'].includes(outcome.status)) throw new Error('INVALID_RECEIPT');
    return outcome.status;
  }

  function create({ store, sourceStorage, fetch, token = sessionToken, uuid = uuidv7, now = Date.now, random = Math.random }) {
    let flushing = false;

    async function enqueue(source) {
      return store.update((state) => {
        const existing = state.records.find((item) => item.event_id === source.event_id);
        if (existing) {
          if (existing.source !== JSON.stringify(source)) throw new Error('EVENT_IDENTITY_CONFLICT');
          return source.event_id;
        }
        const sequence = state.next_sequence, batch_id = uuid();
        const body = JSON.stringify({ contract_version: 2, batch_id, queue_id: state.queue_id,
          first_sequence: sequence, events: [{ event_id: source.event_id, sequence, schema_version_id: SCHEMA,
            event_time: source.event_time, captured_at: source.captured_at, data: { score_cm: source.score_cm } }] });
        state.records.push({ event_id: source.event_id, source: JSON.stringify(source), batch_id, body,
          status: 'pending', attempts: 0, next_attempt_at: 0, uncertain: false, receipt: null, last_error: null });
        state.next_sequence = String(BigInt(sequence) + 1n);
        return source.event_id;
      });
    }

    async function recover() {
      const keys = [];
      for (let i = 0; i < sourceStorage.length; i++) {
        const key = sourceStorage.key(i);
        if (key && key.startsWith(PREFIX)) keys.push(key);
      }
      for (const key of keys) {
        const source = sourceStorage.getItem(key);
        if (source === null) continue;
        await enqueue(JSON.parse(source));
        sourceStorage.removeItem(key);
      }
    }

    function record(score) {
      if (!Number.isSafeInteger(score) || score < 0) throw new Error('Invalid material length');
      const time = new Date(now()).toISOString(), event_id = uuid();
      const source = { event_id, score_cm: String(score), event_time: time, captured_at: time };
      // Save synchronously before opening a transaction, including an immediate page close.
      sourceStorage.setItem(PREFIX + event_id, JSON.stringify(source));
      return enqueue(source).then(() => {
        sourceStorage.removeItem(PREFIX + event_id);
        void flush().catch(() => {});
        return event_id;
      });
    }

    async function flush() {
      if (flushing) return;
      flushing = true;
      try {
        await recover();
        const secret = token().trim();
        if (!secret) return;
        const state = await store.read();
        const item = state.records.find((record) => record.status !== 'delivered');
        if (!item || item.status === 'blocked' || item.next_attempt_at > now()) return;
        const headers = { Authorization: `Bearer ${secret}` };
        let response, text;
        try {
          if (item.uncertain) {
            response = await fetch(`${CONNECTION}/receipts/${item.batch_id}`, {
              headers, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
            });
            if (response.ok) text = await response.text();
            else if (response.status !== 404) throw new Error('LOOKUP_FAILED');
          }
          if (text === undefined) {
            // Persist before transmission, so a lost reply or closing tab needs no new identity.
            await store.update((current) => { current.records.find((r) => r.batch_id === item.batch_id).uncertain = true; });
            response = await fetch(CONNECTION + '/batches', {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': item.batch_id },
              body: item.body, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error('DELIVERY_FAILED');
            text = await response.text();
          }
          const status = receiptStatus(text, item);
          await store.update((current) => {
            const record = current.records.find((r) => r.batch_id === item.batch_id);
            if (record.status === 'delivered') return;
            record.receipt = text;
            record.status = ['accepted', 'duplicate'].includes(status) ? 'delivered' : status === 'rejected' ? 'blocked' : 'pending';
            record.uncertain = status !== 'retryable';
            record.next_attempt_at = now() + retryDelay(record.attempts++, response.headers.get('Retry-After'), now(), random);
            record.last_error = status === 'rejected' ? 'CLOUD_REJECTED' : null;
          });
        } catch (error) {
          await store.update((current) => {
            const record = current.records.find((r) => r.batch_id === item.batch_id);
            if (record.status === 'delivered') return;
            record.last_error = response && !response.ok ? `HTTP_${response.status}` : error.message === 'INVALID_RECEIPT' ? error.message : 'NETWORK_OR_STORAGE_ERROR';
            if (response && [400, 403, 409, 413, 422].includes(response.status)) record.status = 'blocked';
            record.next_attempt_at = now() + retryDelay(record.attempts++, response?.headers.get('Retry-After'), now(), random);
          });
        }
      } finally { flushing = false; }
    }

    async function validate() {
      const secret = token().trim();
      if (!secret) throw new Error('Open connect.html and enter an ingestion token first');
      const time = new Date(now()).toISOString(), batch_id = uuid();
      const body = JSON.stringify({ contract_version: 2, batch_id, queue_id: uuid(), first_sequence: '1',
        events: [{ event_id: uuid(), sequence: '1', schema_version_id: SCHEMA, event_time: time, captured_at: time, data: { score_cm: '120' } }] });
      const response = await fetch(CONNECTION + '/validate', { method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'Idempotency-Key': batch_id },
        body, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      const outcome = result.outcomes?.[0];
      const event = JSON.parse(body).events[0];
      if (!response.ok || result.durable !== false || result.batch_id !== batch_id ||
          !Array.isArray(result.outcomes) || result.outcomes.length !== 1 || outcome.valid !== true ||
          outcome.event_id !== event.event_id || outcome.sequence !== event.sequence) throw new Error('Synthetic validation failed');
      return result;
    }

    return { record, flush, validate, status: () => store.read() };
  }

  const api = { create, indexedStore, initialState, uuidv7, receiptStatus, retryDelay, sessionToken, TOKEN_KEY, PREFIX, CONNECTION, SCHEMA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.TelaTetrisScoreClient = api;
    if (root.document.currentScript?.hasAttribute('data-manual-start')) return;
    try {
      root.TelaTetrisScores = create({ store: indexedStore(root.indexedDB), sourceStorage: root.localStorage, fetch: root.fetch.bind(root) });
      const flush = () => { void root.TelaTetrisScores.flush().catch(() => console.warn('Score queue storage is unavailable.')); };
      root.addEventListener('online', flush);
      root.addEventListener('pageshow', flush);
      root.setInterval(flush, 2000);
      flush();
    } catch { console.warn('Score recording is unavailable. The game will continue.'); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
