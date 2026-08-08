import { describe, expect, it } from 'vitest';
import {
  formatVerdicts,
  readVerdicts,
  summarizeVerdicts,
  toggleVerdict,
  verdictKey,
  writeVerdicts,
  type VerdictMap,
} from './animatedArtVerdicts';

const AT = '2026-08-08T00:00:00.000Z';
const store = (initial = ''): Storage & { value: string } => {
  const state = { value: initial } as Storage & { value: string };
  state.getItem = () => state.value || null;
  state.setItem = (_key: string, value: string) => { state.value = value; };
  return state;
};

describe('animated artwork verdicts', () => {
  // A verdict is a judgement of specific pixels. Carrying it onto regenerated art would report
  // approval for something the owner never saw.
  it('binds a verdict to the bytes it judged', () => {
    const first = toggleVerdict({}, 'rock-px-01', 'aaa', 'approved', AT);
    const props = [{ propId: 'rock-px-01', sha256: 'bbb' }];

    expect(summarizeVerdicts(first, props).undecided).toEqual(['rock-px-01']);
    expect(summarizeVerdicts(first, [{ propId: 'rock-px-01', sha256: 'aaa' }]).approved).toEqual(['rock-px-01']);
  });

  it('un-judges when the same verdict is pressed again, and switches otherwise', () => {
    const approved = toggleVerdict({}, 'rock-px-01', 'aaa', 'approved', AT);
    expect(approved[verdictKey('rock-px-01', 'aaa')].verdict).toBe('approved');

    const cleared = toggleVerdict(approved, 'rock-px-01', 'aaa', 'approved', AT);
    expect(cleared[verdictKey('rock-px-01', 'aaa')]).toBeUndefined();

    const switched = toggleVerdict(approved, 'rock-px-01', 'aaa', 'rejected', AT);
    expect(switched[verdictKey('rock-px-01', 'aaa')].verdict).toBe('rejected');
  });

  it('splits a set into approved, rejected and what is left', () => {
    let verdicts: VerdictMap = {};
    verdicts = toggleVerdict(verdicts, 'a', '1', 'approved', AT);
    verdicts = toggleVerdict(verdicts, 'b', '2', 'rejected', AT);

    expect(summarizeVerdicts(verdicts, [
      { propId: 'a', sha256: '1' },
      { propId: 'b', sha256: '2' },
      { propId: 'c', sha256: '3' },
    ])).toEqual({ approved: ['a'], rejected: ['b'], undecided: ['c'] });
  });

  it('round-trips through storage and survives a corrupt store', () => {
    const disk = store();
    const verdicts = toggleVerdict({}, 'rock-px-01', 'aaa', 'approved', AT);
    writeVerdicts(disk, verdicts);

    expect(readVerdicts(disk)).toEqual(verdicts);
    expect(readVerdicts(store('not json'))).toEqual({});
    expect(readVerdicts(store('{"x":{"propId":1}}'))).toEqual({});
  });

  // The list is the deliverable — it has to name the bytes, or it cannot be checked later
  // against what is actually installed.
  it('writes a list that names the judged content', () => {
    const verdicts = toggleVerdict({}, 'rock-px-01', 'abcdef0123456789', 'approved', AT);
    const text = formatVerdicts(
      summarizeVerdicts(verdicts, [{ propId: 'rock-px-01', sha256: 'abcdef0123456789' }, { propId: 'rock-px-02', sha256: 'zz' }]),
      verdicts,
      'Animated prop artwork',
    );

    expect(text).toContain('1/2 approved');
    expect(text).toContain('- rock-px-01 (abcdef012345)');
    expect(text).toContain('REJECTED: none');
    expect(text).toContain('- rock-px-02');
  });
});
