import { describe, expect, it } from 'vitest';
import type { EditorBoard } from './boardCode';
import { isPredrawnLockedLayer, predrawnEditorHrefAfterPicker, preservesPredrawnBakedArt } from './predrawnEditorPolicy';

const board = (): EditorBoard => ({
  cols: 5,
  rows: 11,
  cells: { '0,0': 'sand-surf-1' },
  surface: {
    kind: 'predrawn',
    slot: 'boards/review/fortress-gate/plate.png',
    frameWidth: 1672,
    frameHeight: 940,
  },
  units: {},
  doodads: {},
  props: {},
  cover: {},
  features: {},
  fences: {},
  fencePosts: {},
  walls: {},
  wallArt: {},
  featureCuts: {},
  featureExits: {},
  zoneEntries: [],
  zones: {},
  generatedRegions: [],
});

describe('pre-drawn editor policy', () => {
  it('locks every authoring layer whose pixels are baked into the continuous plate', () => {
    expect(['tile', 'generate', 'paths', 'fence', 'wall', 'wallart', 'prop'].every((layer) => (
      isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
    expect(['board', 'unit', 'doodad', 'cover', 'zone', 'rules', 'status'].every((layer) => (
      !isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
  });

  it('rejects baked geometry changes while permitting additive live overlays', () => {
    const current = board();
    expect(preservesPredrawnBakedArt(current, { ...current, cols: 6 })).toBe(false);
    expect(preservesPredrawnBakedArt(current, { ...current, cells: { '0,0': 'stone-surf-1' } })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      generatedRegions: [{ id: 'region-1', name: 'Region 1', cells: ['0,0'], sections: [{ terrain: 'sand', share: 100, covers: [] }], buffer: 0, wiggle: 0.5 }],
    })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      units: { '0,0': { unitId: 'rook', direction: 's', faction: 'navy-blue' } },
      cover: { '0,0': 'sparse' },
      zones: { '0,0': 'region' },
    })).toBe(true);
  });

  it('lands Done on the board editor instead of reopening calibration on refresh', () => {
    expect(predrawnEditorHrefAfterPicker(
      'http://localhost:5175/editor/level?document=doc-1&predrawnPicker=1&layer=board#top',
    )).toBe('/editor/level?document=doc-1&layer=board#top');
  });
});
