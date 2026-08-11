import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useSkirmish, useSkirmishStoreApi } from '../game/SkirmishStoreContext';
import { defaultSkirmishStore, type LogEntry, type SkirmishStore } from '../game/store';
import { useSkirmishView, useSkirmishViewStoreApi } from '../game/SkirmishViewStoreContext';
import type { SkirmishViewStore } from '../game/skirmishView';
import { livingPieces } from '../core/rules';
import { PIECE_LABEL, PIECE_MARK, isPlayablePieceType, paletteForSide, pieceSpritePath } from '../core/pieces';
import { usePlayerPalette } from '../settings/playerPalette';
import type { Piece, PieceType, Side } from '../core/types';
import { promotionArrivalPieces } from '../game/promotionPresentation';
import type { TimeControl } from '../core/level';
// One shared "unit portrait box" (master render + crop + the fill-frame) — the Selected-Unit
// portrait AND the roster slots both render through it, so framing/fill/crop are defined once and
// never re-derived per surface. See docs/portrait-contract.md.
import { UnitPortrait, type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
import { installedPortraitCrops } from './portraitCrops';
import { runtimePortraitMasterSrc } from './portraitCandidates';
import { useConfirm } from './shared/ConfirmDialog';
import { BackGlyph, RestartGlyph, NewGlyph } from './shared/actionGlyphs';
import { SkirmishClockControl } from './SkirmishClockControl';
import { loadSkirmishClockPref } from '../game/skirmishClockPref';
import { Stepper } from './shared/Stepper';
import { MoveReviewControls } from './shared/MoveReviewControls';
import { moveNumberFor, reviewIndexForLoggedPly } from '../game/moveReview';
import { clientSide, clientSideLabel, clientSideOrder, clientSideRelation, clientTurnLabel, type PlayingSide } from '../game/clientPerspective';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, ShellControlsPanel } from './shared/ChromeBox';
import { useAuthSession } from '../net/authSession';
import { AdminControls } from './AdminControls';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';
import { CHROME_LEAF_FILL_SURFACE, leafSurfacePhase } from './shared/chromeSurfacePolicy';
import { StrategikonTitleNavigation } from './StrategikonTitleNavigation';
import { RunBattleUndoButton } from './RunBattleUndoButton';
import { RunBattleRetryButton } from './RunBattleRetryButton';
import { RunDeploymentRerollButton } from './RunDeploymentRerollButton';

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

type HudTab = 'unit' | 'roster' | 'log' | 'view' | 'controls' | 'admin';

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
  | { kind: 'deselect'; label: string; hint: string }
  | { kind: 'clear-overlays'; label: string; hint: string };

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
  t: { kind: 'clear-overlays', label: 'Clear all', hint: 'Turn off all board overlays' },
  a: { kind: 'toggle', flag: 'showPlayerAttacks', label: 'Your attacks', hint: 'Show all friendly attack squares' },
  s: { kind: 'toggle', flag: 'showPlayerMoves', label: 'Your moves', hint: 'Show all friendly legal-move squares' },
  d: { kind: 'toggle', flag: 'showPromotionZones', label: 'Promotion zones', hint: 'View pawn promotion zones' },
  z: { kind: 'zoom', dir: 1, label: 'Zoom in', hint: 'Zoom the board in' },
  x: { kind: 'zoom', dir: -1, label: 'Zoom out', hint: 'Zoom the board out' },
};

const ZOOM_STEP = 0.1;

/**
 * Move review's keyboard: the arrows every chess site walks a game with, plus Escape to drop
 * back to the live board. Separate from the command card above because that card is a grid of
 * letters mapped to physical key POSITIONS — the arrows are not part of it, and reading a game
 * back is not an overlay toggle.
 *
 * Returns true when the key was claimed. Escape is claimed only while a review is actually
 * open, so it keeps meaning whatever else it means the rest of the time.
 */
