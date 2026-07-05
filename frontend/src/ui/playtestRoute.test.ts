import { describe, expect, it } from 'vitest';
import { appendTimeControlParams, readTimeControlParams } from './playtestRoute';

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
});
