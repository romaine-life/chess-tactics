// Compact "Level Info" view that toggles into the level panel's preview slot
// (same footprint as the board). Surfaces the DERIVED data a level knows about
// itself — board composition, unit roster by piece, zones, and its win-rule mode
// (the Rules row). Its consumer (CampaignEditor's Info tab) is display-only, so
// there is no editing grid; this is the whole readout, not a header above one.
import { type ReactElement } from 'react';
import type { Level, Roster as PieceRoster, ZoneType } from '../core/level';
import { MODE_NAME, objectiveSummary } from '../core/objectives';
import type { PieceType } from '../core/types';

const PIECE_ORDER: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'rock', 'random-rock'];
const PIECE_LABEL: Record<PieceType, string> = {
  king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn', rock: 'Rock', 'random-rock': 'Rubble',
};
const ZONE_ORDER: ZoneType[] = ['player-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock'];
const ZONE_LABEL: Record<ZoneType, string> = {
  'player-spawn': 'Ally spawns', 'enemy-spawn': 'Enemy spawns', 'enemy-threat': 'Threats', objective: 'Objectives', 'falling-rock': 'Hazards',
};
const TERRAIN_LABEL: Record<string, string> = {
  grass: 'Grass', water: 'Water', bridge: 'Bridge', road: 'Road', stone: 'Stone', rock: 'Rock', cliff: 'Cliff', dirt: 'Dirt', pebble: 'Pebble', sand: 'Sand',
};

function countMap<K extends string>(keys: K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

// Which side "owns" the King for a level, mirroring core's kingSideOf(pieces) but read
// off the LEVEL's own content instead of a live board: authored units when placement is
// fixed, the roster counts when it's random. Same rule — the player owns it only when the
// player fields a King and the enemy doesn't; both/neither ⇒ 'enemy' (rival-kings /
// free-skirmish default). Lets the level-select surfaces render King Assault's
// direction-aware copy ("Protect your King") without instantiating a game. Exported so the
// campaign play/edit level rows share ONE implementation (ADR-0048: no re-hardcoded labels).
export function kingSideForLevel(level: Level): 'player' | 'enemy' {
  const hasKing = (side: 'player' | 'enemy'): boolean => {
    if (level.placement === 'random') return Boolean(level.roster?.[side]?.king);
    return level.layers.units.some((u) => u.side === side && u.type === 'king');
  };
  return hasKing('player') && !hasKing('enemy') ? 'player' : 'enemy';
}

/** The win-rule goal line for a level's Rules row / level-select subtitle — mode name plus
 * the direction-aware summary (so a player-held-King King Assault reads "Protect your King"). */
export function levelObjectiveLine(level: Level): string {
  return `${MODE_NAME[level.objective]} — ${objectiveSummary(level.objective, kingSideForLevel(level))}`;
}

// A compact "Pawn ×3, Knight ×1" line for a random-placement roster, in board order.
function rosterSummary(roster: PieceRoster | undefined): string {
  if (!roster) return 'none';
  const parts = PIECE_ORDER.filter((p) => roster[p]).map((p) => `${PIECE_LABEL[p]} ×${roster[p]}`);
  return parts.length ? parts.join(', ') : 'none';
}

function Roster({ units, tone, label }: { units: Level['layers']['units']; tone: string; label: string }): ReactElement {
  const counts = countMap(units.map((u) => u.type));
  const present = PIECE_ORDER.filter((p) => counts[p]);
  return (
    <div className="ce-li-roster">
      <div className={`ce-li-roster-head ${tone}`}><span>{label}</span><strong>{units.length}</strong></div>
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
  const filled = level.layers.terrain.length;
  const terrainMix = Object.entries(countMap(level.layers.terrain.map((t) => t.terrain))).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const allies = level.layers.units.filter((u) => u.side === 'player');
  const enemies = level.layers.units.filter((u) => u.side === 'enemy');
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
          <Roster units={allies} tone="is-ally" label="Allies" />
          <Roster units={enemies} tone="is-enemy" label="Enemies" />
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

      {level.placement === 'random' ? (
        // Under random placement the Forces rosters above are empty (units are dealt at game
        // start from the roster, not authored), so surface the roster counts explicitly —
        // otherwise the Info tab reads as a level with no pieces.
        <section className="ce-li-zones-row">
          <span className="ce-li-title">Placement</span>
          <span className="ce-li-zones">
            Random placement  ·  Allies {rosterSummary(level.roster?.player)}  ·  Enemies {rosterSummary(level.roster?.enemy)}
          </span>
        </section>
      ) : null}
    </div>
  );
}