export function runMoveReviewKey(key: string, skirmishStore: SkirmishStore = defaultSkirmishStore): boolean {
  const state = skirmishStore.getState();
  if (key === 'ArrowLeft') { state.stepReview(-1); return true; }
  if (key === 'ArrowRight') { state.stepReview(1); return true; }
  if (key === 'ArrowUp' || key === 'Home') { state.reviewPosition(0); return true; }
  if (key === 'ArrowDown' || key === 'End') { state.reviewPosition(null); return true; }
  if (key === 'Escape' && state.reviewIndex !== null) { state.reviewPosition(null); return true; }
  return false;
}

/** Run the command card action for a physical key or painted button. */
export function runSkirmishShortcut(
  key: string,
  repeat = false,
  viewStore: SkirmishViewStore,
  skirmishStore: SkirmishStore = defaultSkirmishStore,
): boolean {
  const action = SHORTCUT_BINDINGS[key.toLowerCase()];
  if (!action || (repeat && action.kind !== 'zoom')) return false;
  if (action.kind === 'toggle') {
    viewStore.getState().toggle(action.flag);
  } else if (action.kind === 'zoom') {
    const view = viewStore.getState();
    view.setZoom(view.zoom + action.dir * ZOOM_STEP);
  } else if (action.kind === 'deselect') {
    skirmishStore.getState().select(null);
  } else {
    viewStore.getState().clearOverlays();
  }
  return true;
}

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

/**
 * The score sheet's move number for one Event Log row: `12.` for the half-move that
 * opens a full move and `12…` for the reply, which is how a score sheet says whose move
 * it was without a second column. Rows that are not moves (the briefing, an
 * adjudication) carry no number and leave the column empty.
 */
