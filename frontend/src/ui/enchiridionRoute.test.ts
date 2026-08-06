import { describe, expect, it } from 'vitest';
import {
  ENCHIRIDION_SECTIONS,
  enchiridionCardFromPath,
  enchiridionCardHref,
  enchiridionLipsanonFromPath,
  enchiridionLipsanonHref,
  enchiridionSectionFromPath,
  enchiridionSectionPath,
} from './enchiridionRoute';

describe('main-menu Enchiridion addresses', () => {
  it('keeps the bare and unknown roots empty until a section is addressed', () => {
    expect(enchiridionSectionFromPath('/enchiridion')).toBeNull();
    expect(enchiridionSectionPath('/enchiridion')).toBe('/enchiridion');
    expect(enchiridionSectionFromPath('/enchiridion/unknown')).toBeNull();
    expect(enchiridionSectionPath('/enchiridion/unknown')).toBe('/enchiridion');
  });

  it('does not expose the retired card-type and ability sections', () => {
    expect(ENCHIRIDION_SECTIONS).toEqual(['units', 'terrain', 'cards', 'lipsana', 'ataraxia']);
    for (const path of ['/enchiridion/card-types', '/enchiridion/card-types/hieratic', '/enchiridion/abilities']) {
      expect(enchiridionSectionFromPath(path)).toBeNull();
      expect(enchiridionSectionPath(path)).toBe('/enchiridion');
    }
  });

  it('reads inherited object keys as no card selection', () => {
    // Membership is an own-property test: `in` and a truthy index both walk
    // Object.prototype, so these would otherwise read as known ids.
    for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(enchiridionCardFromPath(`/enchiridion/cards/${inherited}`)).toBeNull();
    }
  });

  it('keeps every per-item address inside the section that owns it', () => {
    expect(enchiridionLipsanonFromPath(enchiridionLipsanonHref('fair-scales'))).toBe('fair-scales');
    expect(enchiridionLipsanonFromPath('/enchiridion/lipsana/royal-decree')).toBeNull();
    expect(enchiridionCardFromPath(enchiridionCardHref('ppb-protected'))).toBe('ppb-protected');
    expect(enchiridionCardHref('his-grace')).toBe('/enchiridion/cards/his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/his-grace')).toBe('his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/front-lines')).toBeNull();
    // Sections themselves stay resolvable, so adding an item address broke no rail entry.
    for (const section of ENCHIRIDION_SECTIONS) {
      expect(enchiridionSectionFromPath(`/enchiridion/${section}`)).toBe(section);
    }
  });
});
