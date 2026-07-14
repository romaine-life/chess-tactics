import { useEffect, useState, type CSSProperties } from 'react';
import { useSkirmish } from '../game/store';
import { useSkirmishView } from '../game/skirmishView';
import { livingPieces } from '../core/rules';
import { PIECE_LABEL, PIECE_MARK, isPlayablePieceType, paletteForSide, pieceSpritePath } from '../core/pieces';
import type { Piece, PieceType, PromotionPieceType, Side } from '../core/types';
import type { TimeControl } from '../core/level';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
// One shared "unit portrait box" (master render + crop + the fill-frame) — the Selected-Unit
// portrait AND the roster slots both render through it, so framing/fill/crop are defined once and
// never re-derived per surface. See docs/portrait-contract.md.
import { UnitPortrait, loadCrops, STORAGE_KEY, type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
import { runtimePortraitMasterSrc } from './portraitCandidates';
import { useConfirm } from './shared/ConfirmDialog';
import { BackGlyph, RestartGlyph, NewGlyph } from './shared/actionGlyphs';
import { NavButton } from './shared/NavButton';
import { SkirmishClockControl } from './SkirmishClockControl';
import { loadSkirmishClockPref } from '../game/skirmishClockPref';
import { Stepper } from './shared/Stepper';
import { clientSide, clientSideLabel, clientSideOrder, clientSideRelation, clientTurnLabel, type PlayingSide } from '../game/clientPerspective';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';

const TYPE_LABEL = PIECE_LABEL;

const ROLE: Record<PieceType, string> = {
  pawn: 'Forward footman',
  knight: 'Mounted raider',
  bishop: 'Diagonal runner',
  rook: 'Orthogonal siege keep',
  queen: 'Promoted raider',
  king: 'Royal commander',
  rock: 'Impassable obstacle',
  'random-rock': 'Impassable obstacle',
};

const MARK = PIECE_MARK;

type HudTab = 'unit' | 'roster' | 'log' | 'view' | 'controls';

// Icon-based tab strip: each section is a kit glyph, not a text word. The `label`
// stays as the accessible name (aria-label) + hover tooltip so the icon never loses
// its meaning. Glyphs are reused from the curated kit icon set (ADR-0011/0032):
//   unit = single knight, roster = two pawns (the whole force), log = info feed,
//   view = display/screen, controls = gear.
const HUD_TABS: { id: HudTab; label: string }[] = [
  { id: 'unit', label: 'Unit' },
  { id: 'roster', label: 'Roster' },
  { id: 'log', label: 'Log' },
  { id: 'view', label: 'View' },
  { id: 'controls', label: 'Controls' },
];

// ---- In-match shortcut grid (StarCraft-style "grid" keys) -------------------
// A 3x5 command card in the Controls tab. Cells map to REAL keyboard positions
// (Q-W-E-R-T / A-S-D-F-G / Z-X-C-V-B) so the painted grid and the physical keys
// share one muscle memory; empty cells are open slots for future shortcuts.
// The same SHORTCUT_BINDINGS table drives both the painted buttons and the global
// key handler, so a click and its key can never drift apart.

type OverlayFlag = 'showEnemyAttacks' | 'showEnemyMoves' | 'showPlayerAttacks' | 'showPlayerMoves' | 'showPromotionZones' | 'showGrid';

type GridAction =
  | { kind: 'toggle'; flag: OverlayFlag; label: string; hint: string }
  | { kind: 'zoom'; dir: 1 | -1; label: string; hint: string }
  | { kind: 'deselect'; label: string; hint: string };

const SHORTCUT_KEY_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't'],
  ['a', 's', 'd', 'f', 'g'],
  ['z', 'x', 'c', 'v', 'b'],
];

export const SHORTCUT_BINDINGS: Record<string, GridAction> = {
  q: { kind: 'toggle', flag: 'showEnemyAttacks', label: 'Opp. attacks', hint: 'Show all opponent attack squares (danger zone)' },
  w: { kind: 'toggle', flag: 'showEnemyMoves', label: 'Opp. moves', hint: 'Show all opponent legal-move squares' },
  e: { kind: 'toggle', flag: 'showGrid', label: 'Grid', hint: 'Show the board grid overlay' },
  r: { kind: 'deselect', label: 'Deselect all', hint: 'Clear the selected and focused units' },
  a: { kind: 'toggle', flag: 'showPlayerAttacks', label: 'Your attacks', hint: 'Show all friendly attack squares' },
  s: { kind: 'toggle', flag: 'showPlayerMoves', label: 'Your moves', hint: 'Show all friendly legal-move squares' },
  z: { kind: 'zoom', dir: 1, label: 'Zoom in', hint: 'Zoom the board in' },
  x: { kind: 'zoom', dir: -1, label: 'Zoom out', hint: 'Zoom the board out' },
};

