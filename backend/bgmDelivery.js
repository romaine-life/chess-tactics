const crypto = require('node:crypto');

const BGM_TRACK_ID_DOMAIN = 'chess-tactics:bgm-track:v1\0';
const BGM_TRACK_ID_PATTERN = /^[a-f0-9]{64}$/;
const BGM_CATALOG_TTL_MS = 5 * 60 * 1000;
const BGM_CATALOG_RETRY_MS = 30 * 1000;
const BGM_SAS_START_SKEW_MS = 5 * 60 * 1000;
const BGM_SAS_TTL_MS = 2 * 60 * 60 * 1000;
const BGM_DELEGATION_KEY_TTL_MS = 24 * 60 * 60 * 1000;
const BGM_DELEGATION_KEY_REFRESH_SAFETY_MS = 15 * 60 * 1000;

function bgmTrackIdForBlobName(blobName) {
  return crypto
    .createHash('sha256')
    .update(BGM_TRACK_ID_DOMAIN, 'utf8')
    .update(String(blobName), 'utf8')
    .digest('hex');
}

function isBgmTrackId(value) {
  return BGM_TRACK_ID_PATTERN.test(String(value || ''));
}

function bgmTitleFromName(file) {
  const base = String(file).replace(/\.mp3$/i, '').replace(/^\d+\s*[-._\s]\s*/, '');
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1)) || String(file);
}

function optionalMetadata(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compareBlobNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function createBgmCatalog(entries, { trackIdForBlobName = bgmTrackIdForBlobName } = {}) {
  const tracks = [];
  const byId = new Map();
  const list = Array.isArray(entries) ? entries : [];

  for (const raw of list) {
    const blobName = raw && typeof raw.blobName === 'string' ? raw.blobName : '';
    if (!blobName || !/\.mp3$/i.test(blobName)) continue;

    const id = trackIdForBlobName(blobName);
    if (!isBgmTrackId(id)) throw new Error('bgm_track_id_invalid');
    const existing = byId.get(id);
    if (existing && existing.blobName !== blobName) {
      throw new Error('bgm_track_id_collision');
    }
    if (existing) continue;

    const title = optionalMetadata(raw.title) || bgmTitleFromName(blobName);
    const artist = optionalMetadata(raw.artist);
    const album = optionalMetadata(raw.album);
    const internal = Object.freeze({
      id,
      blobName,
      title,
      ...(artist ? { artist } : {}),
      ...(album ? { album } : {}),
    });
    byId.set(id, internal);
    tracks.push(internal);
  }

  tracks.sort((left, right) => compareBlobNames(left.blobName, right.blobName));
  const publicTracks = Object.freeze(tracks.map((track) => Object.freeze({
    id: track.id,
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.album ? { album: track.album } : {}),
    url: `/api/bgm/tracks/${track.id}`,
  })));

  return Object.freeze({ publicTracks, byId });
}

const EMPTY_BGM_CATALOG = createBgmCatalog([]);

function safeBgmErrorCode(error) {
  const candidate = error && (error.code || error.name);
  const code = String(candidate || 'error').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return code.slice(0, 80) || 'error';
}

class BgmCatalogCache {
  constructor({
    listTracks,
    now = Date.now,
    ttlMs = BGM_CATALOG_TTL_MS,
    retryMs = BGM_CATALOG_RETRY_MS,
    onEvent = () => {},
  }) {
    if (typeof listTracks !== 'function') throw new TypeError('listTracks is required');
    this.listTracks = listTracks;
    this.now = now;
    this.ttlMs = ttlMs;
    this.retryMs = retryMs;
    this.onEvent = onEvent;
    this.catalog = null;
    this.nextRefreshAt = 0;
    this.inflight = null;
  }

