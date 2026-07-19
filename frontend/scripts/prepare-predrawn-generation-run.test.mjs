import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPreparationPlan,
  executePreparationPlan,
  formatPreparationResult,
  parsePreparationArgs,
} from './prepare-predrawn-generation-run.mjs';

const frontendRoot = path.resolve('C:/work/chess-tactics/frontend');

function holdBridgeOptions(overrides = {}) {
  return {
    help: false,
    baseUrl: 'http://localhost:5173/',
    levelId: 'off-l-hold-bridge',
    runId: 'hold-bridge-isolated-v1',
    outDir: null,
    ...overrides,
  };
}

describe('single-command pre-drawn preparation', () => {
  it('requires only a running app URL and canonical official level id', () => {
    expect(parsePreparationArgs([
      '--base-url', 'http://localhost:5173',
      '--level-id', 'off-l-hold-bridge',
    ])).toEqual(holdBridgeOptions());

    expect(() => parsePreparationArgs([
      '--base-url', 'http://localhost:5173',
    ])).toThrow(/missing --level-id/);
  });

  it('constructs the generic pipeline without hard-coded board or art dimensions', () => {
    const plan = buildPreparationPlan(holdBridgeOptions(), {
      frontendRoot,
      npmCommand: 'npm-test',
      nodeCommand: 'node-test',
    });

    expect(plan.steps.map((step) => step.name)).toEqual([
      'Build the shared board renderer',
      'Export the canonical level definition',
      'Capture the canonical top-only reference',
      'Build and validate the generation request',
    ]);
    expect(plan.referenceUrl).toBe(
      'http://localhost:5173/predrawn-reference?levelId=off-l-hold-bridge&capture=1',
    );

    const capture = plan.steps[2];
    expect(capture.command).toBe('npm-test');
    expect(capture.args).toEqual([
      'run', 'shot', '--', plan.referenceUrl,
      '--select', '.predrawn-reference-export-frame',
      '--out', plan.paths.reference,
      '--ready', "document.querySelector('.predrawn-reference-export-frame')?.getAttribute('data-ready')==='true'",
    ]);
    expect(capture.args).not.toContain('--size');

    const definition = plan.steps[1];
    expect(definition.args).toEqual(expect.arrayContaining([
      '--level-id', 'off-l-hold-bridge',
      '--base-url', 'http://localhost:5173/',
    ]));
    const buildRequest = plan.steps[3];
    expect(buildRequest.args).toEqual(expect.arrayContaining([
      '--definition', plan.paths.definition,
      '--reference', plan.paths.reference,
      '--out', path.dirname(plan.paths.manifest),
    ]));

    const serialized = JSON.stringify(plan);
    expect(serialized).not.toMatch(/--(?:width|height|columns|rows|size)/);
    expect(serialized).not.toMatch(/imagegen|image-generation|generate-image/);
  });

  it('runs npm through Node without a Windows command-shell dependency', () => {
    const plan = buildPreparationPlan(holdBridgeOptions(), {
      frontendRoot,
      nodeCommand: 'node-test',
      npmExecPath: 'C:/tools/npm-cli.js',
    });

    expect(plan.steps[0]).toMatchObject({
      command: process.execPath,
      args: ['C:/tools/npm-cli.js', 'run', 'build:board-render'],
    });
    expect(plan.steps[2].args.slice(0, 4)).toEqual([
      'C:/tools/npm-cli.js', 'run', 'shot', '--',
    ]);
  });

  it('derives a separate run from a different level id without a board-specific branch', () => {
    const plan = buildPreparationPlan(holdBridgeOptions({
      levelId: 'off-l-fortress-gate',
      runId: 'fortress-gate-isolated-v1',
      outDir: 'tmp-shots/custom-fortress-review',
    }), { frontendRoot, npmCommand: 'npm-test', nodeCommand: 'node-test' });

    expect(plan.paths.runRoot).toBe(path.resolve(frontendRoot, 'tmp-shots/custom-fortress-review'));
    expect(plan.referenceUrl).toContain('levelId=off-l-fortress-gate');
    expect(plan.steps[1].args).toContain('off-l-fortress-gate');
    expect(plan.steps[2].args).toContain(plan.paths.reference);
  });

  it('runs each deterministic step once and reports a self-validated request ready for generation', async () => {
    const plan = buildPreparationPlan(holdBridgeOptions(), {
      frontendRoot,
      npmCommand: 'npm-test',
      nodeCommand: 'node-test',
    });
    const executed = [];
    const runCommand = vi.fn(async (step) => executed.push(step.name));
    const readFile = vi.fn(async () => JSON.stringify({
      runId: plan.runId,
      status: 'ready-for-generation',
    }));

    const result = await executePreparationPlan(plan, { runCommand, readFile });

    expect(executed).toEqual(plan.steps.map((step) => step.name));
    expect(runCommand).toHaveBeenCalledTimes(4);
    expect(readFile).toHaveBeenCalledWith(plan.paths.manifest, 'utf8');
    expect(formatPreparationResult(result)).toContain('No image-generation call was made.');
    expect(formatPreparationResult(result)).toContain(plan.paths.prompt);
  });

  it('fails closed if the generic builder does not report ready for generation', async () => {
    const plan = buildPreparationPlan(holdBridgeOptions(), {
      frontendRoot,
      npmCommand: 'npm-test',
      nodeCommand: 'node-test',
    });
    await expect(executePreparationPlan(plan, {
      runCommand: async () => {},
      readFile: async () => JSON.stringify({ runId: plan.runId, status: 'generated' }),
    })).rejects.toThrow(/must be ready-for-generation/);
  });
});
