import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
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
import type { RunWarSnapshot } from './model';

function craftWar(): RunWarSnapshot {
  return {
    id: 'craft-war',
    name: 'Craft War',
    description: 'A Battle-first craft fixture.',
    battles: Array.from({ length: 3 }, (_, index) => {
      const level = createBlankLevel(`craft-battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
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
    expect(parseRunCraftSpec('?craft=battle&lipsana=fair-scales')?.lipsana).toEqual(['fair-scales']);
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
      lipsana: ['fair-scales'],
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
});
