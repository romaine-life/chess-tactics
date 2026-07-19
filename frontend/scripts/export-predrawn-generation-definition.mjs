#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const OFFICIAL_WORKSPACE_PATH = '/api/official-campaigns/default';
const LEVEL_ID_PATTERN = /^off-l-[a-z]+(?:-[a-z]+)*$/;
const ARGUMENTS = new Set([
  'base-url',
  'level-id',
  'model',
  'out',
  'provider',
  'reference-source-slot',
  'run-id',
]);

const USAGE = `Usage:
  node scripts/export-predrawn-generation-definition.mjs \\
    --base-url <running-app-url> \\
    --level-id <official-level-id> \\
    --out <run-directory> \\
    [--run-id <id>] \\
    [--reference-source-slot <slot>] \\
    [--provider <provider>] \\
    [--model <model>]

The running app's public /api/official-campaigns/default response is the only
level authority. The command writes definition.json and
definition.provenance.json into the output directory.
`;

function fail(message) {
  throw new Error(`predrawn definition export: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Recursively sort object keys while preserving array order. */
export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

export function stableJson(value, pretty = false) {
  return `${JSON.stringify(stableValue(value), null, pretty ? 2 : undefined)}${pretty ? '\n' : ''}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function parseBaseUrl(value) {
  let url;
  try {
    url = new URL(requiredString(value, '--base-url'));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('predrawn definition export:')) throw error;
    fail('--base-url must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('--base-url must be an absolute http(s) URL without credentials');
  }
  if (url.search || url.hash) fail('--base-url must not contain a query or fragment');
  return url;
}

export function parseArgs(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: true };
  const raw = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      fail(`expected --name value, received ${flag ?? '<nothing>'}`);
    }
    const name = flag.slice(2);
    if (!ARGUMENTS.has(name)) fail(`unknown argument --${name}`);
    if (Object.hasOwn(raw, name)) fail(`duplicate argument --${name}`);
    raw[name] = value;
  }

  for (const name of ['base-url', 'level-id', 'out']) {
    if (!raw[name]) fail(`missing --${name}`);
  }
  const levelId = requiredString(raw['level-id'], '--level-id');
  if (!LEVEL_ID_PATTERN.test(levelId)) {
    fail('--level-id must be an official level id such as off-l-hold-bridge');
  }
  const slug = levelId.slice('off-l-'.length);
  const runId = requiredString(raw['run-id'] ?? `${slug}-isolated-v1`, '--run-id');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(runId)) {
    fail('--run-id may contain only lowercase letters, digits, dot, underscore, and hyphen');
  }

  return {
    help: false,
    baseUrl: parseBaseUrl(raw['base-url']).href,
    levelId,
    outDir: path.resolve(requiredString(raw.out, '--out')),
    runId,
    referenceSourceSlot: requiredString(
      raw['reference-source-slot']
        ?? `canonical-level-export/${levelId}/top-only-no-cover`,
      '--reference-source-slot',
    ),
    provider: requiredString(raw.provider ?? 'openai', '--provider'),
    model: requiredString(raw.model ?? 'imagegen-current', '--model'),
  };
}

function responseText(response) {
  return response.text().then((text) => text.trim().slice(0, 500)).catch(() => '');
}

export async function fetchCanonicalOfficialLevel({ baseUrl, levelId, fetchImpl = fetch }) {
  const endpoint = new URL(OFFICIAL_WORKSPACE_PATH, parseBaseUrl(baseUrl)).href;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    fail(`could not fetch ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response || typeof response.ok !== 'boolean') fail('fetch returned an invalid response');
  if (!response.ok) {
    const detail = await responseText(response);
    fail(`${endpoint} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    fail(`${endpoint} did not return valid JSON`);
  }
  if (!isRecord(body) || !isRecord(body.portfolio)) fail('official response is missing portfolio');
  const portfolio = body.portfolio;
  if (portfolio.id !== 'default') fail(`official response has unexpected portfolio id ${String(portfolio.id)}`);
  if (!Number.isSafeInteger(portfolio.revision) || portfolio.revision < 0) {
    fail('official response has an invalid workspace revision');
  }
  if (!isRecord(portfolio.data)) fail('official response is missing portfolio.data');
  if (!Array.isArray(portfolio.data.campaigns)) fail('official workspace campaigns must be an array');
  if (!isRecord(portfolio.data.levels)) fail('official workspace levels must be an object');
  if (!Object.hasOwn(portfolio.data.levels, levelId)) {
    fail(`canonical official workspace does not contain level ${levelId}`);
  }
  const level = portfolio.data.levels[levelId];
  if (!isRecord(level) || level.id !== levelId) {
    fail(`canonical level ${levelId} has a missing or mismatched id`);
  }

  return {
    endpoint,
    level,
    workspace: {
      id: portfolio.id,
      revision: portfolio.revision,
      clientSchemaVersion: portfolio.client_schema_version ?? null,
      storeSchemaVersion: body.store_schema_version ?? null,
      updatedAt: typeof portfolio.updated_at === 'string' ? portfolio.updated_at : null,
    },
  };
}

