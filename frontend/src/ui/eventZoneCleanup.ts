import type { LevelEvent } from '../core/level';
import type { EditorZoneEntry } from './boardCode';

export function eventReferencedZoneIds(events: readonly LevelEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === 'spawn') {
      for (const id of event.zoneIds) {
        const clean = id.trim();
        if (clean) ids.add(clean);
      }
      continue;
    }
    const clean = event.trigger.zoneId.trim();
    if (clean) ids.add(clean);
  }
  return ids;
}

export function clearZoneEntriesReferencedOnlyByRemovedEvents(
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
  let changed = false;
  const next = entries.map((entry) => {
    if (!orphaned.has(entry.id) || entry.tiles.length === 0) return entry;
    changed = true;
    return { ...entry, tiles: [] };
  });
  return changed ? next : null;
}
