import { describe, expect, it } from 'vitest';
import { LEVEL_BATTLE_CARDS_DEALT_DEFAULT, createBlankLevel } from '../core/level';
import {
  craftRunDocument,
  craftCoreCardId,
  hasRunCraftRequest,
  parseRunCraftSpec,
  runCraftAddress,
  runCraftSpecFingerprint,
  runCraftSpecFromJson,
  searchWithoutCraftParams,
} from './craft';
import { runCardDefinition, type RunWarSnapshot } from './model';

function craftWar(): RunWarSnapshot {
  return {
    id: 'craft-war',
    name: 'Craft War',
    description: 'A Battle-first craft fixture.',
    battles: Array.from({ length: 3 }, (_, index) => {
      const level = createBlankLevel(`craft-battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.zones.push({
        id: `player-spawn-${index}`,
        type: 'player-spawn',
        tiles: Array.from({ length: 2 }, (_, row) => (
          Array.from({ length: 8 }, (__, x) => [x, 6 + row] as [number, number])
        )).flat(),
      });
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      level.battle = { loot: false, cardsDealt: LEVEL_BATTLE_CARDS_DEALT_DEFAULT };
      return { level, loot: false };
    }),
  };
}

describe('formation Run craft parsing', () => {
  it('reads plain piece names and compact chess aliases', () => {
    expect(parseRunCraftSpec('?craft=battle&army=pawn,pawn,knight')?.army).toEqual([
      { type: 'pawn' }, { type: 'pawn' }, { type: 'knight' },
    ]);
    expect(parseRunCraftSpec('?craft=battle&army=ppk')?.army).toEqual([
      { type: 'pawn' }, { type: 'pawn' }, { type: 'knight' },
    ]);
  });

  it('keeps exact formation ids and their authored order', () => {
    expect(parseRunCraftSpec('?craft=sectio&battle=2&offers=ppk-protected')?.offers).toEqual([
      { coreId: 'ppk-protected', pieces: ['knight', 'pawn', 'pawn'] },
    ]);
  });

  it('requires an exact id when a composition has multiple formations', () => {
    expect(() => parseRunCraftSpec('?craft=sectio&offers=ppk')).toThrow(/multiple formations/i);
  });

  it('rejects every retired card qualifier and unit ability field', () => {
    expect(() => parseRunCraftSpec('?craft=sectio&offers=p:legatine')).toThrow(/qualifiers are unsupported/i);
    expect(() => runCraftSpecFromJson({ phase: 'battle', army: [{ type: 'pawn', abilities: ['adlected'] }] }))
      .toThrow(/unknown unit field "abilities"/i);
    expect(() => runCraftSpecFromJson({ phase: 'sectio', offers: [{ coreId: 'p', cardType: 'pestiferous' }] }))
      .toThrow(/unknown card field "cardType"/i);
  });

  it('accepts only active relic ids', () => {
    expect(parseRunCraftSpec('?craft=battle&lipsana=royal-tent')?.lipsana).toEqual(['royal-tent']);
    expect(() => parseRunCraftSpec('?craft=battle&lipsana=fair-scales')).toThrow(/not an active lipsanon/i);
    expect(() => parseRunCraftSpec('?craft=battle&lipsana=conscription-notice')).toThrow(/not an active lipsanon/i);
  });

  it('keeps Ataraxia fixed at zero', () => {
    expect(parseRunCraftSpec('?craft=battle&tier=0')?.ataraxiaTier).toBe(0);
    expect(() => parseRunCraftSpec('?craft=battle&tier=1')).toThrow(/whole number from 0 to 0/i);
  });

  it('retains composition shorthand only for unambiguous rosters', () => {
    expect(craftCoreCardId(['rook', 'rook'])).toBe('rr');
    expect(parseRunCraftSpec('?craft=sectio&battle=2&offers=rr')?.offers?.[0].coreId).toBe('rr-vertical');
  });

  it('round-trips a plain structured spec and removes only craft parameters', () => {
    const spec = runCraftSpecFromJson({
      phase: 'deployment',
      battle: 1,
      seed: 77,
      gold: 6,
      cards: ['ppb-protected'],
      add: ['rook'],
      lipsana: ['royal-tent'],
    });
    const address = runCraftAddress(spec);
    expect(hasRunCraftRequest(new URL(address, 'http://test').search)).toBe(true);
    expect(runCraftSpecFingerprint(spec)).toBe(runCraftSpecFingerprint(parseRunCraftSpec(new URL(address, 'http://test').search)!));
    expect(searchWithoutCraftParams('?craft=battle&seed=3&view=army')).toBe('?view=army');
  });

  it('has no craftable Sectio or held acquisition before Battle 1', () => {
    const war = craftWar();
    expect(() => craftRunDocument(
      runCraftSpecFromJson({ phase: 'sectio', battle: 1 }),
      war,
    )).toThrow(/first Sectio follows Battle 1/i);
    expect(() => craftRunDocument(
      runCraftSpecFromJson({ phase: 'deployment', battle: 1, cards: ['p'] }),
      war,
    )).toThrow(/cannot be held before the Sectio after Battle 1/i);
  });

  it('stages held cards through the first legal post-Battle Sectio', () => {
    const run = craftRunDocument(
      runCraftSpecFromJson({ phase: 'deployment', battle: 2, cards: ['p'] }),
      craftWar(),
    );
    expect(run.phase).toBe('deployment');
    expect(run.battleIndex).toBe(1);
    expect(run.cards.map((card) => card.coreId)).toContain('p');
    expect(run.sectioCardCursor).toBe(3);
  });

  /**
   * The Chartulary is the roster: every army unit sits in a seat of a held card, and the server
   * refuses a document where one does not. A crafted army names UNITS, so craft has to mint the
   * cards that supply them — it did not, which made `army` and `add` refused in every spec that
   * carried them, including the worked example in CLAUDE.md.
   */
  it('seats every crafted army unit in a card that supplies it', () => {
    for (const spec of [
      { phase: 'deployment' as const, battle: 2, army: ['rook', 'rook', 'bishop', 'pawn'] },
      { phase: 'deployment' as const, battle: 2, add: ['queen'] },
      { phase: 'deployment' as const, battle: 3, army: ['pawn'], add: ['knight'] },
    ]) {
      const run = craftRunDocument(runCraftSpecFromJson(spec), craftWar());
      const seated = new Set(run.cards.flatMap((card) => card.unitSeats.filter(Boolean)));
      const unseated = run.army.filter((unit) => !seated.has(unit.id));
      expect(unseated.map((unit) => unit.type), `${JSON.stringify(spec)} left units unseated`)
        .toEqual([]);
      // Each supplying card is a real card whose seats match the units sat in them.
      for (const card of run.cards) {
        const definition = runCardDefinition(card.coreId);
        expect(definition, `${card.coreId} is not a card`).toBeTruthy();
        expect(card.unitSeats).toHaveLength(definition!.pieces.length);
        card.unitSeats.forEach((unitId, seatIndex) => {
          if (!unitId) return;
          const unit = run.army.find((candidate) => candidate.id === unitId);
          expect(unit?.type).toBe(definition!.pieces[seatIndex]);
        });
      }
      // Card ids stay unique and the sequence stays ahead of every id it minted.
      const ids = run.cards.map((card) => card.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        const minted = /^run-card-(\d+)$/.exec(id);
        if (minted) expect(Number(minted[1])).toBeLessThan(run.nextCardSequence);
      }
    }
  });

  /**
   * Holding a lipsanon implies having seen it. A granted one skipped the offer it would normally
   * be seen in, which left `lipsana` outside `seenLipsana` and the whole document refused.
   */
  it('records a crafted lipsanon as seen, so the document stays consistent', () => {
    const run = craftRunDocument(
      runCraftSpecFromJson({ phase: 'deployment', battle: 2, lipsana: ['quartermasters-ledger'] }),
      craftWar(),
    );
    expect(run.lipsana).toContain('quartermasters-ledger');
    for (const held of run.lipsana) expect(run.seenLipsana).toContain(held);
  });
});
