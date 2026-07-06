import { describe, expect, it } from 'vitest';
import type { LevelEvent } from '../core/level';
import type { EditorZoneEntry } from './boardCode';
import {
  eventReferencedZoneIds,
  removeZoneEntriesReferencedOnlyByRemovedEvents,
} from './eventZoneCleanup';

const spawn = (zoneIds: string[]): LevelEvent => ({
  trigger: { kind: 'setup' },
  do: [{ kind: 'spawn', side: 'player', roster: { pawn: 1 }, zoneIds }],
});

const promotion = (zoneId: string): LevelEvent => ({
  trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId },
  do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
});

const zones = (): EditorZoneEntry[] => [
  { id: 'zone-a', name: 'A', color: 'blue', type: 'region', tiles: ['0,0', '0,1'] },
  { id: 'zone-b', name: 'B', color: 'red', type: 'region', tiles: ['1,0'] },
  { id: 'zone-c', name: 'C', color: 'amber', type: 'region', tiles: ['2,0'] },
];

describe('event zone cleanup', () => {
  it('collects zone references from spawn and promotion events', () => {
    expect([...eventReferencedZoneIds([spawn(['zone-a', ' zone-b ']), promotion('zone-c')])])
      .toEqual(['zone-a', 'zone-b', 'zone-c']);
  });

  it('deletes a zone when the removed event was its only reference', () => {
    const updated = removeZoneEntriesReferencedOnlyByRemovedEvents(zones(), [spawn(['zone-a'])], [])!;

    expect(updated.some((zone) => zone.id === 'zone-a')).toBe(false);
    expect(updated.find((zone) => zone.id === 'zone-b')?.tiles).toEqual(['1,0']);
  });

  it('keeps a zone painted when a remaining event still references it', () => {
    const updated = removeZoneEntriesReferencedOnlyByRemovedEvents(zones(), [spawn(['zone-a'])], [promotion('zone-a')]);

    expect(updated).toBeNull();
  });

  it('deletes only zones that become unreferenced after a bulk clear', () => {
    const updated = removeZoneEntriesReferencedOnlyByRemovedEvents(
      zones(),
      [spawn(['zone-a', 'zone-b']), promotion('zone-c')],
      [spawn(['zone-b'])],
    )!;

    expect(updated.some((zone) => zone.id === 'zone-a')).toBe(false);
    expect(updated.find((zone) => zone.id === 'zone-b')?.tiles).toEqual(['1,0']);
    expect(updated.some((zone) => zone.id === 'zone-c')).toBe(false);
  });
});
