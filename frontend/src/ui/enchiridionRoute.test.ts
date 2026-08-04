import { describe, expect, it } from 'vitest';
import {
  ENCHIRIDION_SECTIONS,
  enchiridionCardFromPath,
  enchiridionCardHref,
  enchiridionCardTypeFromPath,
  enchiridionCardTypeHref,
  enchiridionLipsanonFromPath,
  enchiridionLipsanonHref,
  enchiridionSectionFromPath,
  enchiridionSectionPath,
} from './enchiridionRoute';
import { RUN_CARD_TYPE_REFERENCE } from '../run/model';
import type { EnchiridionCardType } from './enchiridionRoute';

const CARD_TYPES = ['praecipuus', ...Object.keys(RUN_CARD_TYPE_REFERENCE)] as EnchiridionCardType[];

describe('main-menu Enchiridion addresses', () => {
  it('addresses every card property, and round-trips each one', () => {
    for (const cardType of CARD_TYPES) {
      const href = enchiridionCardTypeHref(cardType);
      expect(href).toBe(`/enchiridion/card-types/${cardType}`);
      expect(enchiridionCardTypeFromPath(href)).toBe(cardType);
      // A deeper address still belongs to — and paints — its own section.
      expect(enchiridionSectionFromPath(href)).toBe('card-types');
      expect(enchiridionSectionPath(href)).toBe('/enchiridion/card-types');
    }
  });

  it('reads an absent, unknown or foreign card-property address as no selection', () => {
    expect(enchiridionCardTypeFromPath('/enchiridion/card-types')).toBeNull();
    expect(enchiridionCardTypeFromPath('/enchiridion/card-types/nonesuch')).toBeNull();
    expect(enchiridionCardTypeFromPath('/enchiridion/card-types/hieratic/extra')).toBeNull();
    expect(enchiridionCardTypeFromPath('/enchiridion/lipsana/royal-decree')).toBeNull();
    // Membership is an own-property test: `in` and a truthy index both walk
    // Object.prototype, so these would otherwise read as known ids.
    for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(enchiridionCardTypeFromPath(`/enchiridion/card-types/${inherited}`)).toBeNull();
      expect(enchiridionCardFromPath(`/enchiridion/cards/${inherited}`)).toBeNull();
    }
  });

  it('keeps every per-item address inside the section that owns it', () => {
    expect(enchiridionLipsanonFromPath(enchiridionLipsanonHref('royal-decree'))).toBe('royal-decree');
    expect(enchiridionCardFromPath(enchiridionCardHref('ppb'))).toBe('ppb');
    expect(enchiridionCardHref('his-grace')).toBe('/enchiridion/cards/his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/his-grace')).toBe('his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/front-lines')).toBe('front-lines');
    // One address never resolves as another section's item.
    expect(enchiridionCardFromPath(enchiridionCardTypeHref('hieratic'))).toBeNull();
    expect(enchiridionLipsanonFromPath(enchiridionCardTypeHref('hieratic'))).toBeNull();
    expect(enchiridionCardTypeFromPath(enchiridionCardHref('ppb'))).toBeNull();
    // Sections themselves stay resolvable, so adding an item address broke no rail entry.
    for (const section of ENCHIRIDION_SECTIONS) {
      expect(enchiridionSectionFromPath(`/enchiridion/${section}`)).toBe(section);
    }
  });
});
