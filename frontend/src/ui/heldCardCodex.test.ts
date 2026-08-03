// @ts-nocheck -- the source-structure half reads files with node built-ins.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  buyCard,
  createRun,
  sellArmyUnit,
  type RunDocument,
  type RunWarSnapshot,
} from '../run/model';
import { heldCards } from './HeldCardCodex';

const heldCardCodex = readFileSync(new URL('./HeldCardCodex.tsx', import.meta.url), 'utf8');
const strategikon = readFileSync(new URL('./Strategikon.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function war(battles = 4): RunWarSnapshot {
  return {
    id: 'war-test',
    name: 'Test War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => {
      const level = createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      return { level, loot: false };
    }),
  };
}

function boughtOne(): RunDocument {
  const fresh = createRun(war(), 91);
  const offers = fresh.shop!.cardOffers;
  const affordable = offers.reduce((cheapest, offer) => (offer.cost < cheapest.cost ? offer : cheapest));
  return buyCard(fresh, affordable.offerId);
}

describe('the Chartulary reads the Run rather than the deck', () => {
  it('holds nothing before the first purchase', () => {
    expect(heldCards(createRun(war(), 91))).toEqual([]);
  });

  it('shows a bought card as the deck card it is', () => {
    const run = boughtOne();
    const [held] = heldCards(run);
    expect(held.core.id).toBe(run.cards[0].coreId);
    expect(held.core.pieces.length).toBe(run.cards[0].unitIds.length);
  });

  it('keeps the card once its units leave the army', () => {
    const run = boughtOne();
    const sold = sellArmyUnit(run, run.cards[0].unitIds[0]);
    // A held-card page that dropped the card with its last unit would lose what the
    // gold was spent on. Selling a unit does not sell the card.
    expect(heldCards(sold)).toHaveLength(1);
    expect(heldCards(sold)[0].core.id).toBe(heldCards(run)[0].core.id);
  });

  it('drops a card whose core id is no longer in the deck instead of drawing a blank face', () => {
    const run = boughtOne();
    const stale: RunDocument = {
      ...run,
      cards: [...run.cards, { ...run.cards[0], id: 'stale', coreId: 'not-a-card' }],
    };
    expect(heldCards(stale)).toHaveLength(1);
  });
});

describe('the Chartulary is the reference gallery, not a lookalike (ADR-0371)', () => {
  it('reuses the reference gallery frame, filter row, groups and faces', () => {
    expect(heldCardCodex).toContain("from './Enchiridion'");
    expect(heldCardCodex).toContain('<ReferenceSectionFrame');
    expect(heldCardCodex).toContain('<CardGalleryFilters');
    expect(heldCardCodex).toContain('testIdPrefix="strategikon-chartulary"');
    expect(heldCardCodex).toContain('cardMatchesFilters(held.core, goldFilter, unitFilter)');
    expect(heldCardCodex).toContain('cardsByGoldValue(visible, (held) => held.core)');
    expect(heldCardCodex).toContain('className="enchiridion-card-gallery-layout"');
    expect(heldCardCodex).toContain('className="enchiridion-card-gallery-grid"');
    expect(heldCardCodex).toContain('<RunCardCostCoin value={value}');
    // The real face, carrying the property the card was BOUGHT with — an owned
    // Pestiferous card must not fall back to the plain frame.
    expect(heldCardCodex).toContain('cardType={held.owned.cardType}');
    // A card IS its own record (ADR-0364). The gallery item is the face and nothing else:
    // no annotation box, no unit roster, no second copy of what the Prosopography shows.
    expect(heldCardCodex).not.toContain('RunUnitTraitList');
    expect(heldCardCodex).not.toContain('runUnitRosterLabel');
    expect(heldCardCodex).not.toContain('chartulary-register');
    expect(style).not.toContain('strategikon-chartulary-register');
  });

  it('mounts unframed in the Strategikon and says so when no Run is attached', () => {
    expect(strategikon).toMatch(/<HeldCardCodex[^>]*framed=\{false\}/);
    expect(strategikon).toContain('title="The Chartulary — Held Cards"');
    expect(strategikon).toContain('<UnavailableRunReference title="The Chartulary"');
  });
});
