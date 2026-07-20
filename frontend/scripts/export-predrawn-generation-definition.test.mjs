import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  exportPredrawnGenerationDefinition,
  parseArgs,
  sha256,
  stableJson,
} from './export-predrawn-generation-definition.mjs';

const require = createRequire(import.meta.url);

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function drawableMedia(slot, width, height) {
  const sha256 = 'a'.repeat(64);
  return {
    slot,
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      byteLength: 512,
      width,
      height,
    },
  };
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
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
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
    const drawableCatalog = {
      schemaVersion: 1,
      revision: 37,
      updatedAt: '2026-07-14T01:03:04.000Z',
      assets: [],
    };
    const fetchImpl = vi.fn(async (url) => response(url.endsWith('/api/drawable-catalog') ? drawableCatalog : {
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
    const applyDrawableCatalog = vi.fn();
    const buildDefinition = vi.fn((level, options) => ({
      schemaVersion: 3,
      runId: options.runId,
      levelId: level.id,
      reference: {
        sourceSlot: options.referenceSourceSlot,
        viewport: {
          version: 1,
          coordinateSpace: 'canonical-board-render-px-1x',
          x: -800,
          y: -450,
          width: 1600,
          height: 900,
        },
      },
      board: { columns: level.board.cols, rows: level.board.rows },
    }));

    try {
      const result = await exportPredrawnGenerationDefinition({
        baseUrl: 'http://localhost:5173',
        levelId: 'off-l-hold-bridge',
        outDir,
        runId: 'hold-bridge-isolated-v1',
        referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
        provider: 'openai',
        model: 'imagegen-current',
      }, { fetchImpl, applyDrawableCatalog, buildDefinition });

      expect(fetchImpl).toHaveBeenCalledWith(
        'http://localhost:5173/api/official-campaigns/default',
        expect.objectContaining({ cache: 'no-store' }),
      );
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://localhost:5173/api/drawable-catalog',
        expect.objectContaining({ cache: 'no-store' }),
      );
      expect(applyDrawableCatalog).toHaveBeenCalledWith(drawableCatalog);
      expect(buildDefinition).toHaveBeenCalledWith(firstLevel, expect.objectContaining({
        runId: 'hold-bridge-isolated-v1',
      }));
      expect(applyDrawableCatalog.mock.invocationCallOrder[0]).toBeLessThan(
        buildDefinition.mock.invocationCallOrder[0],
      );
      expect(JSON.parse(fs.readFileSync(result.definitionPath, 'utf8'))).toEqual({
        schemaVersion: 3,
        runId: 'hold-bridge-isolated-v1',
        levelId: 'off-l-hold-bridge',
        reference: {
          sourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
          viewport: {
            version: 1,
            coordinateSpace: 'canonical-board-render-px-1x',
            x: -800,
            y: -450,
            width: 1600,
            height: 900,
          },
        },
        board: { columns: 12, rows: 8 },
      });
      expect(result.definition).not.toHaveProperty('provenance');
      expect(result.provenance).toMatchObject({
        schemaVersion: 3,
        source: { workspaceId: 'default', workspaceRevision: 22 },
        drawableCatalog: {
          kind: 'live-drawable-catalog',
          endpoint: 'http://localhost:5173/api/drawable-catalog',
          schemaVersion: 1,
          revision: 37,
          updatedAt: '2026-07-14T01:03:04.000Z',
          sha256: sha256(Buffer.from(stableJson(drawableCatalog), 'utf8')),
          hashEncoding: 'json-object-keys-sorted-recursively-v1',
        },
        level: {
          id: 'off-l-hold-bridge',
          sha256: sha256(Buffer.from(stableJson(firstLevel), 'utf8')),
        },
        referenceViewport: {
          kind: 'canonical-level-predrawn-generation-frame',
          source: 'level.boardCode.predrawnGenerationFrame',
          version: 1,
          coordinateSpace: 'canonical-board-render-px-1x',
          x: -800,
          y: -450,
          width: 1600,
          height: 900,
          sha256: sha256(Buffer.from(stableJson({
            version: 1,
            coordinateSpace: 'canonical-board-render-px-1x',
            x: -800,
            y: -450,
            width: 1600,
            height: 900,
          }), 'utf8')),
        },
        definition: { file: 'definition.json', schemaVersion: 3 },
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
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
      provider: 'openai',
      model: 'imagegen-current',
    }, { fetchImpl, buildDefinition: vi.fn() })).rejects.toThrow(
      /canonical official workspace does not contain level off-l-hold-bridge/,
    );
  });

  it('fails closed before definition building when the live drawable catalog is unavailable', async () => {
    const level = {
      id: 'off-l-hold-bridge',
      board: { rows: 8, cols: 12, heightLevels: 1 },
      layers: { terrain: [] },
    };
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith('/api/drawable-catalog')) return response({ error: 'catalog down' }, 503);
      return response({
        portfolio: {
          id: 'default',
          revision: 1,
          data: { campaigns: [], levels: { 'off-l-hold-bridge': level } },
        },
        store_schema_version: 1,
      });
    });
    const applyDrawableCatalog = vi.fn();
    const buildDefinition = vi.fn();

    await expect(exportPredrawnGenerationDefinition({
      baseUrl: 'http://localhost:5173',
      levelId: 'off-l-hold-bridge',
      outDir: os.tmpdir(),
      runId: 'hold-bridge-isolated-v1',
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
      provider: 'openai',
      model: 'imagegen-current',
    }, { fetchImpl, applyDrawableCatalog, buildDefinition })).rejects.toThrow(
      /api\/drawable-catalog returned HTTP 503/,
    );
    expect(applyDrawableCatalog).not.toHaveBeenCalled();
    expect(buildDefinition).not.toHaveBeenCalled();
  });

  it('fails closed before definition building when the live catalog cannot be applied', async () => {
    const level = {
      id: 'off-l-hold-bridge',
      board: { rows: 8, cols: 12, heightLevels: 1 },
      layers: { terrain: [] },
    };
    const drawableCatalog = {
      schemaVersion: 1,
      revision: 2,
      updatedAt: null,
      assets: [],
    };
    const fetchImpl = vi.fn(async (url) => response(url.endsWith('/api/drawable-catalog') ? drawableCatalog : {
      portfolio: {
        id: 'default',
        revision: 1,
        data: { campaigns: [], levels: { 'off-l-hold-bridge': level } },
      },
      store_schema_version: 1,
    }));
    const applyDrawableCatalog = vi.fn(() => {
      throw new Error('invalid drawable catalog: required terrain composite is absent');
    });
    const buildDefinition = vi.fn();

    await expect(exportPredrawnGenerationDefinition({
      baseUrl: 'http://localhost:5173',
      levelId: 'off-l-hold-bridge',
      outDir: os.tmpdir(),
      runId: 'hold-bridge-isolated-v1',
      referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
      provider: 'openai',
      model: 'imagegen-current',
    }, { fetchImpl, applyDrawableCatalog, buildDefinition })).rejects.toThrow(
      /could not apply live drawable catalog.*invalid drawable catalog/,
    );
    expect(buildDefinition).not.toHaveBeenCalled();
  });

  it('hydrates the built renderer so canonical board codes containing macro tiles decode', async () => {
    const boardRender = require('@chess-tactics/board-render');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'predrawn-definition-macro-export-'));
    const catalog = {
      schemaVersion: 1,
      revision: 41,
      updatedAt: null,
      assets: [
        {
          id: 'terrain-family-grass',
          kind: 'terrain-family',
          label: 'Grass',
          sortOrder: 0,
          lifecycleState: 'active',
          behavior: {
            value: 'grass',
            default: true,
            gameplayTerrain: 'grass',
            rendersGameplayTerrains: ['grass'],
            roles: [],
          },
          metadata: {},
          rowRevision: 1,
          media: {},
        },
        {
          id: 'grass-surf-0',
          kind: 'terrain-surface',
          label: 'Grass surface',
          sortOrder: 1,
          lifecycleState: 'active',
          behavior: { family: 'grass', role: 'base', probability: 1 },
          metadata: {},
          rowRevision: 1,
          media: { top: drawableMedia('test/grass-top', 96, 180) },
        },
        {
          id: 'grass-macro-2x2',
          kind: 'terrain-composite',
          label: 'Grass composite',
          sortOrder: 2,
          lifecycleState: 'active',
          behavior: { family: 'grass', columns: 2, rows: 2, weight: 1 },
          metadata: {},
          rowRevision: 1,
          media: { surface: drawableMedia('test/grass-macro-2x2', 192, 216) },
        },
      ],
    };
    const boardCode = Buffer.from(JSON.stringify({
      c: 2,
      r: 2,
      f: 'grass-surf-0',
      mt: [['grass-macro-2x2', 0, 0]],
      pgf: [1, -320, -100, 640, 360],
    }), 'utf8').toString('base64url');
    const level = {
      formatVersion: 1,
      id: 'off-l-hold-bridge',
      name: 'Macro export regression',
      board: { cols: 2, rows: 2, heightLevels: 1 },
      boardCode,
      layers: {
        terrain: [
          { x: 0, y: 0, terrain: 'grass', elevation: 0 },
          { x: 1, y: 0, terrain: 'grass', elevation: 0 },
          { x: 0, y: 1, terrain: 'grass', elevation: 0 },
          { x: 1, y: 1, terrain: 'grass', elevation: 0 },
        ],
        decals: [],
        zones: [],
        units: [],
        props: [],
        fences: [],
      },
    };
    const fetchImpl = vi.fn(async (url) => response(url.endsWith('/api/drawable-catalog') ? catalog : {
      portfolio: {
        id: 'default',
        revision: 9,
        data: { campaigns: [], levels: { 'off-l-hold-bridge': level } },
      },
      store_schema_version: 1,
    }));

    try {
      const result = await exportPredrawnGenerationDefinition({
        baseUrl: 'http://localhost:5173',
        levelId: 'off-l-hold-bridge',
        outDir,
        runId: 'hold-bridge-isolated-v1',
        referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
        provider: 'openai',
        model: 'imagegen-current',
      }, { fetchImpl });

      expect(result.definition.board).toMatchObject({ columns: 2, rows: 2 });
      expect(result.provenance.drawableCatalog).toMatchObject({ revision: 41 });
    } finally {
      boardRender.resetDrawableCatalog();
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
