// Compact "Level Info" view that toggles into the level panel's preview slot
// (same footprint as the board). Surfaces the DERIVED data a level knows about
// itself — board composition, unit roster by piece, zones, and its win-rule mode
// (the Rules row). Its consumer (CampaignEditor's Info tab) is display-only, so
// there is no editing grid; this is the whole readout, not a header above one.
import { type ReactElement } from 'react';
import type { Level, ZoneType } from '../core/level';
import { MODE_NAME, objectiveContextForLevel, victoryRulesForLevel } from '../core/objectives';
import { formatClockSeconds } from '../core/clock';
import type { PieceType } from '../core/types';
import { spawnEventsForLevel } from '../core/levelEvents';
import { objectiveBriefingForSide } from '../game/objectiveBriefing';
import type { PlayingSide } from '../game/clientPerspective';

const PIECE_ORDER: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'rock', 'random-rock'];
const PIECE_LABEL: Record<PieceType, string> = {
  king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn', rock: 'Rock', 'random-rock': 'Rubble',
};
const ZONE_ORDER: ZoneType[] = ['region', 'player-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock', 'pawn-promotion'];
const ZONE_LABEL: Record<ZoneType, string> = {
  region: 'Named regions', 'player-spawn': 'Ally deployment', 'enemy-spawn': 'Enemy deployment', 'enemy-threat': 'Threat markers', objective: 'Goal markers', 'falling-rock': 'Rockfall markers', 'pawn-promotion': 'Promotion markers',
};
const TERRAIN_LABEL: Record<string, string> = {
  grass: 'Grass', water: 'Water', bridge: 'Bridge', road: 'Road', stone: 'Stone', rock: 'Rock', cliff: 'Cliff', dirt: 'Dirt', pebble: 'Pebble', sand: 'Sand',
  void: 'Gap',
};

function countMap<K extends string>(keys: K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

type PieceCounts = Partial<Record<PieceType, number>>;

function forceCountsForSide(level: Level, side: 'player' | 'enemy'): PieceCounts {
  const counts = countMap(level.layers.units.filter((u) => u.side === side).map((u) => u.type));
  for (const event of spawnEventsForLevel(level)) {
    if (event.side !== side) continue;
    for (const [piece, count] of Object.entries(event.roster ?? {})) {
      if (typeof count !== 'number' || count <= 0) continue;
      const type = piece as PieceType;
      counts[type] = (counts[type] ?? 0) + count;
    }
  }
  return counts;
}

function countTotal(counts: PieceCounts): number {
  return PIECE_ORDER.reduce((sum, piece) => sum + (counts[piece] ?? 0), 0);
}

// Which side "owns" the King for a level, mirroring core's kingSideOf(pieces) but read
// off the LEVEL's own content instead of a live board: authored units plus setup spawn
// events. Same rule — the player owns it only when the player fields a King and the enemy
// doesn't; both/neither ⇒ 'enemy' (rival-kings / free-skirmish default). Lets the
// level-select surfaces render King Assault's direction-aware copy ("Protect your King")
// without instantiating a game. Exported so the campaign play/edit level rows share ONE
// implementation (ADR-0050: no re-hardcoded labels).
export function kingSideForLevel(level: Level): 'player' | 'enemy' {
  const hasKing = (side: 'player' | 'enemy'): boolean => {
    return Boolean(forceCountsForSide(level, side).king);
  };
  return hasKing('player') && !hasKing('enemy') ? 'player' : 'enemy';
}

/** The rules line for a level selector or lobby seat. Both the goal and danger come from the
 * exact rule list; `perspectiveSide` changes only the client projection, never the simulation. */
export function levelObjectiveLine(level: Level, perspectiveSide: PlayingSide = 'player'): string {
  const ctx = { ...objectiveContextForLevel(level), kingSide: kingSideForLevel(level) };
  const rules = victoryRulesForLevel(level, ctx);
  return `${MODE_NAME[level.objective]} — ${objectiveBriefingForSide(rules, perspectiveSide).summary}`;
}

function Roster({ counts, tone, label }: { counts: PieceCounts; tone: string; label: string }): ReactElement {
  const present = PIECE_ORDER.filter((p) => counts[p]);
  return (
    <div className="ce-li-roster">
      <div className={`ce-li-roster-head ${tone}`}><span>{label}</span><strong>{countTotal(counts)}</strong></div>
      <ul>
        {present.map((p) => <li key={p}><span>{PIECE_LABEL[p]}</span><b>×{counts[p]}</b></li>)}
        {present.length === 0 ? <li className="ce-li-none">none</li> : null}
      </ul>
    </div>
  );
}

export function LevelInfoCompact({ level }: { level: Level }): ReactElement {
  const { cols, rows } = level.board;
  const total = cols * rows;
  const filled = level.layers.terrain.filter((tile) => tile.terrain !== 'void').length;
  const terrainMix = Object.entries(countMap(level.layers.terrain.map((t) => t.terrain))).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const allies = forceCountsForSide(level, 'player');
  const enemies = forceCountsForSide(level, 'enemy');
  const zoneMix = countMap(level.layers.zones.map((z) => z.type));
  const zoneParts = ZONE_ORDER.filter((z) => zoneMix[z]).map((z) => `${ZONE_LABEL[z]} ${zoneMix[z]}`);

  return (
    <div className="ce-level-info" data-testid="level-info-compact">
      <section className="ce-li-board">
        <span className="ce-li-title">Board</span>
        <div className="ce-li-stat"><span>Size</span><strong>{cols} × {rows}</strong></div>
        <div className="ce-li-stat"><span>Tiles</span><strong>{filled} / {total}</strong></div>
        <div className="ce-li-chips">
          {terrainMix.map(([t, n]) => (
            <span key={t} className="ce-li-chip"><i className={`ce-li-swatch terrain-${t}`} />{TERRAIN_LABEL[t] ?? t} <b>{n}</b></span>
          ))}
        </div>
      </section>

      <section className="ce-li-forces">
        <span className="ce-li-title">Forces</span>
        <div className="ce-li-rosters">
          <Roster counts={allies} tone="is-ally" label="Allies" />
          <Roster counts={enemies} tone="is-enemy" label="Enemies" />
        </div>
      </section>

      <section className="ce-li-zones-row">
        <span className="ce-li-title">Zones</span>
        <span className="ce-li-zones">{zoneParts.length ? zoneParts.join('  ·  ') : 'None defined'}</span>
      </section>

      <section className="ce-li-zones-row">
        <span className="ce-li-title">Rules</span>
        <span className="ce-li-zones">{levelObjectiveLine(level)}{'  ·  '}{level.difficulty}</span>
      </section>

      <section className="ce-li-zones-row">
        <span className="ce-li-title">Time</span>
        <span className="ce-li-zones">
          {level.timeControl
            ? `${formatClockSeconds(level.timeControl.initialSeconds)}${level.timeControl.incrementSeconds ? ` +${level.timeControl.incrementSeconds}s / move` : ''}`
            : 'Untimed'}
        </span>
      </section>
    </div>
  );
}
