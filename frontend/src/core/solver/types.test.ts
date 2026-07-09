// Phase-1 CONTRACT-INVARIANT test for the solver wire types (ADR-0069, plan "Contract
// deliverables"). Unlike retrograde.test.ts / feasibility.test.ts (which prove engine
// OUTPUTS), this file proves the SHAPE contracts every phase relies on:
//   1. JSON round-trip safety — the streamed SolveProgress / terminal SolveResult / posted
//      SolveSpec survive JSON.stringify∘parse with no Map/Set/bigint/function loss, because
//      SolveProgress is patched into a Postgres JSONB body and re-read by the polling client.
//   2. assertNever exhaustiveness — a compile-time guard over RETROGRADE_PHASES / SEARCH_PHASES
//      and the SolveStep union so ANY drift (a new phase, a new step kind) becomes a TS error,
//      not a silent runtime gap. The `const` arrays and the discriminated unions are wired to
//      the same assertNever tail here, exactly as the PhaseBar and worker recorder are.
//   3. flipOutcome involution — flipOutcome(flipOutcome(v)) === v for win/loss/draw/unknown.
//   4. draw/unknown carry NO distancePlies (the loopy-game invariant, ADR §1).
// Vitest v4 hides console.log for passing tests, so every claim is an ASSERTION.

import { describe, it, expect } from 'vitest';
import { createBlankLevel } from '../level';
import type { Side } from '../types';
import {
  flipOutcome,
  isRetrogradeStep,
  isSearchStep,
  RETROGRADE_PHASES,
  SEARCH_PHASES,
} from './types';
import type {
  Outcome,
  Value,
  RetrogradePhaseName,
  SearchPhaseName,
  SolvePhaseName,
  SolveStep,
  SolveProgress,
  SolveResult,
  SolveSpec,
  ProvenCounts,
  RootBounds,
} from './types';

// ─── assertNever — the exhaustiveness tail every phase/step switch drains into ─────────────

/** The union-exhaustiveness guard. Reaching it at runtime is impossible for a total switch;
 * its VALUE is compile-time: passing a non-`never` argument is a TypeScript error, so adding a
 * member to any union below without a matching case fails `tsc`. */
function assertNever(x: never): never {
  throw new Error(`unreachable: ${JSON.stringify(x)}`);
}

// ─── JSON round-trip safety of the wire types (ADR §5 JSONB body ⇄ polling client) ─────────

/** Recursively assert a JSON-parsed value contains ONLY JSON-safe leaves — no class instance,
 * Map, Set, function, bigint, symbol, or NaN/Infinity survives a round trip, so any of those
 * lingering in a fixture (or leaking into a wire type later) is caught here, not in Postgres. */
