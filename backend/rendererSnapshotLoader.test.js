'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadRendererSnapshotSources } = require('./rendererSnapshotLoader');

function singleConnectionPool() {
  let held = false;
  const waiters = [];
  const checkout = () => {
    held = true;
    return {
      async query(label) {
        return { rows: [{ label }] };
      },
      release() {
        held = false;
        const next = waiters.shift();
        if (next) next(checkout());
      },
    };
  };
  return {
    async connect() {
      if (!held) return checkout();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

test('a renderer snapshot reuses the sole transaction client instead of waiting for another pool connection', async () => {
  const pool = singleConnectionPool();
  const transactionClient = await pool.connect();
  const seen = [];
  const readThrough = (name, value) => async (queryable) => {
    const client = queryable || await pool.connect();
    seen.push([name, client]);
    await client.query(name);
    if (!queryable) client.release();
    return value;
  };

  const availabilityReader = readThrough('availability', { revision: 1 });
  const loading = loadRendererSnapshotSources({
    queryable: transactionClient,
    readMediaCatalog: readThrough('media', { revision: 1 }),
    readDrawableCatalog: readThrough('drawable', { revision: 2 }),
    readPropSeats: readThrough('seats', { revision: 3, data: {} }),
    readUnitCatalog: readThrough('units', { revision: 4 }),
    readMediaAvailability: (_catalog, queryable) => availabilityReader(queryable),
  });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('renderer snapshot waited for a second pool connection')), 100);
  });
  const result = await Promise.race([loading, timeout]);

  assert.equal(result.mediaCatalog.revision, 1);
  assert.equal(result.drawableCatalog.revision, 2);
  assert.equal(result.seats.revision, 3);
  assert.equal(result.unitCatalog.revision, 4);
  assert.equal(result.mediaAvailability.revision, 1);
  assert.deepEqual(seen.map(([name]) => name).sort(), [
    'availability',
    'drawable',
    'media',
    'seats',
    'units',
  ]);
  assert.ok(seen.every(([, client]) => client === transactionClient));
  transactionClient.release();
});
