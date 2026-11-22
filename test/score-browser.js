/* Isolated file-origin IndexedDB checks. The real score queue is never reset. */
(async () => {
  'use strict';
  const output = document.getElementById('result');
  const { create, indexedStore, uuidv7 } = window.TelaTetrisScoreClient;
  const progressKey = 'telatetris-synthetic-browser-check';
  let store;
  try {
    const saved = sessionStorage.getItem(progressKey);
    const progress = saved ? JSON.parse(saved) : { database: 'telatetris-synthetic-test-' + uuidv7() };
    store = indexedStore(indexedDB, progress.database);
    const scratch = new Map();
    const sourceStorage = { get length() { return scratch.size; }, key: (i) => [...scratch.keys()][i] ?? null,
      getItem: (key) => scratch.get(key) ?? null, setItem: (key, value) => scratch.set(key, value), removeItem: (key) => scratch.delete(key) };
    let secret = '';
    const posts = [];
    const sender = create({ store, sourceStorage, token: () => secret, fetch: async (url, options) => {
      if (!url.endsWith('/batches')) throw new Error('Unexpected request');
      posts.push(options.body);
      const batch = JSON.parse(options.body);
      return Response.json({ receipt_id: uuidv7(), batch_id: batch.batch_id,
        received_at: new Date().toISOString(), outcomes: [{ event_id: batch.events[0].event_id, sequence: batch.first_sequence, status: 'accepted' }] });
    } });
    if (!saved) {
      await sender.record(120);
      progress.original = (await sender.status()).records[0].body;
      sessionStorage.setItem(progressKey, JSON.stringify(progress));
      await store.close();
      location.reload();
      return;
    }
    const restored = await sender.status();
    if (restored.records[0].body !== progress.original) throw new Error('Reload changed batch bytes');
    await sender.flush();
    secret = 'synthetic-test-only';
    await sender.flush();
    if (posts.length !== 1 || posts[0] !== progress.original) throw new Error('Incorrect request replay');
    const delivered = await sender.status();
    if (delivered.records[0].status !== 'delivered' || !delivered.records[0].receipt) throw new Error('Receipt was not committed');
    secret = '';
    const otherStore = indexedStore(indexedDB, progress.database);
    const other = create({ store: otherStore, sourceStorage, token: () => '', fetch: async () => { throw new Error('Unexpected transmission'); } });
    await Promise.all([sender.record(130), other.record(140)]);
    const concurrent = await sender.status();
    if (concurrent.next_sequence !== '4' || concurrent.records.length !== 3) throw new Error('Concurrent sequence allocation failed');
    try { await store.update((state) => { state.next_sequence = '999'; throw new Error('synthetic abort'); }); } catch { /* Expected transaction abort. */ }
    if ((await sender.status()).next_sequence !== '4') throw new Error('Aborted transaction changed queue');
    await otherStore.close();
    await store.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(progress.database);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    sessionStorage.removeItem(progressKey);
    output.textContent = 'PASS\nOrigin: ' + location.origin + '\nIndexedDB persists across a real page reload.\nExact batch bytes and identities survive reload.\nCloud receipt commits before delivery acknowledgement.\nConcurrent browser connections allocate consecutive sequences.\nAborted transactions preserve the previous queue.\nNo network requests or real scores were sent.';
    document.title = 'PASS — TelaTetris browser sender verification';
  } catch (error) {
    if (store) await store.close().catch(() => {});
    output.textContent = 'FAIL\n' + error.message;
    document.title = 'FAIL — TelaTetris browser sender verification';
  }
})();
