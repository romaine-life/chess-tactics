#!/usr/bin/env node

// Archive an exact Poly Haven CC0 model (glTF + includes) as private live-media
// source versions. This command never writes a durable source tree: renderers
// fetch verified archived hashes into an OS temporary workspace through
// live-media-admin-client.mjs fetch-source.

import {
  archiveSourceBytes,
  LiveMediaAdminClient,
  mediaTypeFromBytes,
  sha256Bytes,
} from './live-media-admin-client.mjs';

function parseArgs(argv) {
  const options = {
    slug: argv[0] || '',
    apiBase: process.env.LIVE_MEDIA_API_BASE || '',
    resolution: '1k',
    headers: process.env.LIVE_MEDIA_COOKIE ? { Cookie: process.env.LIVE_MEDIA_COOKIE } : {},
  };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (flag === '--api-base') options.apiBase = next();
    else if (flag === '--cookie') options.headers.Cookie = next();
    else if (flag === '--resolution') options.resolution = next();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.slug || !options.apiBase) {
    throw new Error('usage: fetch-ph-model.mjs <slug> --api-base <backend> [--resolution 1k] [--cookie <cookie>]');
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(options.slug)) throw new Error('invalid Poly Haven slug');
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(options.resolution)) throw new Error('invalid Poly Haven resolution');
  return options;
}

function sourceRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('//')) throw new Error(`invalid source include path: ${value}`);
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`unsafe source include path: ${value}`);
  }
  return normalized;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const response = await fetch(`https://api.polyhaven.com/files/${encodeURIComponent(options.slug)}`);
  if (!response.ok) throw new Error(`Poly Haven API returned ${response.status}`);
  const api = await response.json();
  const gltf = api.gltf?.[options.resolution]?.gltf;
  if (!gltf?.url) throw new Error(`no gltf/${options.resolution} for ${options.slug}`);

  const mainName = sourceRelativePath(new URL(gltf.url).pathname.split('/').pop());
  const resources = [
    { relativePath: mainName, url: gltf.url },
    ...Object.entries(gltf.include ?? {}).map(([relativePath, info]) => ({
      relativePath: sourceRelativePath(relativePath),
      url: info.url,
    })),
  ];
  const client = new LiveMediaAdminClient({ apiBase: options.apiBase, headers: options.headers });
  const catalog = await client.adminCatalog();
  let archived = 0;
  let existing = 0;
  let bytesArchived = 0;

  for (const resource of resources) {
    const bytes = await fetchBytes(resource.url);
    const sha256 = sha256Bytes(bytes);
    const sourcePath = `providers/polyhaven/${options.slug}/${resource.relativePath}`;
    const alreadyArchived = catalog.versions.some((version) => (
      version.sourcePath === sourcePath && version.status === 'archived' && version.role === 'source'
      && version.media?.sha256 === sha256
    ));
    if (alreadyArchived) {
      existing += 1;
      console.error(`already archived ${sourcePath} ${sha256}`);
      continue;
    }
    const mediaType = mediaTypeFromBytes(resource.relativePath, bytes);
    await archiveSourceBytes({
      client,
      payload: {
        sourcePath,
        domain: 'prop',
        role: 'source',
        label: `Poly Haven ${options.slug}: ${resource.relativePath}`,
        metadata: { source: { relativePath: resource.relativePath, resolution: options.resolution } },
        provenance: {
          schema: 'external-source-provenance-v1',
          provider: 'Poly Haven',
          providerAsset: options.slug,
          sourceUrl: resource.url,
          license: 'CC0',
          resolution: options.resolution,
        },
      },
      bytes,
      mediaType,
      idempotencyKey: `polyhaven-${sha256}`,
      reason: 'Archive the exact external source bytes consumed by the prop generator.',
      evidence: {
        schema: 'external-source-archive-v1',
        provider: 'Poly Haven',
        providerAsset: options.slug,
        sourceUrl: resource.url,
        license: 'CC0',
      },
    });
    archived += 1;
    bytesArchived += bytes.length;
    console.error(`archived ${sourcePath} ${sha256}`);
  }

  console.log(JSON.stringify({
    status: 'polyhaven-source-archived',
    providerAsset: options.slug,
    resolution: options.resolution,
    archived,
    existing,
    bytesArchived,
  }, null, 2));
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
