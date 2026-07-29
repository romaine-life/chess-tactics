const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  BGM_DELEGATION_KEY_REFRESH_SAFETY_MS,
  BGM_SAS_START_SKEW_MS,
  BGM_SAS_TTL_MS,
  BgmDelegationKeyCache,
  bgmTrackIdForBlobName,
  createAzureBgmStorage,
  createBgmCatalog,
  createBgmDelivery,
  isBgmTrackId,
  parseAzureBgmContainerUrl,
} = require('./bgmDelivery');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('track IDs are full deterministic domain-separated SHA-256 digests', () => {
  assert.equal(
    bgmTrackIdForBlobName('alpha.mp3'),
    'd56fabd557f29abe757a0c73aec6fd1f26909e47b0b6ffea077b7e27762421e0',
  );
  assert.equal(bgmTrackIdForBlobName('alpha.mp3').length, 64);
  assert.equal(isBgmTrackId(bgmTrackIdForBlobName('alpha.mp3')), true);
  assert.notEqual(bgmTrackIdForBlobName('alpha.mp3'), bgmTrackIdForBlobName('bravo.mp3'));
  assert.equal(isBgmTrackId('alpha.mp3'), false);
  assert.equal(isBgmTrackId(`${'a'.repeat(63)}A`), false);
});

test('catalog projects only app-owned routes and deterministic display metadata', () => {
  const catalog = createBgmCatalog([
    { blobName: 'bravo.mp3', title: ' Bravo ', artist: 'Artist' },
    { blobName: 'readme.txt', title: 'not audio' },
    { blobName: '01-alpha-track.mp3', album: 'Album' },
  ]);
  assert.equal(catalog.publicTracks.length, 2);
  assert.equal(catalog.publicTracks[0].title, 'Alpha Track');
  assert.equal(catalog.publicTracks[0].album, 'Album');
  assert.equal(catalog.publicTracks[1].title, 'Bravo');
  for (const track of catalog.publicTracks) {
    assert.match(track.id, /^[a-f0-9]{64}$/);
    assert.equal(track.url, `/api/bgm/tracks/${track.id}`);
    assert.doesNotMatch(JSON.stringify(track), /blob\.core\.windows\.net|\.mp3|\?/i);
  }
});

test('catalog rejects a silent collision between two distinct Blob names', () => {
  assert.throws(() => createBgmCatalog(
    [{ blobName: 'a.mp3' }, { blobName: 'b.mp3' }],
    { trackIdForBlobName: () => 'a'.repeat(64) },
  ), /bgm_track_id_collision/);
});

test('delivery resolves only current opaque IDs and drops a removed track after refresh', async () => {
  let nowMs = 1_000;
  let listed = [{ blobName: 'alpha.mp3', title: 'Alpha' }];
  const signed = [];
  const delivery = createBgmDelivery({
    listTracks: async () => listed,
    signTrack: async (track) => {
      signed.push(track.blobName);
      return `https://storage.example/${track.blobName}?sig=secret`;
    },
    now: () => nowMs,
    catalogTtlMs: 100,
    catalogRetryMs: 10,
  });

  const first = await delivery.playlist();
  const id = first.tracks[0].id;
  assert.equal(await delivery.playbackLocation(id), 'https://storage.example/alpha.mp3?sig=secret');
  assert.equal(await delivery.playbackLocation('alpha.mp3'), null);
  assert.equal(await delivery.playbackLocation('f'.repeat(64)), null);
  assert.deepEqual(signed, ['alpha.mp3']);

  listed = [];
  nowMs += 101;
  assert.deepEqual(await delivery.playlist(), { tracks: [] });
  assert.equal(await delivery.playbackLocation(id), null);
});

