import type { LevelEvent } from '../core/level';
import type { EditorZoneEntry } from './boardCode';

export function eventReferencedZoneIds(events: readonly LevelEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.trigger.kind === 'unit-enters-zone') {
      const clean = event.trigger.zoneId.trim();
      if (clean) ids.add(clean);
    }
    for (const action of event.do) {
      if (action.kind !== 'spawn') continue;
      for (const id of action.zoneIds) {
        const clean = id.trim();
        if (clean) ids.add(clean);
      }
    }
  }
  return ids;
}

export function removeZoneEntriesReferencedOnlyByRemovedEvents(
  entries: readonly EditorZoneEntry[],
  removedEvents: readonly LevelEvent[],
  remainingEvents: readonly LevelEvent[],
): EditorZoneEntry[] | null {
  const removedZoneIds = eventReferencedZoneIds(removedEvents);
  if (removedZoneIds.size === 0) return null;

  const remainingZoneIds = eventReferencedZoneIds(remainingEvents);
  const orphanedZoneIds = [...removedZoneIds].filter((id) => !remainingZoneIds.has(id));
  if (orphanedZoneIds.length === 0) return null;

  const orphaned = new Set(orphanedZoneIds);
  const next = entries.filter((entry) => !orphaned.has(entry.id));
  return next.length === entries.length ? null : next;
}
