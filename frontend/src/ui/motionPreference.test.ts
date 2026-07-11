import { describe, expect, it } from 'vitest';
import { readReduceMotionPreference, SETTINGS_STORAGE_KEY } from './motionPreference';

const storage = (value: string | null): Pick<Storage, 'getItem'> => ({
  getItem: (key) => key === SETTINGS_STORAGE_KEY ? value : null,
});

describe('reduce-motion preference', () => {
  it('opts in only for an explicit persisted true value', () => {
    expect(readReduceMotionPreference(storage('{"reduceMotion":true}'))).toBe(true);
    expect(readReduceMotionPreference(storage('{"reduceMotion":false}'))).toBe(false);
    expect(readReduceMotionPreference(storage('{}'))).toBe(false);
  });

  it('fails open to normal motion for absent or malformed settings', () => {
    expect(readReduceMotionPreference(storage(null))).toBe(false);
    expect(readReduceMotionPreference(storage('{'))).toBe(false);
    expect(readReduceMotionPreference(null)).toBe(false);
  });
});
