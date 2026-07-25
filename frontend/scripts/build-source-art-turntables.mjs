// Render complete Blender-authored structure source-art turntables and optionally upload their
// exact sources plus eight private live-media candidates. Durable outputs are backend versions;
// this script writes only to an explicit outside-repository work directory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  LiveMediaAdminClient,
  downloadArchivedSourceBytes,
  latestArchivedSourceVersion,
  readCandidateBatchManifest,
  uploadCandidateBatch,
} from './live-media-admin-client.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const specPath = path.join(repoRoot, 'docs', 'art', 'source-art-turntables', 'manifest.json');
const renderScript = path.join(repoRoot, 'docs', 'art', 'doodad-concepts', 'render_prop_mesh.py');
const SPEC_SCHEMA = 'structure-source-art-turntable-spec-v1';
const BATCH_SCHEMA = 'live-media-candidate-batch-v1';
const SOURCE_ART_SCHEMA = 'structure-source-art-turntable-v1';
const DIRECTIONS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
const sevenZip = process.platform === 'win32'
  ? ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].find(fs.existsSync) ?? '7z'
  : '7z';

function sha256File(filename) {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} failed with exit ${result.status}: ${detail}`);
  }
  return result;
}

function walkFiles(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function extractArchiveFile(archive, destination) {
  if (path.extname(archive).toLowerCase() === '.rar') {
    run(sevenZip, ['x', archive, `-o${destination}`, '-y'], { inherit: true });
    return;
  }
  run('tar', ['-xf', archive, '-C', destination], { inherit: true });
}

function extractArchiveRecursively(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const marker = path.join(destination, '.source-art-extracted');
  if (!fs.existsSync(marker)) {
    extractArchiveFile(archive, destination);
    fs.writeFileSync(marker, `${sha256File(archive)}\n`);
  }
  const expanded = new Set();
  while (true) {
    const nested = walkFiles(destination).filter((filename) => (
      ['.zip', '.rar'].includes(path.extname(filename).toLowerCase()) && !expanded.has(filename)
    ));
    if (!nested.length) break;
    for (const filename of nested) {
      expanded.add(filename);
      const out = path.join(path.dirname(filename), `${path.basename(filename, path.extname(filename))}-expanded`);
      const nestedMarker = path.join(out, '.source-art-extracted');
      if (!fs.existsSync(nestedMarker)) {
        fs.mkdirSync(out, { recursive: true });
        extractArchiveFile(filename, out);
        fs.writeFileSync(nestedMarker, `${sha256File(filename)}\n`);
      }
    }
  }
}

function findModel(root, suffix) {
  const normalized = suffix.replaceAll('\\', '/').toLowerCase();
  const matches = walkFiles(root).filter((filename) => filename.replaceAll('\\', '/').toLowerCase().endsWith(normalized));
  if (matches.length !== 1) {
    throw new Error(`Expected one model ending in "${suffix}" under ${root}; found ${matches.length}: ${matches.join(', ')}`);
  }
  return matches[0];
}

function pngDimensions(filename) {
  const bytes = fs.readFileSync(filename);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) throw new Error(`Render is not PNG: ${filename}`);
  const png = PNG.sync.read(bytes);
  let visiblePixels = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] > 5) visiblePixels += 1;
  }
  return { width: png.width, height: png.height, byteLength: bytes.length, visiblePixels };
}

function parseArgs(argv) {
  const options = {
    sourceRoot: '',
    workDir: '',
    apiBase: '',
    blender: process.platform === 'win32'
      ? 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe'
      : 'blender',
    upload: false,
    reuseRenders: false,
    only: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (flag === '--source-root') options.sourceRoot = path.resolve(next());
    else if (flag === '--work-dir') options.workDir = path.resolve(next());
    else if (flag === '--api-base') options.apiBase = next();
    else if (flag === '--blender') options.blender = path.resolve(next());
    else if (flag === '--only') options.only.push(...next().split(',').map((value) => value.trim()).filter(Boolean));
    else if (flag === '--upload') options.upload = true;
    else if (flag === '--reuse-renders') options.reuseRenders = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.sourceRoot || !options.workDir) {
    throw new Error('Usage: build-source-art-turntables.mjs --source-root <staging-root> --work-dir <os-temp> [--api-base <url>] [--only id,...] [--reuse-renders] [--upload]');
  }
  if (isWithin(repoRoot, options.workDir)) throw new Error('The turntable work directory must be outside the Git repository');
  if (!fs.statSync(options.sourceRoot).isDirectory()) throw new Error(`Source root is not a directory: ${options.sourceRoot}`);
  if (options.upload && !options.apiBase) throw new Error('--upload requires --api-base');
  return options;
}

function validateSpec(raw) {
  if (raw?.schema !== SPEC_SCHEMA || !raw.batchId || !Array.isArray(raw.assets) || !raw.assets.length) {
    throw new Error(`Invalid ${SPEC_SCHEMA} specification`);
  }
  if (JSON.stringify(raw.directions) !== JSON.stringify(DIRECTIONS)) throw new Error('Turntable specification must use the canonical direction order');
  if (raw.render?.width !== 512 || raw.render?.height !== 512 || raw.render?.framing !== 'source') {
    throw new Error('Turntable source renders must use the canonical 512x512 source frame');
  }
  const ids = new Set();
  const structureIds = new Set();
  for (const asset of raw.assets) {
    if (!asset.id || !asset.structureId || !asset.label || !asset.source || ids.has(asset.id) || structureIds.has(asset.structureId)) {
      throw new Error(`Invalid or duplicate source-art asset: ${JSON.stringify(asset)}`);
    }
    ids.add(asset.id);
    structureIds.add(asset.structureId);
    if (!(Number.isFinite(asset.placementScale) && asset.placementScale > 0)) throw new Error(`${asset.id} requires placementScale > 0`);
    if (!['polyhaven', 'owner-archive'].includes(asset.source.kind)) throw new Error(`${asset.id} has unsupported source kind`);
    if (asset.source.framingScale !== undefined
      && !(Number.isFinite(asset.source.framingScale) && asset.source.framingScale > 0)) {
      throw new Error(`${asset.id} source.framingScale must be greater than zero when provided`);
    }
    if (asset.source.framingFocusHeight !== undefined
      && !(Number.isFinite(asset.source.framingFocusHeight)
        && asset.source.framingFocusHeight >= 0 && asset.source.framingFocusHeight < 1)) {
      throw new Error(`${asset.id} source.framingFocusHeight must be from zero up to, but not including, one`);
    }
    if (asset.source.excludeMaterials !== undefined
      && (!Array.isArray(asset.source.excludeMaterials)
        || asset.source.excludeMaterials.some((name) => typeof name !== 'string' || !name.trim())
        || new Set(asset.source.excludeMaterials.map((name) => name.trim().toLowerCase())).size
          !== asset.source.excludeMaterials.length)) {
      throw new Error(`${asset.id} source.excludeMaterials must contain unique non-empty material names`);
    }
    if (asset.source.includeObjects !== undefined
      && (!Array.isArray(asset.source.includeObjects)
        || !asset.source.includeObjects.length
        || asset.source.includeObjects.some((name) => typeof name !== 'string' || !name.trim())
        || new Set(asset.source.includeObjects.map((name) => name.trim())).size
          !== asset.source.includeObjects.length)) {
      throw new Error(`${asset.id} source.includeObjects must contain unique non-empty object names`);
    }
    if (asset.source.animationFrame !== undefined
      && (!Number.isInteger(asset.source.animationFrame) || asset.source.animationFrame < 0)) {
      throw new Error(`${asset.id} source.animationFrame must be an integer zero or greater`);
    }
    if (asset.source.sourceYaw !== undefined && !Number.isFinite(asset.source.sourceYaw)) {
      throw new Error(`${asset.id} source.sourceYaw must be finite`);
    }
    if (asset.source.sourceArchiveId !== undefined
      && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.source.sourceArchiveId)) {
      throw new Error(`${asset.id} source.sourceArchiveId must be a lowercase kebab-case id`);
    }
  }
  return raw;
}

async function preparePolyHaven(asset, options, client) {
  if (!options.apiBase || !client) throw new Error(`${asset.id} requires --api-base to retrieve its exact archived Poly Haven source`);
  run(process.execPath, [
    path.join(scriptDir, 'fetch-ph-model.mjs'),
    asset.source.providerAsset,
    '--api-base', options.apiBase,
    '--resolution', asset.source.resolution,
  ], { inherit: true, cwd: repoRoot });
  const catalog = await client.adminCatalog();
  const prefix = `providers/polyhaven/${asset.source.providerAsset}/`;
  const sourcePaths = [...new Set(catalog.versions
    .filter((version) => version.status === 'archived' && version.role === 'source'
      && version.domain === 'prop' && version.sourcePath?.startsWith(prefix)
      && !version.sourcePath.includes('.chunks/'))
    .map((version) => version.sourcePath))].sort();
  if (!sourcePaths.length) throw new Error(`No archived Poly Haven source set found for ${asset.id}`);
  const root = path.join(options.workDir, 'sources', asset.id);
  fs.mkdirSync(root, { recursive: true });
  const archiveRefs = [];
  for (const sourcePath of sourcePaths) {
    const version = latestArchivedSourceVersion(catalog, sourcePath, 'prop');
    const downloaded = await downloadArchivedSourceBytes({ client, catalog, version, domain: 'prop' });
    const relative = sourcePath.slice(prefix.length);
    const output = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, downloaded.bytes);
    archiveRefs.push({
      sourcePath,
      versionId: version.id,
      sha256: downloaded.verification.sha256,
      byteLength: downloaded.verification.byteLength,
    });
  }
  const model = path.join(root, asset.source.modelFile);
  if (!fs.existsSync(model)) throw new Error(`Archived Poly Haven model file is missing: ${model}`);
  return { model, textureRoot: root, archiveRefs, sourceId: null };
}

function prepareOwnerArchive(asset, options, archiveCache) {
  const archive = path.resolve(options.sourceRoot, ...asset.source.archive.split('/'));
  if (!isWithin(options.sourceRoot, archive) || !fs.existsSync(archive)) {
    throw new Error(`Owner source archive is missing: ${archive}`);
  }
  let shared = archiveCache.get(archive);
  if (!shared) {
    const sourceArchiveId = asset.source.sourceArchiveId ?? asset.id;
    const root = path.join(options.workDir, 'sources', sourceArchiveId);
    extractArchiveRecursively(archive, root);
    shared = { root, sourceId: `${sourceArchiveId}-source` };
    archiveCache.set(archive, shared);
  }
  return {
    model: findModel(shared.root, asset.source.modelSuffix),
    textureRoot: shared.root,
    archive,
    archiveRefs: [],
    sourceId: shared.sourceId,
  };
}

function renderAsset(asset, prepared, spec, options) {
  const output = path.join(options.workDir, 'renders', asset.id);
  const complete = DIRECTIONS.every((direction) => {
    const filename = path.join(output, `${direction}.png`);
    if (!fs.existsSync(filename)) return false;
    const dims = pngDimensions(filename);
    return dims.width === spec.render.width && dims.height === spec.render.height && dims.visiblePixels >= 64;
  });
  if (!complete || !options.reuseRenders) {
    fs.mkdirSync(output, { recursive: true });
    const renderArgs = [
      '--background',
      '--python', renderScript,
      '--',
      output,
      path.extname(prepared.model).toLowerCase() === '.blend' ? 'none' : prepared.model,
      String(spec.render.footprint),
      spec.render.half,
      asset.source.rotation,
      prepared.textureRoot,
      String(spec.render.width),
      String(spec.render.height),
      String(spec.render.translationZ),
      'all',
      spec.render.engine,
      spec.render.framing,
      String(asset.source.framingScale ?? 1),
      String(asset.source.framingFocusHeight ?? 0),
      (asset.source.excludeMaterials ?? []).join(','),
      (asset.source.includeObjects ?? []).join(','),
      asset.source.animationFrame === undefined ? '' : String(asset.source.animationFrame),
      String(asset.source.sourceYaw ?? 0),
    ];
    if (path.extname(prepared.model).toLowerCase() === '.blend') renderArgs.unshift(prepared.model);
    run(options.blender, renderArgs, { inherit: true, cwd: repoRoot });
  }
  for (const direction of DIRECTIONS) {
    const filename = path.join(output, `${direction}.png`);
    const dims = pngDimensions(filename);
    if (dims.width !== spec.render.width || dims.height !== spec.render.height) {
      throw new Error(`${asset.id}/${direction} rendered ${dims.width}x${dims.height}, expected ${spec.render.width}x${spec.render.height}`);
    }
    if (dims.visiblePixels < 64) throw new Error(`${asset.id}/${direction} rendered an empty or nearly empty source frame`);
  }
  return output;
}

function sourceArtMetadata(asset, direction) {
  return {
    schema: SOURCE_ART_SCHEMA,
    assetId: asset.id,
    structureId: asset.structureId,
    label: asset.label,
    sortOrder: asset.sortOrder,
    existing: asset.existing,
    sourceOnly: !asset.existing,
    structureKind: asset.existing ? null : 'landmark',
    direction,
    placementScale: asset.placementScale,
    license: asset.source.license,
    referenceOnly: true,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const spec = validateSpec(JSON.parse(fs.readFileSync(specPath, 'utf8')));
  const selected = options.only.length
    ? spec.assets.filter((asset) => options.only.includes(asset.id))
    : spec.assets;
  const unknown = options.only.filter((id) => !spec.assets.some((asset) => asset.id === id));
  if (unknown.length) throw new Error(`Unknown source-art ids: ${unknown.join(', ')}`);
  fs.mkdirSync(options.workDir, { recursive: true });
  const client = options.apiBase ? new LiveMediaAdminClient({ apiBase: options.apiBase }) : null;
  const sources = [];
  const candidates = [];
  const ownerArchiveCache = new Map();
  const emittedSourceIds = new Set();

  for (const asset of selected) {
    console.log(`SOURCE_ART_PREPARE ${asset.id}`);
    const prepared = asset.source.kind === 'polyhaven'
      ? await preparePolyHaven(asset, options, client)
      : prepareOwnerArchive(asset, options, ownerArchiveCache);
    const output = renderAsset(asset, prepared, spec, options);
    if (prepared.sourceId && !emittedSourceIds.has(prepared.sourceId)) {
      emittedSourceIds.add(prepared.sourceId);
      sources.push({
        id: prepared.sourceId,
        file: path.relative(options.workDir, prepared.archive).replaceAll('\\', '/'),
        sourcePath: asset.source.sourcePath,
        domain: 'prop',
        label: asset.source.sourceLabel ?? `${asset.label} · owner source archive`,
        mediaType: 'application/zip',
        metadata: {
          sourceArt: {
            schema: SOURCE_ART_SCHEMA,
            assetId: asset.source.sourceArchiveId ?? asset.id,
            license: asset.source.license,
          },
        },
        provenance: {
          provider: 'Owner supplied',
          originalRelativePath: asset.source.archive,
          license: asset.source.license,
        },
        reason: 'Exact owner-supplied source archive used by the structure source-art turntable batch.',
        evidence: {
          schema: 'structure-source-art-source-archive-v1',
          assetId: asset.id,
          renderer: 'docs/art/doodad-concepts/render_prop_mesh.py',
        },
      });
    }
    const requiredSlots = DIRECTIONS.map((direction) => `source-art/${asset.id}/${direction}.png`).sort();
    for (const direction of DIRECTIONS) {
      const filename = path.join(output, `${direction}.png`);
      const hash = sha256File(filename);
      candidates.push({
        id: `${asset.id}-${direction}`,
        file: path.relative(options.workDir, filename).replaceAll('\\', '/'),
        slot: `source-art/${asset.id}/${direction}.png`,
        domain: 'prop',
        role: 'source-art',
        label: `${asset.label} · ${direction}`,
        availabilityPolicy: 'decorative',
        sourceIds: prepared.sourceId ? [prepared.sourceId] : [],
        metadata: {
          sourceArt: sourceArtMetadata(asset, direction),
        },
        provenance: {
          schema: 'structure-source-art-render-provenance-v1',
          assetId: asset.id,
          direction,
          source: {
            kind: asset.source.kind,
            providerAsset: asset.source.providerAsset ?? null,
            sourcePath: asset.source.sourcePath ?? null,
            archivedVersions: prepared.archiveRefs,
            license: asset.source.license,
          },
          renderer: {
            application: 'Blender 5.1',
            script: 'docs/art/doodad-concepts/render_prop_mesh.py',
            engine: spec.render.engine,
            framing: spec.render.framing,
            framingScale: asset.source.framingScale ?? 1,
            framingFocusHeight: asset.source.framingFocusHeight ?? 0,
            excludedMaterials: asset.source.excludeMaterials ?? [],
            includedObjects: asset.source.includeObjects ?? [],
            animationFrame: asset.source.animationFrame ?? null,
            sourceYaw: asset.source.sourceYaw ?? 0,
            camera: 'fixed orthographic isometric',
            turntableAxis: '+Z',
            spatialResampling: false,
          },
          purpose: 'Placeholder Blender source artwork for floating board composition and later img2img.',
        },
        nativeEvidence: {
          native1x: true,
          spatialResampling: false,
          sourceWidth: spec.render.width,
          sourceHeight: spec.render.height,
          sourceSha256: hash,
        },
        slotMetadata: {
          acceptance: {
            mode: 'group',
            groupId: `source-art-eight-way:${asset.id}`,
            requiredSlots,
          },
          sourceArt: {
            schema: SOURCE_ART_SCHEMA,
            assetId: asset.id,
            direction,
          },
        },
      });
    }
  }

  const batchPath = path.join(options.workDir, 'source-art-candidate-batch.json');
  const selectedFingerprint = createHash('sha256')
    .update(selected.map((asset) => asset.id).sort().join('\n'))
    .digest('hex')
    .slice(0, 12);
  fs.writeFileSync(batchPath, `${JSON.stringify({
    schema: BATCH_SCHEMA,
    batchId: options.only.length ? `${spec.batchId}-${selectedFingerprint}` : spec.batchId,
    sources,
    candidates,
  }, null, 2)}\n`);
  console.log(`SOURCE_ART_BATCH_READY ${batchPath} ${selected.length} assets ${candidates.length} directions`);
  if (options.upload) {
    const manifest = readCandidateBatchManifest(batchPath);
    const result = await uploadCandidateBatch({ client, manifest });
    const resultPath = path.join(options.workDir, 'source-art-candidate-batch-result.json');
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`SOURCE_ART_BATCH_UPLOADED ${resultPath}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  console.error(`Temporary workspaces belong outside Git; a suitable default is ${path.join(os.tmpdir(), 'chess-tactics-source-art-turntables')}`);
  process.exitCode = 1;
});
