import { describe, expect, it } from 'vitest';
import type { LevelEvents, VictoryRules } from '../core/level';
import {
  appendLevelEventsParam,
  appendTimeControlParams,
  appendVictoryRulesParam,
  readLevelEventsParam,
  readTimeControlParams,
  readVictoryRulesParam,
} from './playtestRoute';

describe('playtest route helpers', () => {
  it('round-trips a temporary board time control', () => {
    const params = new URLSearchParams();
    appendTimeControlParams(params, { initialSeconds: 180, incrementSeconds: 5 });

    expect(params.get('time')).toBe('180');
    expect(params.get('inc')).toBe('5');
    expect(readTimeControlParams(params)).toEqual({ initialSeconds: 180, incrementSeconds: 5 });
  });

  it('omits absent controls and rejects malformed controls', () => {
    const empty = new URLSearchParams();
    appendTimeControlParams(empty, undefined);
    expect(readTimeControlParams(empty)).toBeUndefined();

    const existing = new URLSearchParams('time=180&inc=5');
    appendTimeControlParams(existing, undefined);
    expect(existing.has('time')).toBe(false);
    expect(existing.has('inc')).toBe(false);
    expect(readTimeControlParams(existing)).toBeUndefined();

    expect(readTimeControlParams(new URLSearchParams('time=0&inc=0'))).toBeUndefined();
    expect(readTimeControlParams(new URLSearchParams('time=60&inc=-1'))).toBeUndefined();
    expect(readTimeControlParams(new URLSearchParams('inc=5'))).toBeUndefined();
    expect(readTimeControlParams(new URLSearchParams('time=60'))).toEqual({ initialSeconds: 60, incrementSeconds: 0 });
  });

  it('round-trips authored non-victory events for board test links', () => {
    const events: LevelEvents = [
      {
        id: 'player-pawn-promotion',
        name: 'Player pawn promotion',
        trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: 'promo-zone' },
        do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
      },
    ];
    const params = new URLSearchParams();
    appendLevelEventsParam(params, events);

    expect(params.get('events')).toBeTruthy();
    expect(readLevelEventsParam(params)).toEqual(events);
  });

  it('round-trips authored victory rules for board test links', () => {
    const victory: VictoryRules = [
      { id: 'survive-five', name: 'Hold out', if: [{ kind: 'turnLimit', turns: 5 }], do: [{ kind: 'win', side: 'player' }] },
    ];
    const params = new URLSearchParams();
    appendVictoryRulesParam(params, victory);

    expect(params.get('victory')).toBeTruthy();
    expect(readVictoryRulesParam(params)).toEqual(victory);
  });

  it('omits absent rules metadata and ignores malformed metadata', () => {
    const params = new URLSearchParams('events=bad&victory=bad');

    expect(readLevelEventsParam(params)).toBeUndefined();
    expect(readVictoryRulesParam(params)).toBeUndefined();

    appendLevelEventsParam(params, undefined);
    appendVictoryRulesParam(params, undefined);
    expect(params.has('events')).toBe(false);
    expect(params.has('victory')).toBe(false);
  });
});
