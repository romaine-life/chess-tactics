import { beforeAll, describe, expect, it } from 'vitest';
import { applyTestPropSeats } from '../test/livePropSeats';
import type { EditorBoard } from './boardCode';
import {
  isPredrawnLiveProp,
  isPredrawnLockedLayer,
  isPredrawnLockedPlacedArtKind,
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
  // The obstacle gate reads a prop's kind, and kinds are live DB-owned content.
  beforeAll(() => { applyTestPropSeats(); });

  it('locks the baked-art layers while retaining Level Artwork and live cover authoring', () => {
    expect(['tile', 'generate', 'paths', 'fence', 'wall', 'wallart', 'subterrain'].every((layer) => (
      isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
    expect(['board', 'camera', 'level-artwork', 'unit', 'cover', 'zone', 'rules', 'status', 'history'].every((layer) => (
      !isPredrawnLockedLayer(layer as Parameters<typeof isPredrawnLockedLayer>[0])
    ))).toBe(true);
  });

  it('keeps Placed Art open for obstacles alone, because the plate painted its own scenery', () => {
    // ADR-0534. Scene Art, Forest, Town and Doodads would offer edits the renderer then refuses to
    // show, so the destination stays reachable and narrows to the one thing that is not decoration.
    expect(isPredrawnLockedLayer('placed-art')).toBe(false);
    expect(isPredrawnLockedPlacedArtKind('prop')).toBe(false);
    expect((['artwork', 'forest', 'town', 'doodad'] as const).every(isPredrawnLockedPlacedArtKind)).toBe(true);
  });

  it('admits rocks onto a plate and nothing else', () => {
    expect(isPredrawnLiveProp('rock', 0, 0)).toBe(true);
    expect(isPredrawnLiveProp('oak', 0, 0)).toBe(false);
    expect(isPredrawnLiveProp('cottage', 0, 0)).toBe(false);
    // An id the catalog does not know is not an obstacle by default.
    expect(isPredrawnLiveProp('not-a-prop', 0, 0)).toBe(false);
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

  it('lets an obstacle stand on the plate while still refusing a prop that claims to be painted', () => {
    const current = board();
    // ADR-0534: a marked rock contradicts no pixel the plate owns, so the guard has nothing to
    // protect. The same placement without the marker claims to be baked geometry, and is refused.
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      props: { '2,7': { propId: 'rock' } },
      liveProps: ['2,7'],
    })).toBe(true);
    expect(preservesPredrawnBakedArt(current, {
      ...current,
      props: { '2,7': { propId: 'rock' } },
    })).toBe(false);
    // Erasing one is the same act in reverse.
    const withRock = { ...current, props: { '2,7': { propId: 'rock' } }, liveProps: ['2,7'] };
    expect(preservesPredrawnBakedArt(withRock, current)).toBe(true);
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
