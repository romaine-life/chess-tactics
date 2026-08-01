import { describe, expect, it } from 'vitest';
import type { LevelEvent } from '../core/level';
import {
  authoredDeploymentForSide,
  deploymentOnlyEvents,
  eventsWithoutDeployment,
  mergeOtherEvents,
  replaceSideDeployment,
} from './levelDeployment';

const events = (): LevelEvent[] => [
  {
    id: 'player-deploy',
    name: 'Player deploy',
    trigger: { kind: 'setup' },
    do: [{ kind: 'spawn', side: 'player', roster: { pawn: 2 }, zoneIds: ['player-a'] }],
  },
  {
    id: 'enemy-deploy-a',
    name: 'Enemy deploy A',
    trigger: { kind: 'setup' },
    do: [{ kind: 'spawn', side: 'enemy', roster: { pawn: 2 }, zoneIds: ['enemy-a'] }],
  },
  {
    id: 'enemy-deploy-b',
    name: 'Enemy deploy B',
    trigger: { kind: 'setup' },
    do: [
      { kind: 'spawn', side: 'enemy', roster: { rook: 1 }, zoneIds: ['enemy-b', 'enemy-a'] },
      { kind: 'chess-draws', fiftyMove: true },
    ],
  },
  {
    id: 'promotion',
    name: 'Promotion',
    trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn' }, zoneId: 'promotion' },
    do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
  },
];

describe('dedicated deployment authoring', () => {
  it('summarizes every setup roster and pooled zone for one side', () => {
    expect(authoredDeploymentForSide(events(), 'enemy')).toEqual({
      enabled: true,
      roster: { pawn: 2, rook: 1 },
      zoneIds: ['enemy-a', 'enemy-b'],
      eventCount: 2,
    });
  });

  it('splits deployment actions away from Other Events without losing mixed actions', () => {
    expect(deploymentOnlyEvents(events()).flatMap((event) => event.do).every((action) => action.kind === 'spawn')).toBe(true);
    const other = eventsWithoutDeployment(events());
    expect(other.flatMap((event) => event.do).map((action) => action.kind)).toEqual(['chess-draws', 'promote']);
    expect(mergeOtherEvents(events(), other).flatMap((event) => event.do).map((action) => action.kind))
      .toEqual(['spawn', 'spawn', 'spawn', 'chess-draws', 'promote']);
    expect(mergeOtherEvents(events(), other).map((event) => event.id)).toEqual([
      'player-deploy',
      'enemy-deploy-a',
      'enemy-deploy-b-deployment',
      'enemy-deploy-b',
      'promotion',
    ]);
  });

  it('consolidates one side into one canonical event while leaving the other side untouched', () => {
    const next = replaceSideDeployment(events(), 'enemy', {
      roster: { king: 1, knight: 2 },
      zoneIds: ['enemy-a', 'enemy-a', 'enemy-c'],
    });
    expect(authoredDeploymentForSide(next, 'enemy')).toEqual({
      enabled: true,
      roster: { knight: 2, king: 1 },
      zoneIds: ['enemy-a', 'enemy-c'],
      eventCount: 1,
    });
    expect(authoredDeploymentForSide(next, 'player').roster).toEqual({ pawn: 2 });
    expect(next.flatMap((event) => event.do).some((action) => action.kind === 'chess-draws')).toBe(true);
  });

  it('disables a zero roster without touching zone geometry or non-deployment events', () => {
    const next = replaceSideDeployment(events(), 'enemy', { roster: {}, zoneIds: ['enemy-a'] });
    expect(authoredDeploymentForSide(next, 'enemy').enabled).toBe(false);
    expect(eventsWithoutDeployment(next).flatMap((event) => event.do).map((action) => action.kind))
      .toEqual(['chess-draws', 'promote']);
  });
});
