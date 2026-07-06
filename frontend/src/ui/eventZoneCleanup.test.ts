import { describe, expect, it } from 'vitest';
import type { LevelEvent } from '../core/level';
import type { EditorZoneEntry } from './boardCode';
import {
  clearZoneEntriesReferencedOnlyByRemovedEvents,
  eventReferencedZoneIds,
} from './eventZoneCleanup';

const spawn = (zoneIds: string[]): LevelEvent => ({
  kind: 'spawn',
  trigger: { kind: 'setup' },
  side: 'player',
  roster: { pawn: 1 },
  zoneIds,
});

const promotion = (zoneId: string): LevelEvent => ({
  kind: 'pawn-promotion',
  trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId },
  defaultPromotion: 'queen',
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

  it('clears a zone when the removed event was its only reference', () => {
    const updated = clearZoneEntriesReferencedOnlyByRemovedEvents(zones(), [spawn(['zone-a'])], [])!;

    expect(updated.find((zone) => zone.id === 'zone-a')?.tiles).toEqual([]);
    expect(updated.find((zone) => zone.id === 'zone-b')?.tiles).toEqual(['1,0']);
  });

  it('keeps a zone painted when a remaining event still references it', () => {
    const updated = clearZoneEntriesReferencedOnlyByRemovedEvents(zones(), [spawn(['zone-a'])], [promotion('zone-a')]);

    expect(updated).toBeNull();
  });

  it('clears only zones that become unreferenced after a bulk clear', () => {
    const updated = clearZoneEntriesReferencedOnlyByRemovedEvents(
      zones(),
      [spawn(['zone-a', 'zone-b']), promotion('zone-c')],
      [spawn(['zone-b'])],
    )!;

    expect(updated.find((zone) => zone.id === 'zone-a')?.tiles).toEqual([]);
    expect(updated.find((zone) => zone.id === 'zone-b')?.tiles).toEqual(['1,0']);
    expect(updated.find((zone) => zone.id === 'zone-c')?.tiles).toEqual([]);
  });
});
