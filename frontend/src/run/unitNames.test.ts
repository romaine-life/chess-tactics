import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_RUN_UNIT_NAMES,
  RUN_UNIT_NAME_MINIMUM_CAPACITY,
  runUnitName,
  type HistoricalRunNameRole,
} from './unitNames';

describe('Run unit names', () => {
  const roles = Object.keys(HISTORICAL_RUN_UNIT_NAMES) as HistoricalRunNameRole[];

  it('has a substantial, duplicate-free pool of complete identities for every role', () => {
    expect(RUN_UNIT_NAME_MINIMUM_CAPACITY).toBeGreaterThanOrEqual(64);
    for (const role of roles) {
      const pool = HISTORICAL_RUN_UNIT_NAMES[role];
      expect(new Set(pool).size, `${role} pool`).toBe(pool.length);
      expect(pool.every((name) => name.trim() === name && name.length > 0 && name.length <= 80)).toBe(true);
    }
  });

  it('uses every role identity once before repeating', () => {
    for (const role of roles) {
      const pool = HISTORICAL_RUN_UNIT_NAMES[role];
      const names = pool.map((_, ordinal) => runUnitName(47, role, ordinal));
      expect(new Set(names).size, `${role} generated names`).toBe(pool.length);
      expect(new Set(names)).toEqual(new Set(pool));
    }
  });

  it('is stable for a saved Run seed while varying between Runs', () => {
    expect(runUnitName(47, 'knight', 12)).toBe(runUnitName(47, 'knight', 12));
    expect(runUnitName(48, 'knight', 12)).not.toBe(runUnitName(47, 'knight', 12));
  });
});
