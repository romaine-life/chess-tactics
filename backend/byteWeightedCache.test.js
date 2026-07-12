const assert = require('node:assert/strict');
const test = require('node:test');

const { ByteWeightedAsyncCache } = require('./byteWeightedCache');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('evicts least-recently-used values by byte weight', () => {
  const cache = new ByteWeightedAsyncCache({ maxBytes: 8 });
  const a = Buffer.alloc(4, 1);
  const b = Buffer.alloc(4, 2);
  const c = Buffer.alloc(4, 3);

  cache.set('a', a);
  cache.set('b', b);
  assert.equal(cache.get('a'), a);
  cache.set('c', c);

  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), a);
  assert.equal(cache.get('c'), c);
  assert.deepEqual(cache.stats(), { size: 2, bytes: 8, maxBytes: 8, inflight: 0 });
});

test('does not retain a value larger than the byte budget', async () => {
  const cache = new ByteWeightedAsyncCache({ maxBytes: 4 });
  let creates = 0;

  const first = await cache.getOrCreate('large', async () => {
    creates += 1;
    return Buffer.alloc(5);
  });
  const second = await cache.getOrCreate('large', async () => {
    creates += 1;
    return Buffer.alloc(5);
  });

  assert.equal(first.byteLength, 5);
  assert.equal(second.byteLength, 5);
  assert.equal(creates, 2);
  assert.deepEqual(cache.stats(), { size: 0, bytes: 0, maxBytes: 4, inflight: 0 });
});

test('deduplicates concurrent creation for the same cache key', async () => {
  const gate = deferred();
  const cache = new ByteWeightedAsyncCache({ maxBytes: 16 });
  let creates = 0;
  const create = async () => {
    creates += 1;
    await gate.promise;
    return Buffer.alloc(8, 7);
  };

  const first = cache.getOrCreate('thumb', create);
  const second = cache.getOrCreate('thumb', create);
  assert.equal(creates, 1);
  assert.equal(cache.stats().inflight, 1);
  gate.resolve();

  assert.equal(await first, await second);
  assert.equal(creates, 1);
  assert.deepEqual(cache.stats(), { size: 1, bytes: 8, maxBytes: 16, inflight: 0 });
});

test('failed creation clears in-flight state so the key can retry', async () => {
  const cache = new ByteWeightedAsyncCache({ maxBytes: 16 });
  await assert.rejects(cache.getOrCreate('thumb', async () => {
    throw new Error('render failed');
  }), /render failed/);

  const recovered = await cache.getOrCreate('thumb', async () => Buffer.alloc(3));
  assert.equal(recovered.byteLength, 3);
  assert.deepEqual(cache.stats(), { size: 1, bytes: 3, maxBytes: 16, inflight: 0 });
});
