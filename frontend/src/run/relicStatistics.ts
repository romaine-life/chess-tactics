import { HttpError } from '../net/http';
import type { RunDocument, RunRelicId } from './model';

const STORAGE_KEY = 'chess-tactics:run-relic-stat-events:v1';
export const RUN_RELIC_STATISTICS_EVENT = 'chess-tactics:run-relic-statistics';

export type RunRelicStatKind = 'picked' | 'battle-win';

export interface RunRelicStatEvent {
  eventId: string;
  relicId: RunRelicId;
  kind: RunRelicStatKind;
  synced: boolean;
}

export interface RunRelicStatistic {
  timesPicked: number;
  battlesWonWhileHeld: number;
}

export type RunRelicStatistics = Partial<Record<RunRelicId, RunRelicStatistic>>;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function eventKey(event: Pick<RunRelicStatEvent, 'eventId' | 'relicId'>): string {
  return `${event.eventId}\u0000${event.relicId}`;
}

export function readRunRelicStatEvents(): RunRelicStatEvent[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const events: RunRelicStatEvent[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const raw = value as Partial<RunRelicStatEvent>;
      if (typeof raw.eventId !== 'string'
        || typeof raw.relicId !== 'string'
        || (raw.kind !== 'picked' && raw.kind !== 'battle-win')) continue;
      const event: RunRelicStatEvent = {
        eventId: raw.eventId,
        relicId: raw.relicId as RunRelicId,
        kind: raw.kind,
        synced: raw.synced === true,
      };
      const key = eventKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
    return events;
  } catch {
    return [];
  }
}

function writeRunRelicStatEvents(events: readonly RunRelicStatEvent[]): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent(RUN_RELIC_STATISTICS_EVENT));
  } catch {
    // Statistics are secondary to the playable Run. A blocked browser store
    // must never interrupt the Battle transition that produced the fact.
  }
}

function aggregate(events: readonly RunRelicStatEvent[]): RunRelicStatistics {
  const statistics: RunRelicStatistics = {};
  for (const event of events) {
    const current = statistics[event.relicId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
    statistics[event.relicId] = {
      timesPicked: current.timesPicked + (event.kind === 'picked' ? 1 : 0),
      battlesWonWhileHeld: current.battlesWonWhileHeld + (event.kind === 'battle-win' ? 1 : 0),
    };
  }
  return statistics;
}

function mergeStatistics(base: RunRelicStatistics, events: readonly RunRelicStatEvent[]): RunRelicStatistics {
  const merged: RunRelicStatistics = Object.fromEntries(
    Object.entries(base).map(([id, value]) => [id, { ...value }]),
  );
  for (const [relicId, extra] of Object.entries(aggregate(events)) as Array<[RunRelicId, RunRelicStatistic]>) {
    const current = merged[relicId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
    merged[relicId] = {
      timesPicked: current.timesPicked + extra.timesPicked,
      battlesWonWhileHeld: current.battlesWonWhileHeld + extra.battlesWonWhileHeld,
    };
  }
  return merged;
}

async function submit(events: readonly RunRelicStatEvent[]): Promise<void> {
  if (!events.length) return;
  const response = await fetch('/api/run-relic-stat-events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      events: events.map(({ eventId, relicId, kind }) => ({ eventId, relicId, kind })),
    }),
  });
  if (!response.ok) throw await HttpError.fromResponse('save-run-relic-statistics', response);
}

export async function syncRunRelicStatEvents(): Promise<boolean> {
  const current = readRunRelicStatEvents();
  const pending = current.filter((event) => !event.synced);
  if (!pending.length) return true;
  try {
    await submit(pending);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return false;
    throw error;
  }
  const accepted = new Set(pending.map(eventKey));
  writeRunRelicStatEvents(current.map((event) => (
    accepted.has(eventKey(event)) ? { ...event, synced: true } : event
  )));
  return true;
}

export async function loadRunRelicStatistics(): Promise<{
  statistics: RunRelicStatistics;
  accountBacked: boolean;
}> {
  let accountBacked = false;
  try {
    accountBacked = await syncRunRelicStatEvents();
  } catch {
    // Keep the pending browser facts visible and still attempt the authoritative
    // read; a transient write failure does not imply sign-out.
  }
  if (accountBacked) {
    try {
      const response = await fetch('/api/run-relic-statistics', {
        credentials: 'include',
        cache: 'no-cache',
      });
      if (!response.ok) throw await HttpError.fromResponse('load-run-relic-statistics', response);
      const body = await response.json() as { statistics?: RunRelicStatistics };
      const pending = readRunRelicStatEvents().filter((event) => !event.synced);
      return { statistics: mergeStatistics(body.statistics ?? {}, pending), accountBacked: true };
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) {
        return { statistics: aggregate(readRunRelicStatEvents()), accountBacked: true };
      }
    }
  }
  return { statistics: aggregate(readRunRelicStatEvents()), accountBacked: false };
}

export function recordRunRelicStatEvents(events: readonly Omit<RunRelicStatEvent, 'synced'>[]): void {
  if (!events.length) return;
  const current = readRunRelicStatEvents();
  const seen = new Set(current.map(eventKey));
  const additions = events
    .filter((event) => !seen.has(eventKey(event)))
    .map((event): RunRelicStatEvent => ({ ...event, synced: false }));
  if (!additions.length) return;
  writeRunRelicStatEvents([...current, ...additions]);
  void syncRunRelicStatEvents().catch(() => undefined);
}

export function relicStatEventsForRunTransition(
  previous: RunDocument | null,
  next: RunDocument,
): Array<Omit<RunRelicStatEvent, 'synced'>> {
  if (!previous || previous.id !== next.id) return [];
  const events: Array<Omit<RunRelicStatEvent, 'synced'>> = [];
  const before = new Set(previous.relics);
  for (const relicId of next.relics) {
    if (!before.has(relicId)) {
      events.push({ eventId: `pick:${next.id}:${relicId}`, relicId, kind: 'picked' });
    }
  }
  const wonBattle = previous.phase === 'battle'
    && (next.phase === 'shop' || next.phase === 'victory')
    && previous.battleIndex === next.battleIndex;
  if (wonBattle) {
    for (const relicId of previous.relics) {
      events.push({
        eventId: `battle-win:${previous.id}:${previous.battleIndex}`,
        relicId,
        kind: 'battle-win',
      });
    }
  }
  return events;
}
