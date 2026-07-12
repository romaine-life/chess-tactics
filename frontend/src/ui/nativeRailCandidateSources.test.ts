import { describe, expect, it } from 'vitest';

import {
  NATIVE_RAIL_CANDIDATE_SOURCES,
  NATIVE_RAIL_FAMILIES,
  UNPAIRED_NATIVE_RAIL_SOURCE_IDS,
  normalizeNativeRailFamilyId,
} from './nativeRailCandidateSources';

describe('native rail families (ADR-0071)', () => {
  it('admits only complete directional families', () => {
    expect(NATIVE_RAIL_FAMILIES.length).toBeGreaterThan(0);
    for (const family of NATIVE_RAIL_FAMILIES) {
      expect(family.horizontal.length).toBeGreaterThan(0);
      expect(family.vertical.length).toBeGreaterThan(0);
      expect(family.horizontal.every((source) => source.familyId === family.id && source.orientation === 'horizontal')).toBe(true);
      expect(family.vertical.every((source) => source.familyId === family.id && source.orientation === 'vertical')).toBe(true);
    }
  });

  it('keeps unmatched admitted sources out of reviewed families', () => {
    const familySourceIds = NATIVE_RAIL_FAMILIES.flatMap((family) => [...family.horizontal, ...family.vertical].map((source) => source.id));
    expect(new Set(familySourceIds).size).toBe(familySourceIds.length);
    expect(new Set([...familySourceIds, ...UNPAIRED_NATIVE_RAIL_SOURCE_IDS]).size).toBe(NATIVE_RAIL_CANDIDATE_SOURCES.length);
    expect(UNPAIRED_NATIVE_RAIL_SOURCE_IDS.length).toBeGreaterThan(0);
    expect(NATIVE_RAIL_CANDIDATE_SOURCES.every((source) => source.nativeScale === 1)).toBe(true);
  });

  it('migrates file-level Rail Lab links to their containing family', () => {
    const source = NATIVE_RAIL_FAMILIES[0].horizontal[0];
    expect(normalizeNativeRailFamilyId(source.id)).toBe(source.familyId);
    expect(normalizeNativeRailFamilyId(source.familyId)).toBe(source.familyId);
  });
});
