import { describe, expect, it } from 'vitest';
import type { EditorBoard } from './boardCode';
import {
  isPredrawnLockedLayer,
  predrawnEditorHrefAfterPicker,
  preservesPredrawnBakedArt,
  sharesPredrawnSelection,
} from './predrawnEditorPolicy';

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
  it('locks Placed Art with the baked-art layers while retaining Level Artwork and live cover authoring', () => {
    expect(['tile', 'generate', 'paths', 'fence', 'wall', 'wallart', 'placed-art', 'subterrain'].every((layer) => (
      isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
    expect(['board', 'camera', 'level-artwork', 'unit', 'cover', 'zone', 'rules', 'status', 'history'].every((layer) => (
      !isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
  });

  it('rejects baked environment changes while permitting live cover, units, and tactical zones', () => {
    const current = board();
    expect(preservesPredrawnBakedArt(current, { ...current, surface: undefined })).toBe(true);
    expect(preservesPredrawnBakedArt(current, { ...current, cols: 6 })).toBe(false);
    expect(preservesPredrawnBakedArt(current, { ...current, cells: { '0,0': 'stone-surf-1' } })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      generatedRegions: [{ id: 'region-1', name: 'Region 1', cells: ['0,0'], sections: [{ terrain: 'sand', share: 100, covers: [] }], buffer: 0, wiggle: 0.5 }],
    })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      cover: { '0,0': 'sparse' },
      coverTypes: { '0,0': 'grass' },
    })).toBe(true);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      doodads: { '0,0': { doodadId: 'grass-tuft' } },
    })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      subterrain: { '0,0': 'stone-subterrain-1' },
    })).toBe(false);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      units: { '0,0': { unitId: 'rook', direction: 's', faction: 'navy-blue' } },
      zones: { '0,0': 'region' },
    })).toBe(true);
  });

  it('lets history step across a resize or grid slide while refusing another plate selection', () => {
    const current = board();
    // A resize and a hand placement both change the baked-art signature on purpose, and both are
    // committed as declared playable-window operations. Undo has to be able to walk back over them.
    expect(sharesPredrawnSelection(current, { ...current, cols: 6, rows: 7 })).toBe(true);
    expect(sharesPredrawnSelection(current, {
      ...current,
      predrawnPlateOffset: { left: 48, top: -24 },
      predrawnGridDetached: true,
    })).toBe(true);
    // A different plate answers to different geometry entirely, so history must not restore it.
    expect(sharesPredrawnSelection(current, {
      ...current,
      surface: { ...current.surface!, slot: 'boards/review/other/plate.png' } as typeof current.surface,
    })).toBe(false);
    expect(sharesPredrawnSelection(current, { ...current, surface: undefined })).toBe(false);
  });

  it('lands Done on the board editor instead of reopening calibration on refresh', () => {
    expect(predrawnEditorHrefAfterPicker(
      'http://localhost:5175/editor/level?document=doc-1&predrawnPicker=1&layer=board#top',
    )).toBe('/editor/level?document=doc-1&layer=board#top');
  });
});