  async getCatalog() {
    const nowMs = this.now();
    if (nowMs < this.nextRefreshAt) return this.catalog || EMPTY_BGM_CATALOG;
    if (this.inflight) return this.inflight;

    const startedAt = nowMs;
    const refresh = (async () => {
      try {
        const entries = await this.listTracks();
        const catalog = createBgmCatalog(entries);
        this.catalog = catalog;
        this.nextRefreshAt = this.now() + this.ttlMs;
        this.onEvent('catalog_refresh_success', {
          durationMs: Math.max(0, this.now() - startedAt),
          trackCount: catalog.publicTracks.length,
        });
        return catalog;
      } catch (error) {
        const usedLastGood = Boolean(this.catalog);
        this.nextRefreshAt = this.now() + this.retryMs;
        this.onEvent('catalog_refresh_failure', {
          durationMs: Math.max(0, this.now() - startedAt),
          errorCode: safeBgmErrorCode(error),
          usedLastGood,
        });
        return this.catalog || EMPTY_BGM_CATALOG;
      }
    })();
    this.inflight = refresh;
    try {
      return await refresh;
    } finally {
      if (this.inflight === refresh) this.inflight = null;
    }
  }
}

function delegationKeyExpiryMs(result, requestedExpiresOn) {
  const key = result && result.key ? result.key : result;
  const rawExpiry = (result && result.expiresOn)
    || (key && (key.signedExpiresOn || key.signedExpiry))
    || requestedExpiresOn;
  const expiresAtMs = rawExpiry instanceof Date ? rawExpiry.getTime() : Date.parse(String(rawExpiry || ''));
  if (!Number.isFinite(expiresAtMs)) throw new Error('bgm_delegation_key_expiry_invalid');
  return { key, expiresAtMs };
}

class BgmDelegationKeyCache {
  constructor({
    acquireKey,
    now = Date.now,
    keyTtlMs = BGM_DELEGATION_KEY_TTL_MS,
    startSkewMs = BGM_SAS_START_SKEW_MS,
    refreshSafetyMs = BGM_DELEGATION_KEY_REFRESH_SAFETY_MS,
    onEvent = () => {},
  }) {
    if (typeof acquireKey !== 'function') throw new TypeError('acquireKey is required');
    this.acquireKey = acquireKey;
    this.now = now;
    this.keyTtlMs = keyTtlMs;
    this.startSkewMs = startSkewMs;
    this.refreshSafetyMs = refreshSafetyMs;
    this.onEvent = onEvent;
    this.cached = null;
    this.inflight = null;
  }

  hasEnoughValidity(minimumValidityMs) {
    return Boolean(
      this.cached
      && this.cached.expiresAtMs >= this.now() + minimumValidityMs + this.refreshSafetyMs,
    );
  }

  async getKey({ minimumValidityMs = BGM_SAS_TTL_MS } = {}) {
    if (this.hasEnoughValidity(minimumValidityMs)) return this.cached.key;
    if (this.inflight) {
      await this.inflight;
      return this.getKey({ minimumValidityMs });
    }

    const startedAt = this.now();
    const startsOn = new Date(startedAt - this.startSkewMs);
    const requestedExpiresOn = new Date(startedAt + this.keyTtlMs);
    const refresh = (async () => {
      try {
        const result = await this.acquireKey(startsOn, requestedExpiresOn);
        const cached = delegationKeyExpiryMs(result, requestedExpiresOn);
        if (cached.expiresAtMs < this.now() + minimumValidityMs + this.refreshSafetyMs) {
          throw new Error('bgm_delegation_key_validity_insufficient');
        }
        this.cached = cached;
        this.onEvent('delegation_key_refresh_success', {
          durationMs: Math.max(0, this.now() - startedAt),
        });
      } catch (error) {
        this.onEvent('delegation_key_refresh_failure', {
          durationMs: Math.max(0, this.now() - startedAt),
          errorCode: safeBgmErrorCode(error),
        });
        throw error;
      }
    })();
    this.inflight = refresh;
    try {
      await refresh;
      return this.cached.key;
    } finally {
      if (this.inflight === refresh) this.inflight = null;
    }
  }
}