function loadDefinitionBuilder() {
  let boardRender;
  try {
    boardRender = require('@chess-tactics/board-render');
  } catch (error) {
    fail(
      `could not load the built @chess-tactics/board-render package; run npm run build:board-render first (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (typeof boardRender.buildPredrawnGenerationDefinition !== 'function') {
    fail('the built board-render package does not export buildPredrawnGenerationDefinition; rebuild it');
  }
  return boardRender.buildPredrawnGenerationDefinition;
}

export async function exportPredrawnGenerationDefinition(options, dependencies = {}) {
  const canonical = await fetchCanonicalOfficialLevel({
    baseUrl: options.baseUrl,
    levelId: options.levelId,
    fetchImpl: dependencies.fetchImpl ?? fetch,
  });
  const buildDefinition = dependencies.buildDefinition ?? loadDefinitionBuilder();
  const definition = buildDefinition(canonical.level, {
    runId: options.runId,
    referenceSourceSlot: options.referenceSourceSlot,
    provider: options.provider,
    model: options.model,
  });
  if (!isRecord(definition) || definition.levelId !== options.levelId) {
    fail('board-render returned an invalid or mismatched definition');
  }

  const definitionJson = stableJson(definition, true);
  const levelCanonicalJson = stableJson(canonical.level);
  const provenance = {
    schemaVersion: 1,
    kind: 'predrawn-generation-definition-provenance',
    source: {
      kind: 'canonical-official-campaign-workspace',
      endpoint: canonical.endpoint,
      workspaceId: canonical.workspace.id,
      workspaceRevision: canonical.workspace.revision,
      clientSchemaVersion: canonical.workspace.clientSchemaVersion,
      storeSchemaVersion: canonical.workspace.storeSchemaVersion,
      updatedAt: canonical.workspace.updatedAt,
    },
    level: {
      id: options.levelId,
      sha256: sha256(Buffer.from(levelCanonicalJson, 'utf8')),
      hashEncoding: 'json-object-keys-sorted-recursively-v1',
    },
    definition: {
      file: 'definition.json',
      schemaVersion: definition.schemaVersion ?? null,
      sha256: sha256(Buffer.from(definitionJson, 'utf8')),
    },
  };

  const definitionPath = path.join(options.outDir, 'definition.json');
  const provenancePath = path.join(options.outDir, 'definition.provenance.json');
  await mkdir(options.outDir, { recursive: true });
  await Promise.all([
    writeFile(definitionPath, definitionJson, 'utf8'),
    writeFile(provenancePath, stableJson(provenance, true), 'utf8'),
  ]);

  // Read back both artifacts before reporting success. This catches an incomplete or
  // externally-interfered write without mixing mutable provenance into definition.json.
  const [writtenDefinition, writtenProvenance] = await Promise.all([
    readFile(definitionPath, 'utf8'),
    readFile(provenancePath, 'utf8'),
  ]);
  if (writtenDefinition !== definitionJson || writtenProvenance !== stableJson(provenance, true)) {
    fail('artifact read-back verification failed');
  }

  return {
    definition,
    provenance,
    definitionPath,
    provenancePath,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const result = await exportPredrawnGenerationDefinition(options);
  process.stdout.write(`${result.definitionPath}\n${result.provenancePath}\n${result.provenance.level.sha256}\n`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
