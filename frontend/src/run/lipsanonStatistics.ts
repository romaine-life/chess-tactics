import { HttpError } from '../net/http';
import { reportAuthSessionFailure } from '../net/authSession';
import type { RunDocument, LipsanonId } from './model';

const STORAGE_KEY = 'chess-tactics:run-lipsanon-stat-events:v1';
export const LIPSANA_STATISTICS_EVENT = 'chess-tactics:run-lipsanon-statistics';

export type LipsanonStatKind = 'picked' | 'battle-win';

export interface LipsanonStatEvent {
  eventId: string;
  lipsanonId: LipsanonId;
  kind: LipsanonStatKind;
  synced: boolean;
}

export interface LipsanonStatistic {
  timesPicked: number;
  battlesWonWhileHeld: number;
}

export type LipsanaStatistics = Partial<Record<LipsanonId, LipsanonStatistic>>;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function eventKey(event: Pick<LipsanonStatEvent, 'eventId' | 'lipsanonId'>): string {
  return `${event.eventId}\u0000${event.lipsanonId}`;
}

export function readLipsanonStatEvents(): LipsanonStatEvent[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const events: LipsanonStatEvent[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const raw = value as Partial<LipsanonStatEvent>;
      if (typeof raw.eventId !== 'string'
        || typeof raw.lipsanonId !== 'string'
        || (raw.kind !== 'picked' && raw.kind !== 'battle-win')) continue;
      const event: LipsanonStatEvent = {
        eventId: raw.eventId,
        lipsanonId: raw.lipsanonId as LipsanonId,
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

function writeLipsanonStatEvents(events: readonly LipsanonStatEvent[]): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent(LIPSANA_STATISTICS_EVENT));
  } catch {
    // Statistics are secondary to the playable Run. A blocked browser store
    // must never interrupt the Battle transition that produced the fact.
  }
}

function aggregate(events: readonly LipsanonStatEvent[]): LipsanaStatistics {
  const statistics: LipsanaStatistics = {};
  for (const event of events) {
    const current = statistics[event.lipsanonId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
    statistics[event.lipsanonId] = {
      timesPicked: current.timesPicked + (event.kind === 'picked' ? 1 : 0),
      battlesWonWhileHeld: current.battlesWonWhileHeld + (event.kind === 'battle-win' ? 1 : 0),
    };
  }
  return statistics;
}

function mergeStatistics(base: LipsanaStatistics, events: readonly LipsanonStatEvent[]): LipsanaStatistics {
  const merged: LipsanaStatistics = Object.fromEntries(
    Object.entries(base).map(([id, value]) => [id, { ...value }]),
  );
  for (const [lipsanonId, extra] of Object.entries(aggregate(events)) as Array<[LipsanonId, LipsanonStatistic]>) {
    const current = merged[lipsanonId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
    merged[lipsanonId] = {
      timesPicked: current.timesPicked + extra.timesPicked,
      battlesWonWhileHeld: current.battlesWonWhileHeld + extra.battlesWonWhileHeld,
    };
  }
  return merged;
}

async function submit(events: readonly LipsanonStatEvent[]): Promise<void> {
  if (!events.length) return;
  const response = await fetch('/api/run-lipsanon-stat-events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      events: events.map(({ eventId, lipsanonId, kind }) => ({ eventId, lipsanonId, kind })),
    }),
  });
  if (!response.ok) throw await HttpError.fromResponse('save-run-lipsanon-statistics', response);
}

export async function syncLipsanonStatEvents(): Promise<boolean> {
  const current = readLipsanonStatEvents();
  const pending = current.filter((event) => !event.synced);
  if (!pending.length) return true;
  try {
    await submit(pending);
  } catch (error) {
    if (reportAuthSessionFailure(error)) return false;
    throw error;
  }
  const accepted = new Set(pending.map(eventKey));
  writeLipsanonStatEvents(current.map((event) => (
    accepted.has(eventKey(event)) ? { ...event, synced: true } : event
  )));
  return true;
}

export async function loadLipsanaStatistics(): Promise<{
  statistics: LipsanaStatistics;
  accountBacked: boolean;
}> {
  let accountBacked = false;
  try {
    accountBacked = await syncLipsanonStatEvents();
  } catch {
    // Keep the pending browser facts visible and still attempt the authoritative
    // read; a transient write failure does not imply sign-out.
  }
  if (accountBacked) {
    try {
      const response = await fetch('/api/run-lipsanon-statistics', {
        credentials: 'include',
        cache: 'no-cache',
      });
      if (!response.ok) throw await HttpError.fromResponse('load-run-lipsanon-statistics', response);
      const body = await response.json() as { statistics?: LipsanaStatistics };
      const pending = readLipsanonStatEvents().filter((event) => !event.synced);
      return { statistics: mergeStatistics(body.statistics ?? {}, pending), accountBacked: true };
    } catch (error) {
      if (!reportAuthSessionFailure(error)) {
        return { statistics: aggregate(readLipsanonStatEvents()), accountBacked: true };
      }
    }
  }
  return { statistics: aggregate(readLipsanonStatEvents()), accountBacked: false };
}

export function recordLipsanonStatEvents(events: readonly Omit<LipsanonStatEvent, 'synced'>[]): void {
  if (!events.length) return;
  const current = readLipsanonStatEvents();
  const seen = new Set(current.map(eventKey));
  const additions = events
    .filter((event) => !seen.has(eventKey(event)))
    .map((event): LipsanonStatEvent => ({ ...event, synced: false }));
  if (!additions.length) return;
  writeLipsanonStatEvents([...current, ...additions]);
  void syncLipsanonStatEvents().catch(() => undefined);
}

export function lipsanonStatEventsForRunTransition(
  previous: RunDocument | null,
  next: RunDocument,
): Array<Omit<LipsanonStatEvent, 'synced'>> {
  if (!previous || previous.id !== next.id) return [];
  const events: Array<Omit<LipsanonStatEvent, 'synced'>> = [];
  const before = new Set(previous.lipsana);
  for (const lipsanonId of next.lipsana) {
    if (!before.has(lipsanonId)) {
      events.push({ eventId: `pick:${next.id}:${lipsanonId}`, lipsanonId, kind: 'picked' });
    }
  }
  const wonBattle = previous.phase === 'battle'
    && (next.phase === 'shop' || next.phase === 'victory')
    && previous.battleIndex === next.battleIndex;
  if (wonBattle) {
    for (const lipsanonId of previous.lipsana) {
      events.push({
        eventId: `battle-win:${previous.id}:${previous.battleIndex}`,
        lipsanonId,
        kind: 'battle-win',
      });
    }
  }
  return events;
}
