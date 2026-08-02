import { describe, expect, it } from 'vitest';
import { UNIT_ABILITY_REFERENCES } from './Enchiridion';

describe('Enchiridion unit abilities', () => {
  it('contains unit-owned abilities without card qualifiers', () => {
    expect(UNIT_ABILITY_REFERENCES.map((ability) => ability.name)).toEqual([
      'Discipline',
      'Positioned',
      'Marshalled',
      'Plagued',
    ]);
  });
});
