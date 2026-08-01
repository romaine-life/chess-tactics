import type { ConditionSide, LevelEvent, LevelEvents, Roster, SpawnEventAction } from '../core/level';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';

export interface AuthoredDeployment {
  enabled: boolean;
  roster: Roster;
  zoneIds: string[];
  eventCount: number;
}

const isSideSpawn = (
  action: LevelEvent['do'][number],
  side: ConditionSide,
): action is SpawnEventAction => action.kind === 'spawn' && action.side === side;

export function rosterSize(roster: Roster | undefined): number {
  return PLAYABLE_PIECE_TYPES.reduce((total, type) => total + (roster?.[type] ?? 0), 0);
}

export function authoredDeploymentForSide(
  events: readonly LevelEvent[],
  side: ConditionSide,
): AuthoredDeployment {
  const roster: Roster = {};
  const zoneIds = new Set<string>();
  let eventCount = 0;
  for (const event of events) {
    if (event.trigger.kind !== 'setup') continue;
    const actions = event.do.filter((action) => isSideSpawn(action, side));
    if (actions.length === 0) continue;
    eventCount += 1;
    for (const action of actions) {
      for (const type of PLAYABLE_PIECE_TYPES) {
        const count = action.roster[type] ?? 0;
        if (count > 0) roster[type] = (roster[type] ?? 0) + count;
      }
      for (const zoneId of action.zoneIds) {
        const clean = zoneId.trim();
        if (clean) zoneIds.add(clean);
      }
    }
  }
  return {
    enabled: eventCount > 0 && rosterSize(roster) > 0,
    roster,
    zoneIds: [...zoneIds],
    eventCount,
  };
}

/** Setup-spawn actions have one dedicated editor. Other Events never edits them. */
export function deploymentOnlyEvents(events: readonly LevelEvent[]): LevelEvents {
  return events.flatMap((event): LevelEvents => {
    if (event.trigger.kind !== 'setup') return [];
    const actions = event.do.filter((action) => action.kind === 'spawn');
    return actions.length ? [{ ...event, do: actions }] : [];
  });
}

export function eventsWithoutDeployment(events: readonly LevelEvent[]): LevelEvents {
  return events.flatMap((event): LevelEvents => {
    if (event.trigger.kind !== 'setup') return [event];
    const actions = event.do.filter((action) => action.kind !== 'spawn');
    return actions.length ? [{ ...event, do: actions }] : [];
  });
}

export function mergeOtherEvents(
  current: readonly LevelEvent[],
  otherEvents: readonly LevelEvent[],
): LevelEvents {
  const usedIds = new Set(otherEvents.map((event) => event.id?.trim()).filter((id): id is string => Boolean(id)));
  const deploymentEvents = deploymentOnlyEvents(current).map((event, index): LevelEvent => {
    const original = event.id?.trim();
    if (!original || !usedIds.has(original)) {
      if (original) usedIds.add(original);
      return event;
    }
    // A hand-authored setup event may mix deployment with an Other Events action. The two
    // dedicated editors split that record for presentation, so give only the deployment
    // projection a fresh identity instead of duplicating the original id.
    const base = `${original}-deployment`;
    let id = base;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${base}-${suffix}`;
    usedIds.add(id);
    return { ...event, id, name: event.name?.trim() || `Deployment ${index + 1}` };
  });
  return [...deploymentEvents, ...otherEvents];
}

/**
 * Replace every setup-spawn action for one side with one canonical deployment event.
 * A zero roster means randomized deployment is disabled; zones intentionally survive
 * because geometry is user-authored independently from the event that consumes it.
 */
export function replaceSideDeployment(
  events: readonly LevelEvent[],
  side: ConditionSide,
  deployment: { roster: Roster; zoneIds: readonly string[] } | null,
): LevelEvents {
  let firstRemoved: LevelEvent | undefined;
  let insertionIndex = -1;
  const remaining: LevelEvents = [];

  for (const event of events) {
    if (event.trigger.kind !== 'setup') {
      remaining.push(event);
      continue;
    }
    const removed = event.do.filter((action) => isSideSpawn(action, side));
    const actions = event.do.filter((action) => !isSideSpawn(action, side));
    if (removed.length > 0) {
      firstRemoved ??= event;
      if (insertionIndex < 0) insertionIndex = remaining.length;
    }
    if (actions.length > 0) remaining.push({ ...event, do: actions });
  }

  if (!deployment || rosterSize(deployment.roster) === 0) return remaining;

  const event: LevelEvent = {
    id: firstRemoved?.id ?? `setup-${side}-deployment`,
    name: firstRemoved?.name?.trim() || (side === 'player' ? 'Deploy player force' : 'Deploy enemy force'),
    trigger: { kind: 'setup' },
    do: [{
      kind: 'spawn',
      side,
      roster: deployment.roster,
      zoneIds: [...new Set(deployment.zoneIds.map((id) => id.trim()).filter(Boolean))],
    }],
  };
  remaining.splice(insertionIndex < 0 ? remaining.length : insertionIndex, 0, event);
  return remaining;
}
