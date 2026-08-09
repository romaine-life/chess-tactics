// Compact "Level Info" view that toggles into the level panel's preview slot
// (same footprint as the board). Surfaces the DERIVED data a level knows about
// itself — board composition, unit roster by piece, the deal and band a War
// Battle deploys through, zones, and its win-rule mode (the Rules row). Its
// consumer (CampaignEditor's Info tab) is display-only, so there is no editing
// grid; this is the whole readout, not a header above one.
import { type ComponentProps, type ReactElement } from 'react';
import { levelBattleCardsDealt, type Level, type ZoneType } from '../core/level';
import { playerDeploymentCells } from '@chess-tactics/board-render/run/deployment';
import { MODE_NAME, objectiveContextForLevel, victoryRulesForLevel } from '../core/objectives';
import { formatClockSeconds } from '../core/clock';
import type { PieceType } from '../core/types';
import { isPlayablePieceType, isUnitPalette, paletteForSide, type UnitPalette } from '../core/pieces';
import { spawnEventsForLevel } from '../core/levelEvents';
import { objectiveBriefingForSide } from '../game/objectiveBriefing';
import type { PlayingSide } from '../game/clientPerspective';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { installedUiMedia, installedUiMediaIfPresent } from './installedUiMedia';
import { useStrategikonCardsIcon } from './strategikonNavigation';
import { levelToEditorBoard } from '../core/levelBoard';
import { assetFrameSrc, isPredrawnBackgroundActive, studioFamilies } from '@chess-tactics/board-render';

const PIECE_ORDER: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'rock', 'random-rock'];
const PIECE_LABEL: Record<PieceType, string> = {
  king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn', rock: 'Rock', 'random-rock': 'Rubble',
};
const ZONE_ORDER: ZoneType[] = ['region', 'player-spawn', 'player-king-spawn', 'enemy-spawn', 'enemy-threat', 'objective', 'falling-rock', 'pawn-promotion'];
const ZONE_LABEL: Record<ZoneType, string> = {
  region: 'Named regions', 'player-spawn': 'Ally deployment', 'player-king-spawn': 'King deployment', 'enemy-spawn': 'Enemy deployment', 'enemy-threat': 'Threat markers', objective: 'Goal markers', 'falling-rock': 'Rockfall markers', 'pawn-promotion': 'Promotion markers',
};
const TERRAIN_LABEL: Record<string, string> = {
  grass: 'Grass', water: 'Water', bridge: 'Bridge', road: 'Road', stone: 'Stone', rock: 'Rock', cliff: 'Cliff', dirt: 'Dirt', pebble: 'Pebble', sand: 'Sand',
  void: 'Gap',
};

/**
 * A row's mark: installed art at the row's own scale, beside the label it belongs to. Every one
 * of these resolves a real game asset — the objective flag, the Run's Battle drum, the card back
 * the player deals, the grass surface the editor paints — rather than a glyph invented for a
 * readout. `aria-hidden` because the label beside it already says the word.
 */
