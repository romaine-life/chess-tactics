import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  exportPredrawnGenerationDefinition,
  parseArgs,
  sha256,
  stableJson,
} from './export-predrawn-generation-definition.mjs';

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('canonical pre-drawn generation definition export', () => {
  it('derives defaults from the official level id rather than one board shape', () => {
    const options = parseArgs([
      '--base-url', 'http://localhost:5173',
      '--level-id', 'off-l-hold-bridge',
      '--out', 'tmp-run',
    ]);

    expect(options).toMatchObject({
      levelId: 'off-l-hold-bridge',
      runId: 'hold-bridge-isolated-v1',
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/top-only-no-cover',
      provider: 'openai',
      model: 'imagegen-current',
    });
  });

  it('writes a clean definition plus stable canonical-workspace provenance', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'predrawn-definition-export-'));
    const firstLevel = {
      name: 'Hold the Bridge',
      id: 'off-l-hold-bridge',
      board: { rows: 8, cols: 12, heightLevels: 1 },
      layers: { terrain: [] },
    };
    const fetchImpl = vi.fn(async () => response({
      portfolio: {
        id: 'default',
        revision: 22,
        client_schema_version: 1,
        updated_at: '2026-07-14T01:02:03.000Z',
        data: {
          campaigns: [],
          levels: { 'off-l-hold-bridge': firstLevel },
        },
      },
      store_schema_version: 1,
    }));
    const buildDefinition = vi.fn((level, options) => ({
      schemaVersion: 2,
      runId: options.runId,
      levelId: level.id,
      board: { columns: level.board.cols, rows: level.board.rows },
    }));

    try {
      const result = await exportPredrawnGenerationDefinition({
        baseUrl: 'http://localhost:5173',
        levelId: 'off-l-hold-bridge',
        outDir,
        runId: 'hold-bridge-isolated-v1',
        referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/top-only-no-cover',
        provider: 'openai',
        model: 'imagegen-current',
      }, { fetchImpl, buildDefinition });

      expect(fetchImpl).toHaveBeenCalledWith(
        'http://localhost:5173/api/official-campaigns/default',
        expect.objectContaining({ cache: 'no-store' }),
      );
      expect(buildDefinition).toHaveBeenCalledWith(firstLevel, expect.objectContaining({
        runId: 'hold-bridge-isolated-v1',
      }));
      expect(JSON.parse(fs.readFileSync(result.definitionPath, 'utf8'))).toEqual({
        schemaVersion: 2,
        runId: 'hold-bridge-isolated-v1',
        levelId: 'off-l-hold-bridge',
        board: { columns: 12, rows: 8 },
      });
      expect(result.definition).not.toHaveProperty('provenance');
      expect(result.provenance).toMatchObject({
        source: { workspaceId: 'default', workspaceRevision: 22 },
        level: {
          id: 'off-l-hold-bridge',
          sha256: sha256(Buffer.from(stableJson(firstLevel), 'utf8')),
        },
        definition: { file: 'definition.json', schemaVersion: 2 },
      });

      const reorderedLevel = {
        layers: { terrain: [] },
        board: { heightLevels: 1, cols: 12, rows: 8 },
        id: 'off-l-hold-bridge',
        name: 'Hold the Bridge',
      };
      expect(stableJson(reorderedLevel)).toBe(stableJson(firstLevel));
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('fails closed when the requested level is absent from canonical officials', async () => {
    const fetchImpl = vi.fn(async () => response({
      portfolio: {
        id: 'default',
        revision: 1,
        data: { campaigns: [], levels: {} },
      },
      store_schema_version: 1,
    }));

    await expect(exportPredrawnGenerationDefinition({
      baseUrl: 'http://localhost:5173',
      levelId: 'off-l-hold-bridge',
      outDir: os.tmpdir(),
      runId: 'hold-bridge-isolated-v1',
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/top-only-no-cover',
      provider: 'openai',
      model: 'imagegen-current',
    }, { fetchImpl, buildDefinition: vi.fn() })).rejects.toThrow(
      /canonical official workspace does not contain level off-l-hold-bridge/,
    );
  });
});