const ZOOM_STEP = 0.1;

/** Run the command card action for a physical key or painted button. */
export function runSkirmishShortcut(key: string, repeat = false): boolean {
  const action = SHORTCUT_BINDINGS[key.toLowerCase()];
  if (!action || (repeat && action.kind !== 'zoom')) return false;
  if (action.kind === 'toggle') {
    useSkirmishView.getState().toggle(action.flag);
  } else if (action.kind === 'zoom') {
    const view = useSkirmishView.getState();
    view.setZoom(view.zoom + action.dir * ZOOM_STEP);
  } else {
    useSkirmish.getState().select(null);
  }
  return true;
}

const PROMOTION_LABEL: Record<PromotionPieceType, string> = {
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

function unitSprite(piece: Piece | null): string | null {
  if (!piece || piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  return pieceSpritePath(piece.type, paletteForSide(piece.side, piece.palette), piece.facing);
}

/** Whole numbers print bare; fractional distances print to one decimal (6.5). */
function fmtStat(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtDelaySeconds(ms: number): string {
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

function parseDelaySeconds(raw: string): number | null {
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function UnitBadge({ piece, large = false }: { piece: Piece | null; large?: boolean }) {
  const side = piece?.side ?? 'neutral';
  const label = piece ? MARK[piece.type] : '?';
  const src = unitSprite(piece);
  return (
    <span className={`skirmish-unit-badge ${side} ${large ? 'large' : ''}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : label}
    </span>
  );
}

function CountPip({ side, count, owner }: { side: Side; count: number; owner: 'Your' | 'Opponent' }) {
  return (
    <span className={`skirmish-count-pip ${side}`} aria-label={`${owner} remaining forces: ${count}`}>
      <span className={`skirmish-icon skirmish-icon-rook-${side === 'enemy' ? 'red' : 'blue'}`} aria-hidden="true" />
      <strong aria-hidden="true">{count}</strong>
    </span>
  );
}

export function skirmishUnitOwnerLabel(side: Side, localSide: PlayingSide): string {
  return `${clientSideLabel(side, localSide)} unit`;
}

export function skirmishRosterAction(side: Side, localSide: PlayingSide): 'select' | 'focus' {
  return clientSideRelation(side, localSide) === 'self' ? 'select' : 'focus';
}

type SkirmishHudProps = {
  className?: string;
  style?: CSSProperties;
  /** Audit/embedded surfaces can retain tab interaction without installing match-wide shortcuts. */
  enableGlobalShortcuts?: boolean;
  /** Show the (+) button for authored non-campaign or single-player test/attempt loops. */
  canStartNewSkirmish?: boolean;
  /** In-place restart of the CURRENT authored battle. Non-null only
   *  in single-player; shown as the ↻ Restart button. Same action as the title-bar diamond. */
  onRestart?: (() => void) | null;
  /** Accessible name for the Restart button (e.g. "Restart level" / "Restart skirmish"). */
  restartLabel?: string;
  /** Start a new attempt for the CURRENT authored scenario. */
  onNewSkirmish?: (() => void) | null;
  /** Accessible name for the New button (e.g. "New attempt" / "New skirmish"). */
  newSkirmishLabel?: string;
  /** Show the battle-clock picker. Skirmish profiles edit the saved pref; playtests edit this attempt. */
  showClockControl?: boolean;
  clockControlValue?: TimeControl | null;
  onClockControlChange?: (value: TimeControl | null) => void;
  /** Optional return target for editor/launched playtests. */
  returnHref?: string | null;
  returnLabel?: string;
  /** False in a secondary same-seat tab: keep inspection/view controls, hide lifecycle writes. */
  netInteractive?: boolean;
  /** Development-only owner calibration for a temporary pre-drawn plate candidate. */
  onOpenPredrawnRegistration?: (() => void) | null;
};

export function SkirmishHud({
  className = '',
  style,
  enableGlobalShortcuts = true,
  canStartNewSkirmish = true,
  onRestart = null,
  restartLabel = 'Restart',
  onNewSkirmish = null,
  newSkirmishLabel = 'New skirmish',
  showClockControl = true,
  clockControlValue,
  onClockControlChange,
  returnHref = null,
  returnLabel = 'Back',
  netInteractive = true,
  onOpenPredrawnRegistration = null,
}: SkirmishHudProps = {}) {
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const focusedId = useSkirmish((s) => s.focusedId);
  const log = useSkirmish((s) => s.log);
  const net = useSkirmish((s) => s.net);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const resign = useSkirmish((s) => s.resign);
  const resignLocal = useSkirmish((s) => s.resignLocal);
  const pendingPromotion = useSkirmish((s) => s.pendingPromotion);
  const choosePromotion = useSkirmish((s) => s.choosePromotion);
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const testMode = useSkirmish((s) => s.testMode);
  const testMinCpuDelayMs = useSkirmish((s) => s.testMinCpuDelayMs);
  const setTestMinCpuDelay = useSkirmish((s) => s.setTestMinCpuDelay);

  // Resign is irreversible and hands the opponent the win — gate it behind a confirm
  // (the kit-framed one, not window.confirm, so it stays in-world). Netplay relays it
  // to the server; solo/test boards end locally as a defeat.
  const { ask, dialog } = useConfirm();

  const [tab, setTab] = useState<HudTab>('unit');

  // Portrait crops come from the SAME source the editor writes (localStorage), so the HUD bust
  // matches the editor live; re-read when the editor saves in another tab.
  const [portraitCrops, setPortraitCrops] = useState(loadCrops);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setPortraitCrops(loadCrops()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const showMoves = useSkirmishView((s) => s.showMoves);
  const showEnemyAttacks = useSkirmishView((s) => s.showEnemyAttacks);
  const showBlocked = useSkirmishView((s) => s.showBlocked);
  const showEnemyMoves = useSkirmishView((s) => s.showEnemyMoves);
  const showPlayerAttacks = useSkirmishView((s) => s.showPlayerAttacks);
  const showPlayerMoves = useSkirmishView((s) => s.showPlayerMoves);
  const showPromotionZones = useSkirmishView((s) => s.showPromotionZones);
  const showGrid = useSkirmishView((s) => s.showGrid);
  const zoom = useSkirmishView((s) => s.zoom);
  const toggleOverlay = useSkirmishView((s) => s.toggle);
  const setZoom = useSkirmishView((s) => s.setZoom);
  const resetView = useSkirmishView((s) => s.resetView);

  // Current state of each grid toggle, for the pressed/active look on the cards.
  const flagValue: Record<OverlayFlag, boolean> = {
    showEnemyAttacks, showEnemyMoves, showPlayerAttacks, showPlayerMoves, showPromotionZones, showGrid,
  };

  // Global key handler — the grid keys work anywhere on the board, not just while the
  // Controls tab is open. Reads live view state via getState() so the listener never
  // goes stale (no re-binding per zoom change). Ignores typing fields and modifier
  // combos so it never steals browser/OS shortcuts.
  useEffect(() => {
    if (!enableGlobalShortcuts) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!runSkirmishShortcut(e.key, e.repeat)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableGlobalShortcuts]);

  // Status reads from THIS client's seat. Single-player: 'you' = 'player'. Netplay:
  // 'you' = the lobby seat this client controls (host='player', guest='enemy'), so the
  // guest sees "Victory" when the 'enemy' side wins and "Your turn" on the enemy turn.
  const localSide = clientSide(net);
  const rosterRows = clientSideOrder(localSide).map((side) => ({ side, pieces: livingPieces(game.pieces, side) }));
  const selected = game.pieces.find((piece) => piece.id === selectedId && piece.alive) ?? null;
  const focused = game.pieces.find((piece) => piece.id === focusedId && piece.alive) ?? selected;
  const logLines = log.length ? log.slice(0, 16) : ['Skirmish begins.'];
  const focusedPortraitBackdrop = focused && isPlayablePieceType(focused.type) ? DEFAULT_BACKGROUND_SET.portraits[focused.type] : null;
  const promotingPiece = pendingPromotion ? game.pieces.find((piece) => piece.id === pendingPromotion.pieceId) ?? null : null;
  const turnLabel = clientTurnLabel(game, localSide, !!net?.pendingMove);

  return (
    <>
      {/* Portals to <body>; render anywhere. Only visible while a resign confirm is open. */}
      {dialog}
      <OuterChromeBox
        chromeConsumer="skirmish-hud"
        titled
        data-testid="skirmish-hud"
        className={`skirmish-hud ${className}`.trim()}
        style={style}
        aria-label="Skirmish command HUD"
      >
        <OuterChromeHeader title="Controls">
          <div className="skirmish-hud-tabs" role="tablist" aria-label="HUD sections">
            {HUD_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                data-chrome-unit="inner-text-button"
                id={`skirmish-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`skirmish-panel-${t.id}`}
                className={chromeUnitClassNames('inner-text-button', 'skirmish-hud-tab', tab === t.id && 'active')}
                aria-label={t.label}
                title={t.label}
                onClick={() => setTab(t.id)}
              >
                <span className={`skirmish-tab-icon skirmish-tab-icon-${t.id}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </OuterChromeHeader>

      <section className="skirmish-score-panel" aria-label="Turn summary">
        <div>
          <span className="skirmish-eyebrow">Status</span>
          <strong data-testid="turn-label">{turnLabel}</strong>
        </div>
        <div className="skirmish-counts" aria-label="Remaining forces">
          {rosterRows.map(({ side, pieces }, index) => (
            <CountPip key={side} side={side} count={pieces.length} owner={index === 0 ? 'Your' : 'Opponent'} />
          ))}
        </div>
      </section>

      {pendingPromotion ? (
        <section className="skirmish-card skirmish-promotion-card" aria-label="Pawn promotion">
          <span className="skirmish-eyebrow">Promote Pawn</span>
          <div className="skirmish-promotion-options">
            {pendingPromotion.choices.map((type) => {
              const palette = paletteForSide(promotingPiece?.side ?? localSide, promotingPiece?.palette);
              const src = pieceSpritePath(type, palette, promotingPiece?.facing);
              return (
                <button
                  key={type}
                  type="button"
                  data-chrome-unit="inner-asset-swatch"
                  className={chromeUnitClassNames('inner-asset-swatch', 'app-header-button', 'skirmish-promotion-option')}
                  onClick={() => choosePromotion(type)}
                  aria-label={`Promote to ${PROMOTION_LABEL[type]}`}
                  title={`Promote to ${PROMOTION_LABEL[type]}`}
                >
                  <img src={src} alt="" draggable={false} />
                  <span>{PROMOTION_LABEL[type]}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div
        className="skirmish-hud-panel"
        role="tabpanel"
        id={`skirmish-panel-${tab}`}
        aria-labelledby={`skirmish-tab-${tab}`}
      >
        {tab === 'unit' && (
          <section className="skirmish-card skirmish-selected-card" aria-label="Selected unit">
            <h2>Selected Unit</h2>
            <div className="skirmish-selected-body">
              {focused && isPlayablePieceType(focused.type) ? (
                <UnitPortrait
                  piece={focused.type as PortraitPiece}
                  palette={paletteForSide(focused.side, focused.palette) as PortraitPalette}
                  crop={portraitCrops[focused.type as PortraitPiece]}
                  backdrop={focusedPortraitBackdrop}
                  className="unit-portrait--hud"
                  masterUrl={runtimePortraitMasterSrc(
                    focused.type as PortraitPiece,
                    paletteForSide(focused.side, focused.palette) as PortraitPalette,
                  )}
                />
              ) : (
                <InnerChromeBox className="unit-portrait unit-portrait--hud" style={{ display: 'grid', placeItems: 'center' }}>
                  <UnitBadge piece={focused} large />
                </InnerChromeBox>
              )}
              <div className="skirmish-selected-copy">
                <strong data-testid="selected-name">{focused ? TYPE_LABEL[focused.type] : 'None'}</strong>
                <span>{focused ? `${skirmishUnitOwnerLabel(focused.side, localSide)} - ${ROLE[focused.type]}` : 'Choose a unit on the board.'}</span>
              </div>
            </div>
            {focused && (focused.side === 'player' || focused.side === 'enemy') && (
              <InnerChromeBox className="skirmish-service-record">
                <h3>Service Record</h3>
                <dl>
                  <div><dt>Used</dt><dd>{focused.timesUsed ?? 0}</dd></div>
                  <div><dt>Dist</dt><dd>{fmtStat(focused.squaresTraveled ?? 0)}</dd></div>
                  <div><dt>Kills</dt><dd>{focused.enemiesKilled ?? 0}</dd></div>
                  <div><dt>Escapes</dt><dd>{focused.escapes ?? 0}</dd></div>
                  <div><dt>Threats</dt><dd>{focused.threatsMade ?? 0}</dd></div>
                </dl>
              </InnerChromeBox>
            )}
          </section>
        )}

        {tab === 'roster' && (
          <section className="skirmish-card skirmish-roster-card" aria-label="Roster">
            <h2>Roster</h2>
            <div className="skirmish-roster-rows">
              {rosterRows.map(({ side, pieces }) => (
                <div className="skirmish-roster-strip" key={side} aria-label={`${clientSideLabel(side, localSide)} roster`}>
                  {pieces.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      className={`skirmish-roster-slot ${piece.id === focused?.id ? 'active' : ''}`.trim()}
                      onClick={() => skirmishRosterAction(piece.side, localSide) === 'select' ? select(piece.id) : focus(piece.id)}
                      aria-label={`${clientSideLabel(piece.side, localSide)} ${TYPE_LABEL[piece.type]}`}
                    >
                      {isPlayablePieceType(piece.type) ? (
                        <UnitPortrait
                          piece={piece.type as PortraitPiece}
                          palette={paletteForSide(piece.side, piece.palette) as PortraitPalette}
                          crop={portraitCrops[piece.type as PortraitPiece]}
                          className="unit-portrait--roster"
                          masterUrl={runtimePortraitMasterSrc(
                            piece.type as PortraitPiece,
                            paletteForSide(piece.side, piece.palette) as PortraitPalette,
                          )}
                        />
                      ) : (
                        <UnitBadge piece={piece} />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'log' && (
          <section className="skirmish-card skirmish-log-card" aria-label="Event log">
            <h2>Event Log</h2>
            <ul>
              {logLines.map((line, i) => (
                <li key={`${line}-${i}`}>
                  <span aria-hidden="true" />
                  <strong>T{Math.max(1, logLines.length - i)}</strong>
                  <em>{line}</em>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'view' && (
          <section className="skirmish-card skirmish-view-card" aria-label="Board view">
            <h2>Board View</h2>
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Zoom</span>
              <div className="skirmish-view-row">
                <Stepper
                  value={Math.round(zoom * 100)}
                  suffix="%"
                  decreaseLabel="Zoom out"
                  increaseLabel="Zoom in"
                  onDecrease={() => setZoom(zoom - 0.1)}
                  onIncrease={() => setZoom(zoom + 0.1)}
                />
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} onClick={resetView}>Reset</button>
              </div>
            </div>
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Overlays</span>
              <div className="skirmish-view-row">
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showMoves && 'active')} onClick={() => toggleOverlay('showMoves')} aria-pressed={showMoves}>Moves</button>
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showEnemyAttacks && 'active')} onClick={() => toggleOverlay('showEnemyAttacks')} aria-pressed={showEnemyAttacks}>Opp. attacks</button>
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showBlocked && 'active')} onClick={() => toggleOverlay('showBlocked')} aria-pressed={showBlocked}>Blocks</button>
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showPromotionZones && 'active')} onClick={() => toggleOverlay('showPromotionZones')} aria-pressed={showPromotionZones}>Promotion</button>
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showGrid && 'active')} onClick={() => toggleOverlay('showGrid')} aria-pressed={showGrid}>Grid</button>
              </div>
            </div>
            {onOpenPredrawnRegistration ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Pre-drawn plate</span>
                <div className="skirmish-view-row">
                  <button
                    type="button"
                    className="app-header-button app-header-button-active"
                    data-testid="open-predrawn-registration"
                    onClick={onOpenPredrawnRegistration}
                  >Pick corners</button>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {tab === 'controls' && (
          <section className="skirmish-card skirmish-controls-card" aria-label="Page controls">
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Shortcuts</span>
              <div className="skirmish-grid" role="group" aria-label="Match shortcut grid">
                {SHORTCUT_KEY_ROWS.flat().map((key) => {
                  const action = SHORTCUT_BINDINGS[key];
                  if (!action) {
                    return (
                      <span key={key} data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', 'is-empty')} aria-hidden="true">
                        <kbd className="skirmish-grid-cap">{key.toUpperCase()}</kbd>
                      </span>
                    );
                  }
                  const isToggle = action.kind === 'toggle';
                  const active = isToggle ? flagValue[action.flag] : false;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-chrome-unit="inner-text-button"
                      data-testid={`shortcut-${key}`}
                      className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', active && 'active is-active')}
                      aria-pressed={isToggle ? active : undefined}
                      title={action.hint}
                      onClick={() => { runSkirmishShortcut(key); }}
                    >
                      <kbd className="skirmish-grid-cap">{key.toUpperCase()}</kbd>
                      <span className="skirmish-grid-label">{action.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="skirmish-grid-hint">Keys work any time during the match.</p>
            </div>
            {/* Battle clock: skirmish profiles edit the saved preference; editor/test boards edit
                the next attempt directly so the + button uses exactly what's visible here. */}
            {showClockControl && canStartNewSkirmish && !net ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Battle clock</span>
                <SkirmishClockControl
                  timedHint={onClockControlChange ? 'Applies on your next New attempt.' : 'Applies on your next New skirmish.'}
                  value={clockControlValue}
                  onChange={onClockControlChange}
                />
              </div>
            ) : null}
            {/* Test Board only: floor the CPU's think time so there's room to build a premove chain.
                The player's clock is already paused across the reply, so this is a free softball. */}
            {testMode ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Min CPU delay (test board)</span>
                <div className="skirmish-clock-row skirmish-cpu-delay-field">
                  <span>Delay floor</span>
                  <Stepper
                    suffix="s"
                    decreaseLabel="Shorter minimum CPU delay"
                    increaseLabel="Longer minimum CPU delay"
                    onDecrease={() => setTestMinCpuDelay(Math.max(0, testMinCpuDelayMs - 500))}
                    onIncrease={() => setTestMinCpuDelay(testMinCpuDelayMs + 500)}
                    edit={{
                      value: testMinCpuDelayMs,
                      min: 0,
                      format: fmtDelaySeconds,
                      parse: parseDelaySeconds,
                      onCommit: setTestMinCpuDelay,
                      ariaLabel: 'Minimum CPU delay in seconds',
                    }}
                  />
                </div>
                <p className="skirmish-grid-hint">Type any floor for the CPU's think time — it widens the window to premove. Your clock is paused during it anyway.</p>
              </div>
            ) : null}
            <div className="skirmish-view-group">
              {/* Battle lifecycle: leave a test loop, restart THIS scenario (↻), start a fresh
                  attempt (＋), or concede the current board. */}
              <span className="skirmish-eyebrow">Scenario</span>
              <div className="skirmish-view-row">
                {returnHref && !net ? (
                  <NavButton
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-return-button')}
                    data-chrome-unit="inner-text-button"
                    data-testid="skirmish-return-scenario"
                    aria-label={returnLabel}
                    title={returnLabel}
                    to={returnHref}
                  >
                    <BackGlyph className="skirmish-lifecycle-icon" />
                    <span>{returnLabel}</span>
                  </NavButton>
                ) : null}
                {onRestart && !net ? (
                  <button
                    type="button"
                    data-chrome-unit="inner-tool-square"
                    className={chromeUnitClassNames('inner-tool-square', 'app-header-button', 'skirmish-lifecycle-button')}
                    data-testid="restart-level"
                    aria-label={restartLabel}
                    title={restartLabel}
                    onClick={onRestart}
                  >
                    <RestartGlyph className="skirmish-lifecycle-icon" />
                  </button>
                ) : null}
                {/* "New skirmish" reseeds the local board, which would desync a shared
                    netplay match — offer it only in single-player. */}
                {canStartNewSkirmish && !net ? (
                  <button
                    type="button"
                    data-chrome-unit="inner-tool-square"
                    className={chromeUnitClassNames('inner-tool-square', 'app-header-button', 'skirmish-lifecycle-button')}
                    data-testid="new-skirmish"
                    aria-label={newSkirmishLabel}
                    title={newSkirmishLabel}
                    onClick={onNewSkirmish ?? (() => newSkirmish({ seed: Date.now() & 0x7fffffff, timeControl: loadSkirmishClockPref() }))}
                  >
                    <NewGlyph className="skirmish-lifecycle-icon" />
                  </button>
                ) : null}
                {/* Concede the current battle. In netplay this relays through the lobby; in
                    solo/test play it immediately ends the board as a defeat. */}
                {!game.winner && (!net || netInteractive) ? (
                  <button
                    type="button"
                    data-chrome-unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-resign-button', 'danger')}
                    data-testid="resign"
                    onClick={async () => {
                      const ok = await ask(net ? {
                        title: 'Resign the match?',
                        message: 'Your opponent is awarded the win. This can’t be undone.',
                        confirmLabel: 'Resign',
                        tone: 'danger',
                      } : {
                        title: 'Resign this board?',
                        message: 'This ends the attempt as a defeat. You can restart or start a new attempt afterward.',
                        confirmLabel: 'Resign',
                        tone: 'danger',
                      });
                      if (ok) {
                        if (net) resign();
                        else resignLocal();
                      }
                    }}
                  >
                    Resign
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
      </OuterChromeBox>
    </>
  );
}
