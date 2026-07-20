// Invoked through Node by the repository scripts; keeping this importable lets
// the same implementation be exercised by Vitest on every supported platform.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const LEVEL_ID_PATTERN = /^off-l-[a-z]+(?:-[a-z]+)*$/;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const REFERENCE_SELECTOR = '.predrawn-reference-export-frame';
const READY_EXPRESSION = "document.querySelector('.predrawn-reference-export-frame')?.getAttribute('data-ready')==='true'";
const ARGUMENTS = new Set(['base-url', 'level-id', 'out', 'run-id']);

const USAGE = `Usage:
  npm run predrawn:prepare -- \\
    --base-url <running-app-url> \\
    --level-id <official-level-id> \\
    [--out <preparation-directory>] \\
    [--run-id <id>]

This prepares the canonical top-only reference and exact generation request,
self-validates them, and finishes at ready-for-generation. It never calls an
image model; owner judgment begins after a generated candidate exists.
`;

function fail(message) {
  throw new Error(`predrawn preparation: ${message}`);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function parseBaseUrl(value) {
  let url;
  try {
    url = new URL(requiredText(value, '--base-url'));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('predrawn preparation:')) throw error;
    fail('--base-url must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('--base-url must be an absolute http(s) URL without credentials');
  }
  if (url.search || url.hash) fail('--base-url must not contain a query or fragment');
  return url.href;
}

export function parsePreparationArgs(argv) {
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

  for (const name of ['base-url', 'level-id']) {
    if (!raw[name]) fail(`missing --${name}`);
  }
  const levelId = requiredText(raw['level-id'], '--level-id');
  if (!LEVEL_ID_PATTERN.test(levelId)) {
    fail('--level-id must be an official level id such as off-l-hold-bridge');
  }
  const runId = requiredText(raw['run-id'] ?? `${levelId.slice('off-l-'.length)}-isolated-v1`, '--run-id');
  if (!RUN_ID_PATTERN.test(runId)) {
    fail('--run-id may contain only lowercase letters, digits, dot, underscore, and hyphen');
  }

  return {
    help: false,
    baseUrl: parseBaseUrl(raw['base-url']),
    levelId,
    runId,
    outDir: raw.out ? requiredText(raw.out, '--out') : null,
  };
}

function commandStep(name, command, args, cwd) {
  return Object.freeze({ name, command, args: Object.freeze(args), cwd });
}

/**
 * Construct the complete preparation pipeline without executing it. Keeping this
 * pure makes the owner command testable without launching Chrome or a model.
 */
export function buildPreparationPlan(options, dependencies = {}) {
  const frontendRoot = path.resolve(dependencies.frontendRoot ?? FRONTEND_ROOT);
  const explicitNpmCommand = dependencies.npmCommand;
  const npmExecPath = dependencies.npmExecPath
    ?? process.env.npm_execpath
    ?? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCommand = explicitNpmCommand ?? process.execPath;
  const npmPrefixArgs = explicitNpmCommand ? [] : [npmExecPath];
  const nodeCommand = dependencies.nodeCommand ?? process.execPath;
  const runRoot = path.resolve(
    frontendRoot,
    options.outDir ?? path.join('tmp-shots', 'predrawn-preparation', options.runId),
  );
  const requestDir = path.join(runRoot, 'generation-request');
  const definitionPath = path.join(runRoot, 'definition.json');
  const provenancePath = path.join(runRoot, 'definition.provenance.json');
  const referencePath = path.join(runRoot, 'canonical-top-only.png');
  const manifestPath = path.join(requestDir, 'request-manifest.json');
  const referenceUrl = new URL('/predrawn-reference', options.baseUrl);
  referenceUrl.searchParams.set('levelId', options.levelId);
  referenceUrl.searchParams.set('capture', '1');

  const exportScript = path.join(frontendRoot, 'scripts', 'export-predrawn-generation-definition.mjs');
  const buildRunScript = path.join(frontendRoot, 'scripts', 'build-predrawn-generation-run.mjs');

  const steps = [
    commandStep('Build the shared board renderer', npmCommand, [...npmPrefixArgs, 'run', 'build:board-render'], frontendRoot),
    commandStep('Export the canonical level definition', nodeCommand, [
      exportScript,
      '--base-url', options.baseUrl,
      '--level-id', options.levelId,
      '--out', runRoot,
      '--run-id', options.runId,
    ], frontendRoot),
    commandStep('Capture the canonical top-only reference', npmCommand, [
      ...npmPrefixArgs, 'run', 'shot', '--', referenceUrl.href,
      '--select', REFERENCE_SELECTOR,
      '--out', referencePath,
      '--ready', READY_EXPRESSION,
    ], frontendRoot),
    commandStep('Build and validate the generation request', nodeCommand, [
      buildRunScript,
      '--definition', definitionPath,
      '--reference', referencePath,
      '--out', requestDir,
    ], frontendRoot),
  ];

  return Object.freeze({
    levelId: options.levelId,
    runId: options.runId,
    referenceUrl: referenceUrl.href,
    steps: Object.freeze(steps),
    paths: Object.freeze({
      runRoot,
      definition: definitionPath,
      provenance: provenancePath,
      reference: referencePath,
      prompt: path.join(requestDir, 'prompt.txt'),
      packet: path.join(requestDir, 'packet.json'),
      references: path.join(requestDir, 'references.json'),
      manifest: manifestPath,
    }),
  });
}

export function runCommand(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    child.once('error', (error) => {
      reject(new Error(`${step.name} could not start: ${error.message}`));
    });
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.name} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`));
    });
  });
}

export async function executePreparationPlan(plan, dependencies = {}) {
  const execute = dependencies.runCommand ?? runCommand;
  const readFileImpl = dependencies.readFile ?? readFile;
  for (const step of plan.steps) {
    dependencies.onStep?.(step);
    await execute(step);
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFileImpl(plan.paths.manifest, 'utf8'));
  } catch (error) {
    fail(`could not read the completed request manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest?.runId !== plan.runId) {
    fail(`request manifest run id does not match ${plan.runId}`);
  }
  if (manifest.status !== 'ready-for-generation') {
    fail(`request manifest must be ready-for-generation, received ${String(manifest.status)}`);
  }
  return { plan, manifest };
}

export function formatPreparationResult({ plan, manifest }) {
  return [
    '',
    `Prepared ${plan.levelId}. No image-generation call was made.`,
    `Status: ${manifest.status}`,
    `Top-only reference: ${plan.paths.reference}`,
    `Exact prompt: ${plan.paths.prompt}`,
    `Exact level data: ${plan.paths.packet}`,
    `Request manifest: ${plan.paths.manifest}`,
    `Canonical provenance: ${plan.paths.provenance}`,
    `Reference route: ${plan.referenceUrl}`,
    '',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parsePreparationArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return null;
  }
  const plan = buildPreparationPlan(options, dependencies);
  const result = await executePreparationPlan(plan, {
    ...dependencies,
    onStep: dependencies.onStep ?? ((step) => process.stdout.write(`\n${step.name}...\n`)),
  });
  process.stdout.write(formatPreparationResult(result));
  return result;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