function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null) return;
  const t = typeof value;
  if (t === 'function' || t === 'bigint' || t === 'symbol' || t === 'undefined') {
    throw new Error(`non-JSON leaf (${t}) at ${path}`);
  }
  if (t === 'number') {
    expect(Number.isFinite(value as number), `finite number at ${path}`).toBe(true);
    return;
  }
  if (t === 'string' || t === 'boolean') return;
  // Objects: reject anything that isn't a plain object or array (a Map/Set/Date/class survives
  // typeof 'object' but is NOT what JSON reconstructs).
  if (value instanceof Map || value instanceof Set) throw new Error(`Map/Set at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  expect(proto === Object.prototype || proto === null, `plain object at ${path}`).toBe(true);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertJsonSafe(v, `${path}.${k}`);
}

/** JSON.stringify∘parse — the exact transform the JSONB body and polling client apply. */
function roundTrip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const provenFixture: ProvenCounts = { win: 12, loss: 7, draw: 40 };
const rootBoundsFixture: RootBounds = { lower: 'draw', upper: 'win', bestDistancePlies: 9, proven: false };

const progressFixture: SolveProgress = {
  phase: 'Propagate',
  statesEnumerated: 5901,
  statesSolved: 59,
  proven: provenFixture,
  rootBounds: rootBoundsFixture,
  coveragePct: 42.5,
  secs: 3.2,
  sweep: 4,
};

const resultFixture: SolveResult = {
  rootValue: { outcome: 'win', winner: 'player', distancePlies: 5 },
  complete: true,
  provenCount: provenFixture.win + provenFixture.loss + provenFixture.draw,
  proven: provenFixture,
  rootBounds: { lower: 'win', upper: 'win', bestDistancePlies: 5, proven: true },
  coveragePct: 100,
  mode: 'retrograde',
  pieceValues: {
    rootValue: { outcome: 'win', winner: 'player', distancePlies: 5 },
    entries: [
      {
        type: 'queen',
        side: 'player',
        baselineValue: { outcome: 'win', winner: 'player', distancePlies: 5 },
        ablatedValue: { outcome: 'draw' },
        outcomeFlipped: true,
        authoredScalar: 9,
      },
    ],
    partial: false,
  },
};

const specFixture: SolveSpec = {
  level: createBlankLevel('tiny', 'Tiny', 3, 3),
  bounds: { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 },
  mode: 'retrograde',
  seed: 0,
  instantRead: true,
};

describe('JSON round-trip safety of the wire types', () => {
  it('SolveProgress survives stringify∘parse deep-equal and JSON-safe', () => {
    const re = roundTrip(progressFixture);
    expect(re).toEqual(progressFixture);
    assertJsonSafe(re);
  });

  it('SolveResult (with nested pieceValues) survives stringify∘parse deep-equal and JSON-safe', () => {
    const re = roundTrip(resultFixture);
    expect(re).toEqual(resultFixture);
    assertJsonSafe(re);
    // the nested Value with no distancePlies must not sprout one across the trip
    expect(re.pieceValues!.entries[0].ablatedValue.distancePlies).toBeUndefined();
  });

  it('SolveSpec (whole authored Level embedded) survives stringify∘parse deep-equal and JSON-safe', () => {
    const re = roundTrip(specFixture);
    expect(re).toEqual(specFixture);
    assertJsonSafe(re);
  });

  it('a Map/Set/bigint smuggled into a body IS caught by assertJsonSafe (the guard has teeth)', () => {
    expect(() => assertJsonSafe({ counts: new Map([['win', 1]]) })).toThrow(/Map\/Set/);
    expect(() => assertJsonSafe({ bound: 10n })).toThrow(/bigint/);
    expect(() => assertJsonSafe({ cb: () => 0 })).toThrow(/function/);
    expect(() => assertJsonSafe({ n: Number.POSITIVE_INFINITY })).toThrow();
  });
});

// ─── assertNever exhaustiveness over the phase arrays + the SolveStep union ─────────────────

describe('assertNever exhaustiveness (drift becomes a compile error)', () => {
  it('every RETROGRADE_PHASES member has a case; the tail is assertNever', () => {
    // A total switch over the phase-name union. If a phase is ADDED to RETROGRADE_PHASES (and
    // thus the RetrogradePhaseName union) without a case here, `phase` at the default is no
    // longer `never` and `assertNever(phase)` fails to compile — the plan's drift guard.
    const label = (phase: RetrogradePhaseName): string => {
      switch (phase) {
        case 'Enumerate': return 'enumerate';
        case 'SeedTerminals': return 'seed';
        case 'Propagate': return 'propagate';
        case 'Converge': return 'converge';
        case 'ReadValue': return 'read';
        default: return assertNever(phase);
      }
    };
    expect(RETROGRADE_PHASES.map(label)).toEqual(['enumerate', 'seed', 'propagate', 'converge', 'read']);
    expect(RETROGRADE_PHASES).toHaveLength(5);
  });

  it('every SEARCH_PHASES member has a case; the tail is assertNever', () => {
    const label = (phase: SearchPhaseName): string => {
      switch (phase) {
        case 'Generate': return 'generate';
        case 'Order': return 'order';
        case 'Descend': return 'descend';
        case 'Quiesce': return 'quiesce';
        case 'BackUp': return 'backup';
        default: return assertNever(phase);
      }
    };
    expect(SEARCH_PHASES.map(label)).toEqual(['generate', 'order', 'descend', 'quiesce', 'backup']);
    expect(SEARCH_PHASES).toHaveLength(5);
  });

  it('SolvePhaseName is exactly the union of the two arrays (no unlisted phase resolves)', () => {
    const all: SolvePhaseName[] = [...RETROGRADE_PHASES, ...SEARCH_PHASES];
    // Total narrowing over SolvePhaseName drains to assertNever, so an added phase in either
    // array that is not routed to retrograde/search fails to compile.
    const route = (phase: SolvePhaseName): 'retrograde' | 'search' => {
      switch (phase) {
        case 'Enumerate':
        case 'SeedTerminals':
        case 'Propagate':
        case 'Converge':
        case 'ReadValue':
          return 'retrograde';
        case 'Generate':
        case 'Order':
        case 'Descend':
        case 'Quiesce':
        case 'BackUp':
          return 'search';
        default:
          return assertNever(phase);
      }
    };
    expect(all.map(route)).toEqual([
      ...RETROGRADE_PHASES.map(() => 'retrograde'),
      ...SEARCH_PHASES.map(() => 'search'),
    ]);
  });

  it('the SolveStep union is exhaustively handled by phase; adding a step kind/phase is a compile error', () => {
    // A total switch over EVERY SolveStep variant, keyed on kind+phase. Each nested default is
    // assertNever(step): a new RetrogradeStep/SearchStep phase (or a third `kind`) makes the
    // argument non-`never` and breaks the build. The guards partition the union first.
    const summarize = (step: SolveStep): SolvePhaseName => {
      if (isRetrogradeStep(step)) {
        switch (step.phase) {
          case 'Enumerate': return step.phase;
          case 'SeedTerminals': return step.phase;
          case 'Propagate': return step.phase;
          case 'Converge': return step.phase;
          case 'ReadValue': return step.phase;
          default: return assertNever(step);
        }
      }
      if (isSearchStep(step)) {
        switch (step.phase) {
          case 'Generate': return step.phase;
          case 'Order': return step.phase;
          case 'Descend': return step.phase;
          case 'Quiesce': return step.phase;
          case 'BackUp': return step.phase;
          default: return assertNever(step);
        }
      }
      // isRetrogradeStep|isSearchStep partition the union: nothing is left, so `step` is `never`.
      return assertNever(step);
    };

    // Exercise one representative of each kind so the runtime routing is covered too, and confirm
    // the guards partition disjointly (a step is retrograde XOR search).
    const retro: SolveStep = { kind: 'retrograde', phase: 'Converge', sweep: 2, decidedThisSweep: 3, atFixpoint: false, proven: provenFixture };
    const search: SolveStep = { kind: 'search', phase: 'BackUp', window: { alpha: -1, beta: 1, depth: 4, ply: 0 }, childValue: { outcome: 'draw' }, cutoff: false };
    expect(summarize(retro)).toBe('Converge');
    expect(summarize(search)).toBe('BackUp');
    expect(isRetrogradeStep(retro)).toBe(true);
    expect(isSearchStep(retro)).toBe(false);
    expect(isRetrogradeStep(search)).toBe(false);
    expect(isSearchStep(search)).toBe(true);
  });
});

// ─── flipOutcome involution (the shared negamax flip is its own inverse) ────────────────────

describe('flipOutcome involution', () => {
  const sides: (Side | undefined)[] = ['player', 'enemy', undefined];
  const cases: Value[] = [
    ...sides.flatMap((winner): Value[] => [
      { outcome: 'win', winner, distancePlies: 3 },
      { outcome: 'loss', winner, distancePlies: 3 },
      { outcome: 'win', winner },
      { outcome: 'loss', winner },
    ]),
    { outcome: 'draw' },
    { outcome: 'unknown' },
    { outcome: 'win', winner: 'player', distancePlies: 0 }, // terminal (DTM 0)
  ];

  it('flipOutcome(flipOutcome(v)) deep-equals v for every value', () => {
    for (const v of cases) expect(flipOutcome(flipOutcome(v))).toEqual(v);
  });

  it('one flip swaps win↔loss and fixes draw/unknown, preserving winner + distance', () => {
    expect(flipOutcome({ outcome: 'win', winner: 'player', distancePlies: 3 })).toEqual({ outcome: 'loss', winner: 'player', distancePlies: 3 });
    expect(flipOutcome({ outcome: 'loss', winner: 'enemy', distancePlies: 2 })).toEqual({ outcome: 'win', winner: 'enemy', distancePlies: 2 });
    expect(flipOutcome({ outcome: 'draw' })).toEqual({ outcome: 'draw' });
    expect(flipOutcome({ outcome: 'unknown' })).toEqual({ outcome: 'unknown' });
  });
});

// ─── draw/unknown carry NO distancePlies (the loopy-game invariant, ADR §1) ─────────────────

describe('draw/unknown values carry no distancePlies', () => {
  it('a well-formed draw/unknown Value omits distancePlies', () => {
    const draw: Value = { outcome: 'draw' };
    const unknown: Value = { outcome: 'unknown' };
    expect(draw.distancePlies).toBeUndefined();
    expect(unknown.distancePlies).toBeUndefined();
  });

  it('flipOutcome never mints a distancePlies onto a draw/unknown', () => {
    // A draw/unknown is returned unchanged by the negamax flip, so no finite distance can appear.
    for (const outcome of ['draw', 'unknown'] as Outcome[]) {
      const v: Value = { outcome };
      expect(flipOutcome(v).distancePlies).toBeUndefined();
    }
  });

  it('the invariant "distancePlies present ⇒ outcome is win|loss" holds across the wire fixtures', () => {
    // Walk every Value that appears in the round-trip fixtures and assert none breaks the rule.
    const values: Value[] = [
      progressFixture.rootBounds.lower === undefined ? { outcome: 'unknown' } : { outcome: progressFixture.rootBounds.lower },
      resultFixture.rootValue,
      resultFixture.pieceValues!.rootValue,
      ...resultFixture.pieceValues!.entries.flatMap((e) => [e.baselineValue, e.ablatedValue]),
    ];
    for (const v of values) {
      if (v.distancePlies !== undefined) expect(v.outcome === 'win' || v.outcome === 'loss').toBe(true);
    }
  });
});
