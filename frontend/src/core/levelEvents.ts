import type { Level, LevelEvent, LevelEvents, PawnPromotionEvent, Roster, SpawnEvent, Zone } from './level';
import type { PawnPromotionRule, Vec } from './types';

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

function legacySpawnEvents(level: Level): SpawnEvent[] {
  if (level.placement !== 'random') return [];
  const events: SpawnEvent[] = [];
  for (const side of ['player', 'enemy'] as const) {
    const roster: Roster = level.roster?.[side] ?? {};
    const legacyType = side === 'player' ? 'player-spawn' : 'enemy-spawn';
    const zoneIds = level.layers.zones.filter((zone) => zone.type === legacyType).map((zone) => zone.id);
    if (!zoneIds.length) continue;
    events.push({
      kind: 'spawn',
      name: side === 'player' ? 'Deploy player force' : 'Deploy enemy force',
      trigger: { kind: 'setup' },
      side,
      roster,
      zoneIds,
    });
  }
  return events;
}

function legacyPromotionEvents(level: Level): PawnPromotionEvent[] {
  return level.layers.zones
    .filter((zone) => zone.type === 'pawn-promotion')
    .map((zone): PawnPromotionEvent => ({
      kind: 'pawn-promotion',
      name: `Promote at ${zone.id}`,
      trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn' }, zoneId: zone.id },
    }));
}

export function effectiveLevelEvents(level: Level): LevelEvents {
  if (level.events !== undefined) return level.events;
  const authored: LevelEvents = [];
  const hasSpawn = authored.some((event) => event.kind === 'spawn');
  const hasPromotion = authored.some((event) => event.kind === 'pawn-promotion');
  const legacy: LevelEvent[] = [
    ...(hasSpawn ? [] : legacySpawnEvents(level)),
    ...(hasPromotion ? [] : legacyPromotionEvents(level)),
  ];
  return [...authored, ...legacy];
}

export function spawnEventsForLevel(level: Level): SpawnEvent[] {
  return effectiveLevelEvents(level).filter((event): event is SpawnEvent => event.kind === 'spawn');
}

export function promotionRulesForLevel(level: Level): PawnPromotionRule[] {
  return effectiveLevelEvents(level)
    .filter((event): event is PawnPromotionEvent => event.kind === 'pawn-promotion')
    .map((event) => ({
      side: event.trigger.unit.side,
      cells: zoneCellsByIds(level, [event.trigger.zoneId]),
      choices: event.choices,
      defaultPromotion: event.defaultPromotion,
    }))
    .filter((rule) => rule.cells.length > 0);
}
