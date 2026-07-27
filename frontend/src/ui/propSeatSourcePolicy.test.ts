import { afterEach, describe, expect, it } from 'vitest';
import { applyDrawableCatalog } from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
import {
  propSeatDraftSourceIssue,
  propSeatSourceIsGameplayEligible,
  propSeatStructureArtOptions,
} from './propSeatSourcePolicy';

function catalogWithSourceOnlyLandmark() {
  const catalog = testDrawableCatalog();
  const source = structuredClone(catalog.assets.find((asset) => asset.id === 'structure-oak')!);
  source.id = 'structure-castle-ruin';
  source.label = 'Castle ruin';
  source.behavior = {
    value: 'castle-ruin',
    structureKind: 'landmark',
    sourceOnly: true,
    anchorX: 256,
    anchorY: 256,
    scale: 0.4,
    splitMode: 'flat-contact',
  };
  catalog.assets.push(source);
  return { ...catalog, revision: catalog.revision + 1 };
}

describe('Prop Seat source policy', () => {
  afterEach(() => applyDrawableCatalog(testDrawableCatalog()));

  it('keeps source-only artwork out of choices and rejects direct or stale draft slots', () => {
    applyDrawableCatalog(catalogWithSourceOnlyLandmark());

    expect(propSeatStructureArtOptions().some((option) => option.source.id === 'castle-ruin')).toBe(false);
    expect(propSeatStructureArtOptions().some((option) => option.source.id === 'oak')).toBe(true);
    expect(propSeatSourceIsGameplayEligible({ kind: 'asset', id: 'castle-ruin' })).toBe(false);
    expect(propSeatDraftSourceIssue([{
      source: { kind: 'asset', id: 'castle-ruin' },
      anchorX: 256,
      anchorY: 256,
      scale: 0.4,
    }])).toMatch(/source-only artwork.*cannot become a gameplay prop or doodad/i);
  });
});