function RowIcon({ src, className = '' }: { src: string; className?: string }): ReactElement {
  return (
    <span className={`ce-li-icon ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

/**
 * The colours each side wears on the board this readout sits beside, read from the very
 * projection that board renders — so a roster icon and the piece standing on the map are the
 * same sprite rather than two guesses at the same side. A side with nothing authored (the player,
 * on a Battle whose army arrives from cards) has no projected faction to read, and falls back to
 * the gameplay side default the projection would give it.
 */
function boardPalettes(level: Level): Record<'player' | 'enemy', UnitPalette> {
  const projected = levelToEditorBoard(level).units ?? {};
  const authored = (side: 'player' | 'enemy'): UnitPalette | undefined => {
    for (const unit of level.layers.units) {
      if (unit.side !== side) continue;
      const faction = projected[`${unit.x},${unit.y}`]?.faction;
      if (isUnitPalette(faction)) return faction;
    }
    return undefined;
  };
  return {
    player: authored('player') ?? paletteForSide('player'),
    enemy: authored('enemy') ?? paletteForSide('enemy'),
  };
}

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * A palette flag the owner is auditioning in this exact seat, read from
 * `?flagCandidate=<palette>:<sha256>[,<palette>:<sha256>]`. The same review seam the Run's
 * progress icons use (ADR-0219): reviewing never installs anything, and the accepted roles below
 * are the runtime authority the moment the parameter is dropped.
 */
function reviewedFlagSrc(palette: UnitPalette): string | null {
  if (typeof window === 'undefined') return null;
  const declared = new URLSearchParams(window.location.search).get('flagCandidate');
  for (const entry of declared?.split(',') ?? []) {
    const [name, sha256] = entry.split(':').map((part) => part.trim().toLowerCase());
    if (name === palette && SHA256.test(sha256 ?? '')) return `/api/admin/media/${sha256}`;
  }
  return null;
}

/**
 * A side's flag in that side's own colours. A palette with no variant of its own falls back to
 * the one shared objective flag rather than flying nothing — which is what every palette did
 * before the variants existed.
 */
function flagIconSrc(palette: UnitPalette): string {
  return reviewedFlagSrc(palette)
    ?? installedUiMediaIfPresent(`ui-kit-icons-game-objective-${palette}-png`)
    ?? installedUiMedia('ui-kit-icons-game-objective-png');
}

/**
 * The readout's own element when the HOST owns the frame. Same class and same test id, so the
 * readout is the same thing to CSS and to a guard whichever way it is mounted — it simply has no
 * frame and no fill of its own, because the pane it sits in supplies both.
 */
function UnframedLevelInfo({
  className = '',
  fillRole: _fillRole,
  children,
  ...props
}: ComponentProps<typeof InnerChromeBox>): ReactElement {
  return <div {...props} className={className}>{children}</div>;
}

/**
 * The empty grass surface, exactly as the Level Editor paints it. "Tiles" counts squares of
 * board, so its mark is a square of board.
 */
function grassSurfaceIconSrc(): string {
  const asset = studioFamilies.find((family) => family.id === 'grass')?.assets[0];
  if (!asset) throw new Error('the grass terrain family has no installed surface');
  return assetFrameSrc(asset, 0);
}

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

/**
 * Pieces a side brings whose exact squares are DEALT when the Battle begins, as opposed to the
 * fixed ones authored onto the map. The Forces ledger sums both, so without this the reader
 * cannot tell a known position from one the Battle will choose.
 */
function dealtCountForSide(level: Level, side: 'player' | 'enemy'): number {
  let dealt = 0;
  for (const event of spawnEventsForLevel(level)) {
    if (event.side !== side) continue;
    for (const count of Object.values(event.roster ?? {})) {
      if (typeof count === 'number' && count > 0) dealt += count;
    }
  }
  return dealt;
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

/** Whole-board AI artwork owns the environment pixels, so its logical terrain cannot be
 * presented as a roster of individually rendered tile types. */
export function levelShowsTerrainTypeCounts(level: Level): boolean {
  return !isPredrawnBackgroundActive(levelToEditorBoard(level));
}

/**
 * A side's own count of a piece, as that many of the piece. The sprites overlap into one file so
 * a dozen pawns still fit the column, and the numeral stays at the column's edge: the file says
 * what is coming at a glance and the numeral settles exactly how many. Written as a bare count
 * rather than "×3" — three sprites beside "×3" reads as three lots of three.
 */
function PieceFile({ type, count, palette }: {
  type: PieceType;
  count: number;
  palette: UnitPalette;
}): ReactElement {
  // Rocks and rubble are board furniture with no unit sprite; they keep the name alone.
  if (!isPlayablePieceType(type)) return <span className="ce-li-file is-unsprited" aria-hidden="true" />;
  return (
    <span className="ce-li-file" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <PieceTypeIcon key={index} type={type} palette={palette} className="ce-li-file-unit" />
      ))}
    </span>
  );
}

function Roster({ counts, tone, label, palette, flagSrc, dealt = 0 }: {
  counts: PieceCounts;
  tone: string;
  label: string;
  /** The colours this side's pieces actually wear on the board beside the readout. */
  palette: UnitPalette;
  flagSrc: string;
  dealt?: number;
}): ReactElement {
  const present = PIECE_ORDER.filter((p) => counts[p]);
  const total = countTotal(counts);
  return (
    <div className="ce-li-roster">
      <div className={`ce-li-roster-head ${tone}`}>
        <RowIcon src={flagSrc} className="ce-li-flag" />
        <span>{label}</span>
        <strong>{total}</strong>
      </div>
      <ul>
        {present.map((p) => (
          <li key={p}>
            <span>{PIECE_LABEL[p]}</span>
            <PieceFile type={p} count={counts[p] ?? 0} palette={palette} />
            <b>{counts[p]}</b>
          </li>
        ))}
        {present.length === 0 ? <li className="ce-li-none">none</li> : null}
      </ul>
      {dealt > 0 ? (
        <p className="ce-li-dealt">
          {dealt} of {total} dealt at start · {total - dealt} fixed on the map
        </p>
      ) : null}
    </div>
  );
}

export function LevelInfoCompact({
  level,
  showZones = true,
  fillRole,
  className = '',
  titleBar = null,
  deploymentBand = null,
  framed = true,
}: {
  level: Level;
  /** Zones are authoring detail; a player-facing reconnaissance readout omits them. */
  showZones?: boolean;
  /** Installed role material under the readout; the frame's own role stays inner. */
  fillRole?: ComponentProps<typeof InnerChromeBox>['fillRole'];
  className?: string;
  /** The box's own title strip, seated flush at its top edge above the derived facts. */
  titleBar?: ReactElement | null;
  /**
   * When a board is showing beside this readout, the Zone row becomes the control that paints or
   * clears the deployment band on it — the number answers "how big" and the control answers
   * "where". A readout with no board of its own leaves this null and the row states the fact.
   */
  deploymentBand?: { shown: boolean; onToggle: () => void } | null;
  /**
   * False when the HOST already owns the frame this readout sits in — a divided pane whose rails
   * separate it from its neighbours. A second frame inside that one would draw a box around a
   * column that the pane's own rail has already bounded (ADR-0059).
   */
  framed?: boolean;
}): ReactElement {
  const cardsIconSrc = useStrategikonCardsIcon();
  const hourglassIconSrc = installedUiMedia('ui-kit-icons-game-wait-png');
  const { cols, rows } = level.board;
  const total = cols * rows;
  const filled = level.layers.terrain.filter((tile) => tile.terrain !== 'void').length;
  const showsTerrainTypeCounts = levelShowsTerrainTypeCounts(level);
  const terrainMix = showsTerrainTypeCounts
    ? Object.entries(countMap(level.layers.terrain.map((t) => t.terrain))).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    : [];
  const allies = forceCountsForSide(level, 'player');
  const enemies = forceCountsForSide(level, 'enemy');
  const palettes = boardPalettes(level);
  // What the player brings is not in the Forces ledger at all — it arrives from their own
  // collection, and how much of it this stage takes is the stage's own answer. Two numbers say
  // it: how many cards the Battle deals, and how many squares its band has to seat them on.
  // Present only for a War Battle; a Campaign or standalone Level deals nothing and reads its
  // deployment geometry off the Zones row instead.
  const cardsDealt = levelBattleCardsDealt(level);
  const deploymentSquares = cardsDealt === null ? 0 : playerDeploymentCells(level).length;
  const zoneMix = countMap(level.layers.zones.map((z) => z.type));
  const zoneParts = ZONE_ORDER.filter((z) => zoneMix[z]).map((z) => `${ZONE_LABEL[z]} ${zoneMix[z]}`);

  const Frame = framed ? InnerChromeBox : UnframedLevelInfo;
  return (
    <Frame
      className={`ce-level-info ${className}`.trim()}
      fillRole={fillRole}
      data-testid="level-info-compact"
    >
      {titleBar}
      <section className="ce-li-board">
        <span className="ce-li-title">Board</span>
        <div className="ce-li-stat"><span>Size</span><strong>{cols} × {rows}</strong></div>
        <div className="ce-li-stat">
          <span><RowIcon src={grassSurfaceIconSrc()} className="ce-li-tile-icon" />Tiles</span>
          <strong>{filled} / {total}</strong>
        </div>
        {showsTerrainTypeCounts ? (
          <div className="ce-li-chips">
            {terrainMix.map(([t, n]) => (
              <span key={t} className="ce-li-chip"><i className={`ce-li-swatch terrain-${t}`} />{TERRAIN_LABEL[t] ?? t} <b>{n}</b></span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ce-li-forces">
        <span className="ce-li-title">Forces</span>
        <div className="ce-li-rosters">
          <Roster
            counts={allies}
            tone="is-ally"
            label="Allies"
            palette={palettes.player}
            flagSrc={flagIconSrc(palettes.player)}
            dealt={dealtCountForSide(level, 'player')}
          />
          <Roster
            counts={enemies}
            tone="is-enemy"
            label="Enemies"
            palette={palettes.enemy}
            flagSrc={flagIconSrc(palettes.enemy)}
            dealt={dealtCountForSide(level, 'enemy')}
          />
        </div>
      </section>

      {cardsDealt !== null ? (
        <section className="ce-li-deployment">
          <span className="ce-li-title">Deployment</span>
          <div className="ce-li-stat">
            <span><RowIcon src={cardsIconSrc} className="ce-li-card-icon" />Cards dealt</span>
            <strong>{cardsDealt}</strong>
          </div>
          <div className="ce-li-stat">
            {deploymentBand ? (
              // The registered text button's TOGGLE variant — a label that is also its own
              // on/off state, which is what this row is. The `inner-toggle` unit is the Off/On
              // switch pair; it would put a second control beside a word that is already the
              // control.
              <ChromeButton
                unit="inner-text-button"
                // A box wears the marble; every trigger inside it wears the oak (ADR-0433). The
                // segmented `le-seg-btn` skin is deliberately absent: its frame is a `fill`
                // border-image, which paints the button's interior itself and covers any surface
                // under it — that is why this control came out slate while every other button on
                // the screen is wood.
                className="app-header-button ce-li-zone-toggle"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                selected={deploymentBand.shown}
                onClick={deploymentBand.onToggle}
                title={deploymentBand.shown ? 'Hide the deployment zone on the board' : 'Show the deployment zone on the board'}
              >
                Zone
              </ChromeButton>
            ) : <span>Zone</span>}
            <strong>{deploymentSquares} square{deploymentSquares === 1 ? '' : 's'}</strong>
          </div>
          <p className="ce-li-dealt">
            {cardsDealt === 1
              ? 'One card comes off your collection, and His Grace is always it.'
              : `${cardsDealt} cards come off your collection, His Grace first.`}
            {' '}Each is admitted whole, in order, while the zone still has room for it.
          </p>
        </section>
      ) : null}

      {showZones ? (
        <section className="ce-li-zones-row">
          <span className="ce-li-title">Zones</span>
          <span className="ce-li-zones">{zoneParts.length ? zoneParts.join('  ·  ') : 'None defined'}</span>
        </section>
      ) : null}

      <section className="ce-li-zones-row">
        <span className="ce-li-title">Rules</span>
        <span className="ce-li-zones">{levelObjectiveLine(level)}{'  ·  '}{level.difficulty}</span>
      </section>

      <section className="ce-li-zones-row">
        <span className="ce-li-title"><RowIcon src={hourglassIconSrc} className="ce-li-clock-icon" />Time</span>
        <span className="ce-li-zones">
          {level.timeControl
            ? `${formatClockSeconds(level.timeControl.initialSeconds)}${level.timeControl.incrementSeconds ? ` +${level.timeControl.incrementSeconds}s / move` : ''}`
            : 'Untimed'}
        </span>
      </section>
    </Frame>
  );
}
