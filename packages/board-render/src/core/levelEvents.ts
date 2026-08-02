import type { CastleEventAction, Level, LevelEvent, LevelEvents, PawnPromotionEvent, Roster, SpawnEvent, Zone } from './level';
import type { CastleRule, DrawRules, PawnPromotionRule, Vec } from './types';

const key = (x: number, y: number): string => `${x},${y}`;

function zoneCells(level: Level, zones: readonly Zone[]): Vec[] {
  const cells: Vec[] = [];
  const seen = new Set<string>();
  for (const zone of zones) {
    for (const [x, y] of zone.tiles) {
      if (x < 0 || x >= level.board.cols || y < 0 || y >= level.board.rows) continue;
      const k = key(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      cells.push({ x, y });
    }
  }
  return cells;
}

export function zonesByIds(level: Level, zoneIds: readonly string[]): Zone[] {
  const wanted = new Set(zoneIds.map((id) => id.trim()).filter(Boolean));
  return level.layers.zones.filter((zone) => wanted.has(zone.id));
}

export function zoneCellsByIds(level: Level, zoneIds: readonly string[]): Vec[] {
  return zoneCells(level, zonesByIds(level, zoneIds));
}

export type StoredLevelEvent = LevelEvent | SpawnEvent | PawnPromotionEvent;

export function normalizeLevelEvent(event: StoredLevelEvent): LevelEvent {
  if ('kind' in event) {
    if (event.kind === 'spawn') {
      return {
        id: event.id,
        name: event.name,
        trigger: { kind: 'setup' },
        do: [{ kind: 'spawn', side: event.side, roster: event.roster, zoneIds: event.zoneIds }],
      };
    }
    return {
      id: event.id,
      name: event.name,
      trigger: event.trigger,
      do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
    };
  }
  if (!Array.isArray((event as { do?: unknown }).do) && event.trigger.kind === 'unit-enters-zone') {
    return {
      id: event.id,
      name: event.name,
      trigger: event.trigger,
      do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
    };
  }
  return event;
}

export function normalizeLevelEvents(events: readonly StoredLevelEvent[]): LevelEvents {
  return events.map(normalizeLevelEvent);
}

function legacySpawnEvents(level: Level): LevelEvents {
  if (level.placement !== 'random') return [];
  const events: LevelEvents = [];
  for (const side of ['player', 'enemy'] as const) {
    const roster: Roster = level.roster?.[side] ?? {};
    const legacyType = side === 'player' ? 'player-spawn' : 'enemy-spawn';
    const zoneIds = level.layers.zones.filter((zone) => zone.type === legacyType).map((zone) => zone.id);
    if (!zoneIds.length) continue;
    events.push({
      name: side === 'player' ? 'Deploy player force' : 'Deploy enemy force',
      trigger: { kind: 'setup' },
      do: [{ kind: 'spawn', side, roster, zoneIds }],
    });
  }
  return events;
}

function legacyPromotionEvents(level: Level): LevelEvents {
  return level.layers.zones
    .filter((zone) => zone.type === 'pawn-promotion')
    .map((zone): LevelEvent => ({
      name: `Promote at ${zone.id}`,
      trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn' }, zoneId: zone.id },
      do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
    }));
}

export function effectiveLevelEvents(level: Level): LevelEvents {
  if (level.events !== undefined) return normalizeLevelEvents(level.events as readonly StoredLevelEvent[]);
  return [...legacySpawnEvents(level), ...legacyPromotionEvents(level)];
}

export function spawnEventsForLevel(level: Level): SpawnEvent[] {
  return effectiveLevelEvents(level).flatMap((event): SpawnEvent[] => {
    if (event.trigger.kind !== 'setup') return [];
    return event.do
      .filter((action) => action.kind === 'spawn')
      .map((action) => ({
        kind: 'spawn',
        id: event.id,
        name: event.name,
        trigger: { kind: 'setup' },
        side: action.side,
        roster: action.roster,
        zoneIds: action.zoneIds,
      }));
  });
}

/**
 * The level's authored castling options (ADR-0072), resolved for GameState.castleRules.
 * Setup-triggered castle actions only; a rule with any off-board square is dropped
 * (the frontend validator rejects such saves — this guards hand-authored bodies).
 */
export function castleRulesForLevel(level: Level): CastleRule[] {
  const onBoard = (v: Vec): boolean => v.x >= 0 && v.x < level.board.cols && v.y >= 0 && v.y < level.board.rows;
  return effectiveLevelEvents(level).flatMap((event) => {
    if (event.trigger.kind !== 'setup') return [];
    return event.do
      .filter((action): action is CastleEventAction => action.kind === 'castle')
      .filter((action) => [action.king, action.rook, action.kingTo, action.rookTo].every(onBoard))
      .map((action) => ({ side: action.side, king: action.king, rook: action.rook, kingTo: action.kingTo, rookTo: action.rookTo }));
  });
}

/**
 * The chess draw rules this level enforces (ADR-0072), OR-ed across its chess-draws
 * events; undefined when none — the game then plays exactly as before (stalemate only).
 */
export function drawRulesForLevel(level: Level): DrawRules | undefined {
  let fiftyMove = false;
  let threefold = false;
  for (const event of effectiveLevelEvents(level)) {
    if (event.trigger.kind !== 'setup') continue;
    for (const action of event.do) {
      if (action.kind !== 'chess-draws') continue;
      fiftyMove = fiftyMove || action.fiftyMove === true;
      threefold = threefold || action.threefold === true;
    }
  }
  if (!fiftyMove && !threefold) return undefined;
  return { ...(fiftyMove ? { fiftyMove: true } : {}), ...(threefold ? { threefold: true } : {}) };
}

export function promotionRulesForLevel(level: Level): PawnPromotionRule[] {
  return effectiveLevelEvents(level)
    .filter((event) => event.trigger.kind === 'unit-enters-zone' && event.do.some((action) => action.kind === 'promote' && action.target.kind === 'triggering-unit'))
    .map((event) => ({
      side: event.trigger.kind === 'unit-enters-zone' ? event.trigger.unit.side : undefined,
      cells: event.trigger.kind === 'unit-enters-zone' ? zoneCellsByIds(level, [event.trigger.zoneId]) : [],
    }))
    .filter((rule) => rule.cells.length > 0);
}