function parseAzureBgmContainerUrl(containerUrl) {
  const url = new URL(containerUrl);
  if (
    url.protocol !== 'https:'
    || !/(^|\.)blob\.core\.windows\.net$/i.test(url.hostname)
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
  ) {
    throw new Error('bgm_container_url_invalid');
  }
  const containerName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  if (!containerName || containerName.includes('/')) throw new Error('bgm_container_name_invalid');
  return {
    accountName: url.hostname.split('.')[0],
    accountUrl: `${url.protocol}//${url.host}`,
    containerName,
  };
}

function createAzureBgmStorage({
  containerUrl,
  credential,
  azure,
  now = Date.now,
  onEvent = () => {},
}) {
  const sdk = azure || require('@azure/storage-blob');
  const { DefaultAzureCredential } = require('@azure/identity');
  const location = parseAzureBgmContainerUrl(containerUrl);
  const service = new sdk.BlobServiceClient(
    location.accountUrl,
    credential || new DefaultAzureCredential(),
  );
  const container = service.getContainerClient(location.containerName);
  const delegationKeys = new BgmDelegationKeyCache({
    acquireKey: async (startsOn, expiresOn) => service.getUserDelegationKey(startsOn, expiresOn),
    now,
    onEvent,
  });

  async function listTracks() {
    const tracks = [];
    for await (const blob of container.listBlobsFlat({ includeMetadata: true })) {
      if (!blob || typeof blob.name !== 'string' || !/\.mp3$/i.test(blob.name)) continue;
      const metadata = blob.metadata || {};
      tracks.push({
        blobName: blob.name,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
      });
    }
    return tracks;
  }

  async function signTrack(track) {
    const issuedAt = now();
    const startsOn = new Date(issuedAt - BGM_SAS_START_SKEW_MS);
    const expiresOn = new Date(issuedAt + BGM_SAS_TTL_MS);
    const key = await delegationKeys.getKey({ minimumValidityMs: BGM_SAS_TTL_MS });
    const parameters = sdk.generateBlobSASQueryParameters({
      containerName: location.containerName,
      blobName: track.blobName,
      permissions: sdk.BlobSASPermissions.parse('r'),
      protocol: sdk.SASProtocol.Https,
      startsOn,
      expiresOn,
    }, key, location.accountName);
    const blobUrl = container.getBlobClient(track.blobName).url;
    return `${blobUrl}?${parameters.toString()}`;
  }

  return Object.freeze({ listTracks, signTrack });
}

function createBgmDelivery({
  listTracks,
  signTrack,
  now = Date.now,
  onEvent = () => {},
  catalogTtlMs = BGM_CATALOG_TTL_MS,
  catalogRetryMs = BGM_CATALOG_RETRY_MS,
}) {
  if (typeof signTrack !== 'function') throw new TypeError('signTrack is required');
  const cache = new BgmCatalogCache({
    listTracks,
    now,
    ttlMs: catalogTtlMs,
    retryMs: catalogRetryMs,
    onEvent,
  });

  return Object.freeze({
    async playlist() {
      const catalog = await cache.getCatalog();
      return { tracks: catalog.publicTracks };
    },
    async playbackLocation(trackId) {
      if (!isBgmTrackId(trackId)) return null;
      const catalog = await cache.getCatalog();
      const track = catalog.byId.get(trackId);
      if (!track) return null;
      return signTrack(track);
    },
  });
}

module.exports = {
  BGM_CATALOG_RETRY_MS,
  BGM_CATALOG_TTL_MS,
  BGM_DELEGATION_KEY_REFRESH_SAFETY_MS,
  BGM_DELEGATION_KEY_TTL_MS,
  BGM_SAS_START_SKEW_MS,
  BGM_SAS_TTL_MS,
  BgmCatalogCache,
  BgmDelegationKeyCache,
  bgmTitleFromName,
  bgmTrackIdForBlobName,
  createAzureBgmStorage,
  createBgmCatalog,
  createBgmDelivery,
  isBgmTrackId,
  parseAzureBgmContainerUrl,
};