test('listing failure serves one coherent last-good catalog for playlist and resolution', async () => {
  let nowMs = 5_000;
  let fail = false;
  let listCalls = 0;
  const delivery = createBgmDelivery({
    listTracks: async () => {
      listCalls += 1;
      if (fail) throw new Error('storage unavailable');
      return [{ blobName: 'alpha.mp3', title: 'Alpha' }];
    },
    signTrack: async (track) => `https://storage.example/${track.blobName}?sig=secret`,
    now: () => nowMs,
    catalogTtlMs: 100,
    catalogRetryMs: 20,
  });
  const first = await delivery.playlist();
  fail = true;
  nowMs += 101;

  assert.deepEqual(await delivery.playlist(), first);
  assert.match(await delivery.playbackLocation(first.tracks[0].id), /^https:\/\/storage\.example\//);
  assert.equal(listCalls, 2);
});

test('delegation-key cache reuses a valid key and refreshes before it cannot cover a SAS', async () => {
  let nowMs = 10_000;
  let acquisitions = 0;
  const cache = new BgmDelegationKeyCache({
    now: () => nowMs,
    keyTtlMs: 10_000,
    startSkewMs: 100,
    refreshSafetyMs: 1_000,
    acquireKey: async (_startsOn, expiresOn) => ({
      key: { value: `key-${++acquisitions}` },
      expiresOn,
    }),
  });

  assert.deepEqual(await cache.getKey({ minimumValidityMs: 2_000 }), { value: 'key-1' });
  nowMs += 6_999;
  assert.deepEqual(await cache.getKey({ minimumValidityMs: 2_000 }), { value: 'key-1' });
  nowMs += 2;
  assert.deepEqual(await cache.getKey({ minimumValidityMs: 2_000 }), { value: 'key-2' });
  assert.equal(acquisitions, 2);
});

test('delegation-key cache coalesces concurrent refresh and recovers after failure', async () => {
  let nowMs = 20_000;
  let acquisitions = 0;
  const gate = deferred();
  const cache = new BgmDelegationKeyCache({
    now: () => nowMs,
    refreshSafetyMs: 10,
    keyTtlMs: 1_000,
    acquireKey: async (_startsOn, expiresOn) => {
      acquisitions += 1;
      if (acquisitions === 1) {
        await gate.promise;
        throw new Error('temporary identity failure');
      }
      return { key: { value: 'recovered' }, expiresOn };
    },
  });
  const first = cache.getKey({ minimumValidityMs: 100 });
  const second = cache.getKey({ minimumValidityMs: 100 });
  assert.equal(acquisitions, 1);
  gate.resolve();
  await assert.rejects(first, /temporary identity failure/);
  await assert.rejects(second, /temporary identity failure/);
  assert.deepEqual(await cache.getKey({ minimumValidityMs: 100 }), { value: 'recovered' });
  assert.equal(acquisitions, 2);
});

test('Azure storage signer emits a blob-specific read-only HTTPS user-delegation SAS', async () => {
  const nowMs = Date.parse('2026-07-29T12:00:00.000Z');
  const calls = { delegation: 0, sas: [] };
  const delegationKey = {
    signedExpiresOn: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    signedObjectId: 'object',
    signedTenantId: 'tenant',
    signedStartsOn: new Date(nowMs - BGM_SAS_START_SKEW_MS).toISOString(),
    signedService: 'b',
    signedVersion: '2024-11-04',
    value: 'never-log-this',
  };
  const container = {
    async *listBlobsFlat() {
      yield { name: 'alpha.mp3', metadata: { title: 'Alpha' } };
      yield { name: 'notes.txt', metadata: {} };
    },
    getBlobClient(blobName) {
      return { url: `https://media.example/bgm/${encodeURIComponent(blobName)}` };
    },
  };
  class FakeBlobServiceClient {
    getContainerClient(name) {
      assert.equal(name, 'bgm');
      return container;
    }

    async getUserDelegationKey(startsOn, expiresOn) {
      calls.delegation += 1;
      calls.keyStartsOn = startsOn;
      calls.keyExpiresOn = expiresOn;
      return delegationKey;
    }
  }
  const azure = {
    BlobServiceClient: FakeBlobServiceClient,
    BlobSASPermissions: {
      parse(value) {
        assert.equal(value, 'r');
        return { read: true, toString: () => 'r' };
      },
    },
    SASProtocol: { Https: 'https' },
    generateBlobSASQueryParameters(values, key, accountName) {
      calls.sas.push({ values, key, accountName });
      return { toString: () => 'sp=r&spr=https&se=bounded&sig=secret' };
    },
  };
  const storage = createAzureBgmStorage({
    containerUrl: 'https://chesstacticsmedia.blob.core.windows.net/bgm',
    credential: { kind: 'fake' },
    azure,
    now: () => nowMs,
  });

  assert.deepEqual(await storage.listTracks(), [{
    blobName: 'alpha.mp3',
    title: 'Alpha',
    artist: undefined,
    album: undefined,
  }]);
  const location = await storage.signTrack({ blobName: 'alpha.mp3' });
  assert.equal(
    location,
    'https://media.example/bgm/alpha.mp3?sp=r&spr=https&se=bounded&sig=secret',
  );
  assert.equal(calls.delegation, 1);
  assert.equal(calls.sas.length, 1);
  assert.equal(calls.sas[0].accountName, 'chesstacticsmedia');
  assert.equal(calls.sas[0].key, delegationKey);
  assert.equal(calls.sas[0].values.containerName, 'bgm');
  assert.equal(calls.sas[0].values.blobName, 'alpha.mp3');
  assert.equal(calls.sas[0].values.permissions.toString(), 'r');
  assert.equal(calls.sas[0].values.protocol, 'https');
  assert.equal(calls.sas[0].values.startsOn.getTime(), nowMs - BGM_SAS_START_SKEW_MS);
  assert.equal(calls.sas[0].values.expiresOn.getTime(), nowMs + BGM_SAS_TTL_MS);
  assert.ok(
    calls.keyExpiresOn.getTime() - calls.sas[0].values.expiresOn.getTime()
      > BGM_DELEGATION_KEY_REFRESH_SAFETY_MS,
  );
});

test('Azure container configuration is HTTPS Blob-only and names one container', () => {
  assert.deepEqual(
    parseAzureBgmContainerUrl('https://chesstacticsmedia.blob.core.windows.net/bgm/'),
    {
      accountName: 'chesstacticsmedia',
      accountUrl: 'https://chesstacticsmedia.blob.core.windows.net',
      containerName: 'bgm',
    },
  );
  assert.throws(() => parseAzureBgmContainerUrl('http://example.test/bgm'), /invalid/);
  assert.throws(
    () => parseAzureBgmContainerUrl('https://chesstacticsmedia.blob.core.windows.net/a/b'),
    /invalid/,
  );
  assert.throws(
    () => parseAzureBgmContainerUrl(
      'https://chesstacticsmedia.blob.core.windows.net/bgm?sv=secret-container-sas',
    ),
    /invalid/,
  );
});

test('test vectors still use the documented domain separator', () => {
  const expected = crypto
    .createHash('sha256')
    .update('chess-tactics:bgm-track:v1\0alpha.mp3')
    .digest('hex');
  assert.equal(bgmTrackIdForBlobName('alpha.mp3'), expected);
});