export function moveNumberLabel(entry: LogEntry): string {
  if (entry.ply === undefined) return '';
  return moveNumberFor(entry.ply);
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

/**
 * The HUD section a `?hud=` link asks for. Admin is deliberately not addressable — it
 * appears only for an authenticated admin and the panel already routes away from it.
 * An unknown or absent value opens the default Unit card.
 */
export function hudTabFromRoute(value: string | null | undefined): HudTab {
  return HUD_TABS.some((t) => t.id === value) ? value as HudTab : 'unit';
}

export type SkirmishHudProps = {
  className?: string;
  style?: CSSProperties;
  /** Audit/embedded surfaces can retain tab interaction without installing match-wide shortcuts. */
  enableGlobalShortcuts?: boolean;
  /** Show the (+) button for authored non-campaign or single-player test/attempt loops. */
  canStartNewSkirmish?: boolean;
  /** Run Battles use Retry and Abandon Run instead of manufacturing a resigned defeat. */
  canResign?: boolean;
  /** In-place restart of the CURRENT authored battle. Non-null only
   *  in single-player; shown as the ↻ Restart button. Same action as the title-bar diamond. */
  onRestart?: (() => void) | null;
  /** Accessible name for the Restart button (e.g. "Restart level" / "Restart skirmish"). */
  restartLabel?: string;
  /** Run-only paid retry. Omitted for free Campaign, playtest, and skirmish restarts. */
  restartCostTenths?: number;
  restartDisabled?: boolean;
  restartUnavailableReason?: string;
  /** Run-only transition back through the complete placement phase. */
  onRerollDeployment?: (() => void) | null;
  canRerollDeployment?: boolean;
  deploymentRerollCostTenths?: number;
  deploymentRerollDeparting?: boolean;
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
  /** Permanently end the active Run. RunScreen owns confirmation and persistence. */
  onAbandonRun?: (() => void) | null;
  /** Battle-context reference workspace. The route owns whether it is open. */
  strategikonPath?: string | null;
  strategikonSearch?: string;
  /** Switches the Run's primary Battle and self-inspection workspaces without unmounting Battle. */
  /** Between-Battle phases replace only the existing panel's contents. */
  controlsContent?: ReactNode;
  /** Which HUD section the panel opens on, so a link can land on the one being reviewed
   *  (the score sheet in the Event Log, say) instead of the default Unit card. */
  initialTab?: HudTab;
};

export function SkirmishHud({
  className = '',
  style,
  enableGlobalShortcuts = true,
  canStartNewSkirmish = true,
  canResign = true,
  onRestart = null,
  restartLabel = 'Restart',
  restartCostTenths,
  restartDisabled = false,
  restartUnavailableReason,
  onRerollDeployment = null,
  canRerollDeployment = false,
  deploymentRerollCostTenths,
  deploymentRerollDeparting = false,
  onNewSkirmish = null,
  newSkirmishLabel = 'New skirmish',
  showClockControl = true,
  clockControlValue,
  onClockControlChange,
  returnHref = null,
  returnLabel = 'Back',
  netInteractive = true,
  onOpenPredrawnRegistration = null,
  onAbandonRun = null,
  strategikonPath = null,
  strategikonSearch = '',
  controlsContent,
  initialTab = 'unit',
}: SkirmishHudProps = {}) {
  const skirmishStore = useSkirmishStoreApi();
  const skirmishViewStore = useSkirmishViewStoreApi();
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const focusedId = useSkirmish((s) => s.focusedId);
  const log = useSkirmish((s) => s.log);
  const positions = useSkirmish((s) => s.positions);
  const reviewIndex = useSkirmish((s) => s.reviewIndex);
  const reviewPosition = useSkirmish((s) => s.reviewPosition);
  const net = useSkirmish((s) => s.net);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const resign = useSkirmish((s) => s.resign);
  const resignLocal = useSkirmish((s) => s.resignLocal);
  const pendingPromotion = useSkirmish((s) => s.pendingPromotion);
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const testMode = useSkirmish((s) => s.testMode);
  const testMinCpuDelayMs = useSkirmish((s) => s.testMinCpuDelayMs);
  const setTestMinCpuDelay = useSkirmish((s) => s.setTestMinCpuDelay);
  // The roster sprites and portraits below resolve through `paletteForSide`, which reads the chosen
  // player color from module state. Subscribing here is what repaints them when it changes.
  usePlayerPalette();

  // Resign is irreversible and hands the opponent the win — gate it behind a confirm
  // (the kit-framed one, not window.confirm, so it stays in-world). Netplay relays it
  // to the server; solo/test boards end locally as a defeat.
  const { ask, dialog } = useConfirm();

  const [tab, setTab] = useState<HudTab>(initialTab);
  const authStatus = useAuthSession((session) => session.status);
  const adminAuth = {
    ready: authStatus?.reachable === true,
    isAdmin: authStatus?.reachable === true && authStatus.user.is_admin === true,
  };

  useEffect(() => {
    if (tab === 'admin' && adminAuth.ready && !adminAuth.isAdmin) setTab('controls');
  }, [adminAuth.isAdmin, adminAuth.ready, tab]);

  const portraitCrops = installedPortraitCrops();

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
      // Review first: holding an arrow scrubs the score sheet, so unlike the command card
      // its keys deliberately accept auto-repeat.
      if (runMoveReviewKey(e.key, skirmishStore)) { e.preventDefault(); return; }
      if (!runSkirmishShortcut(e.key, e.repeat, skirmishViewStore, skirmishStore)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableGlobalShortcuts, skirmishStore, skirmishViewStore]);

  // Status reads from THIS client's seat. Single-player: 'you' = 'player'. Netplay:
  // 'you' = the lobby seat this client controls (host='player', guest='enemy'), so the
  // guest sees "Victory" when the 'enemy' side wins and "Your turn" on the enemy turn.
  const localSide = clientSide(net);
  // Only a promotion that is MID-COMMIT has a Pawn standing somewhere the board state does not
  // say it is. A queue-time question (ADR-0541) is about a premove, which has moved nothing.
  const presentedPieces = pendingPromotion && pendingPromotion.mode !== 'premove-queue'
    ? promotionArrivalPieces(game, pendingPromotion.pieceId, pendingPromotion.move)
    : game.pieces;
  const rosterRows = clientSideOrder(localSide).map((side) => ({ side, pieces: livingPieces(presentedPieces, side) }));
  const selected = presentedPieces.find((piece) => piece.id === selectedId && piece.alive) ?? null;
  const focused = presentedPieces.find((piece) => piece.id === focusedId && piece.alive) ?? selected;
  const logLines: LogEntry[] = log.length ? log : [{ text: 'Skirmish begins.' }];
  const turnLabel = clientTurnLabel(game, localSide, !!net?.pendingMove);
  const strategikonNavigation = strategikonPath
    ? <StrategikonTitleNavigation path={strategikonPath} search={strategikonSearch} />
    : null;

  return (
    <>
      {/* Portals to <body>; render anywhere. Only visible while a resign confirm is open. */}
      {dialog}
      <ShellControlsPanel
        data-testid="skirmish-hud"
        className={className}
        style={style}
        aria-label="Skirmish command HUD"
        titleActions={strategikonNavigation}
        titleClassName="skirmish-hud-titlebar"
        titleContent={controlsContent === undefined ? (
          <div
            className="skirmish-hud-tabs"
            role="tablist"
            aria-label="HUD sections"
            data-transition-policy="immediate-local"
          >
            {HUD_TABS.map((t, index) => (
              <ChromeButton unit="inner-text-button"
                key={t.id}
                role="tab"
                id={`skirmish-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`skirmish-panel-${t.id}`}
                className={chromeUnitClassNames('inner-text-button', 'skirmish-hud-tab', tab === t.id && 'active')}
                aria-label={t.label}
                title={t.label}
                style={leafSurfacePhase(index)}
                onClick={() => setTab(t.id)}
              >
                <span className={`skirmish-tab-icon skirmish-tab-icon-${t.id}`} aria-hidden="true" />
              </ChromeButton>
            ))}
          </div>
        ) : null}
      >

        {controlsContent === undefined ? (
          <>
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

      <div
        className="skirmish-hud-panel"
        role="tabpanel"
        id={`skirmish-panel-${tab}`}
        aria-labelledby={tab === 'admin' ? undefined : `skirmish-tab-${tab}`}
        aria-label={tab === 'admin' ? 'Admin Controls' : undefined}
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
                  className="unit-portrait--hud"
                  masterUrl={runtimePortraitMasterSrc(
                    focused.type as PortraitPiece,
                    paletteForSide(focused.side, focused.palette) as PortraitPalette,
                  )}
                />
              ) : (
                // No unit selected, so there is no portrait scene to stand in: the seat is a
                // terminal identity plate and wears the leaf material rather than reading as an
                // unpainted hole beside the portraits it alternates with (ADR-0433).
                <InnerChromeBox className="unit-portrait unit-portrait--hud"
                  fillSurface={CHROME_LEAF_FILL_SURFACE}
                  style={{ display: 'grid', placeItems: 'center' }}
                >
                  <UnitBadge piece={focused} large />
                </InnerChromeBox>
              )}
              <div className="skirmish-selected-copy">
                <strong data-testid="selected-name">{focused ? focused.name ?? TYPE_LABEL[focused.type] : 'None'}</strong>
                <span>{focused ? `${TYPE_LABEL[focused.type]} · ${skirmishUnitOwnerLabel(focused.side, localSide)} - ${ROLE[focused.type]}` : 'Choose a unit on the board.'}</span>
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
                      aria-label={`${clientSideLabel(piece.side, localSide)} ${piece.name ? `${piece.name}, ` : ''}${TYPE_LABEL[piece.type]}`}
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
            {/* The score sheet is also the way back through the game, so its transport sits
                with it: the same first/back/forward/live row the battlefield plate carries. */}
            <MoveReviewControls variant="panel" />
            <ul>
              {logLines.map((entry, i) => {
                const seat = entry.ply === undefined ? null : reviewIndexForLoggedPly(positions, entry.ply);
                const showing = seat !== null && seat === reviewIndex;
                const className = `${entry.side ? `is-move is-${entry.side}` : 'is-note'}${showing ? ' is-showing' : ''}`;
                return (
                  <li key={`${entry.text}-${entry.ply ?? 'note'}-${i}`} className={className}>
                    <span aria-hidden="true" />
                    {/* A row whose board this match recorded is a place you can go: pressing it
                        shows that position. Prose rows, and moves from a match resumed without a
                        history, stay plain text — there is nothing to show. */}
                    {seat === null ? (
                      <>
                        <strong>{moveNumberLabel(entry)}</strong>
                        <em>{entry.text}</em>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="skirmish-log-move"
                        aria-current={showing ? 'true' : undefined}
                        onClick={() => reviewPosition(seat)}
                      >
                        <strong>{moveNumberLabel(entry)}</strong>
                        <em>{entry.text}</em>
                      </button>
                    )}
                  </li>
                );
              })}
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
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} onClick={resetView}>Reset</ChromeButton>
              </div>
            </div>
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Overlays</span>
              <div className="skirmish-view-row">
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showMoves && 'active')} style={leafSurfacePhase(0)} onClick={() => toggleOverlay('showMoves')} aria-pressed={showMoves}>Moves</ChromeButton>
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showEnemyAttacks && 'active')} style={leafSurfacePhase(1)} onClick={() => toggleOverlay('showEnemyAttacks')} aria-pressed={showEnemyAttacks}>Opp. attacks</ChromeButton>
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showBlocked && 'active')} style={leafSurfacePhase(2)} onClick={() => toggleOverlay('showBlocked')} aria-pressed={showBlocked}>Blocks</ChromeButton>
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showPromotionZones && 'active')} style={leafSurfacePhase(3)} onClick={() => toggleOverlay('showPromotionZones')} aria-pressed={showPromotionZones}>Promotion</ChromeButton>
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', showGrid && 'active')} style={leafSurfacePhase(4)} onClick={() => toggleOverlay('showGrid')} aria-pressed={showGrid}>Grid</ChromeButton>
              </div>
            </div>
            {onOpenPredrawnRegistration ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Pre-drawn plate</span>
                <div className="skirmish-view-row">
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                    data-testid="open-predrawn-registration"
                    onClick={onOpenPredrawnRegistration}
                  >Pick corners</ChromeButton>
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
                {SHORTCUT_KEY_ROWS.flat().map((key, index) => {
                  const action = SHORTCUT_BINDINGS[key];
                  // The command card is one repeated leaf collection, so its wood phases by
                  // the key's own place in the authored grid (ADR-0433) rather than stamping
                  // fifteen identical planks.
                  const surfacePhase = leafSurfacePhase(index);
                  if (!action) {
                    return (
                      <span key={key} data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', 'is-empty')} style={surfacePhase} aria-hidden="true">
                        <kbd className="skirmish-grid-cap">{key.toUpperCase()}</kbd>
                      </span>
                    );
                  }
                  const isToggle = action.kind === 'toggle';
                  const active = isToggle ? flagValue[action.flag] : false;
                  return (
                    <ChromeButton unit="inner-text-button"
                      key={key}
                      data-testid={`shortcut-${key}`}
                      className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', active && 'active is-active')}
                      style={surfacePhase}
                      aria-pressed={isToggle ? active : undefined}
                      title={action.hint}
                      onClick={() => { runSkirmishShortcut(key, false, skirmishViewStore, skirmishStore); }}
                    >
                      <kbd className="skirmish-grid-cap">{key.toUpperCase()}</kbd>
                      <span className="skirmish-grid-label">{action.label}</span>
                    </ChromeButton>
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
            {onRerollDeployment && deploymentRerollCostTenths !== undefined ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Deployment</span>
                <div className="skirmish-view-row">
                  <RunDeploymentRerollButton
                    testId="reroll-deployment-battle"
                    costTenths={deploymentRerollCostTenths}
                    canReroll={canRerollDeployment}
                    onReroll={onRerollDeployment}
                    departing={deploymentRerollDeparting}
                  />
                </div>
                <p className="skirmish-grid-hint">Return to Deployment and redo every unit placement.</p>
              </div>
            ) : null}
            <div className="skirmish-view-group">
              {/* Battle lifecycle: leave a test loop, restart THIS scenario (↻), start a fresh
                  attempt (＋), or concede the current board. */}
              <span className="skirmish-eyebrow">Scenario</span>
              <div className="skirmish-view-row">
                {game.winner !== 'player' && game.winner !== 'enemy'
                  ? <RunBattleUndoButton testId="undo-run-move" />
                  : null}
                {returnHref && !net ? (
                  <ChromeNavButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-return-button')}
                    data-testid="skirmish-return-scenario"
                    aria-label={returnLabel}
                    title={returnLabel}
                    to={returnHref}
                  >
                    <BackGlyph className="skirmish-lifecycle-icon" />
                    <span>{returnLabel}</span>
                  </ChromeNavButton>
                ) : null}
                {onRestart && !net && restartCostTenths !== undefined ? (
                  <RunBattleRetryButton
                    testId="restart-level"
                    costTenths={restartCostTenths}
                    canRetry={!restartDisabled}
                    onRetry={onRestart}
                    unavailableReason={restartUnavailableReason}
                  />
                ) : onRestart && !net ? (
                  <ChromeButton unit="inner-tool-square"
                    className={chromeUnitClassNames('inner-tool-square', 'app-header-button', 'skirmish-lifecycle-button')}
                    data-testid="restart-level"
                    aria-label={restartLabel}
                    title={restartLabel}
                    onClick={onRestart}
                  >
                    <RestartGlyph className="skirmish-lifecycle-icon" />
                  </ChromeButton>
                ) : null}
                {/* "New skirmish" reseeds the local board, which would desync a shared
                    netplay match — offer it only in single-player. */}
                {canStartNewSkirmish && !net ? (
                  <ChromeButton unit="inner-tool-square"
                    className={chromeUnitClassNames('inner-tool-square', 'app-header-button', 'skirmish-lifecycle-button')}
                    data-testid="new-skirmish"
                    aria-label={newSkirmishLabel}
                    title={newSkirmishLabel}
                    onClick={onNewSkirmish ?? (() => newSkirmish({ seed: Date.now() & 0x7fffffff, timeControl: loadSkirmishClockPref() }))}
                  >
                    <NewGlyph className="skirmish-lifecycle-icon" />
                  </ChromeButton>
                ) : null}
                {/* Concede the current battle. In netplay this relays through the lobby; in
                    solo/test play it immediately ends the board as a defeat. */}
                {canResign && !game.winner && (!net || netInteractive) ? (
                  <ChromeButton unit="inner-text-button"
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
                  </ChromeButton>
                ) : null}
              </div>
            </div>
            {onAbandonRun && !net ? (
              <>
                <div className="skirmish-view-group">
                  <span className="skirmish-eyebrow">Run</span>
                  <div className="run-meta-navigation">
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
                    data-testid="abandon-run"
                    onClick={onAbandonRun}
                  >
                    Abandon Run
                  </ChromeButton>
                  </div>
                </div>
              </>
            ) : null}
            {adminAuth.isAdmin && !net ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Administration</span>
                <div className="skirmish-view-row">
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                    data-testid="open-battle-admin-controls"
                    onClick={() => setTab('admin')}
                  >
                    Admin Controls
                  </ChromeButton>
                </div>
              </div>
            ) : null}
          </section>
        )}
        {tab === 'admin' && (
          <section className="skirmish-card skirmish-admin-panel" aria-label="Administrator playtest controls">
            <div className="skirmish-admin-panel-head">
              <h2>Admin Controls</h2>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                data-testid="close-battle-admin-controls"
                onClick={() => setTab('controls')}
              >
                Back
              </ChromeButton>
            </div>
            <AdminControls
              authReady={adminAuth.ready}
              isAdmin={adminAuth.isAdmin}
              presentation="battle"
              onBattleArmed={() => setTab('unit')}
            />
          </section>
        )}
      </div>
          </>
        ) : controlsContent}
      </ShellControlsPanel>
    </>
  );
}
