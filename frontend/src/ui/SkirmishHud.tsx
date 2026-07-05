import { useEffect, useState } from 'react';
import { useSkirmish } from '../game/store';
import { useSkirmishView } from '../game/skirmishView';
import { livingPieces } from '../core/rules';
import { PIECE_LABEL, PIECE_MARK, PALETTE_FOR_SIDE, isPlayablePieceType, pieceSpritePath } from '../core/pieces';
import type { Piece, PieceType, Side } from '../core/types';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
// One shared "unit portrait box" (master render + crop + the fill-frame) — the Selected-Unit
// portrait AND the roster slots both render through it, so framing/fill/crop are defined once and
// never re-derived per surface. See docs/portrait-contract.md.
import { UnitPortrait, loadCrops, STORAGE_KEY, type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
import { PRODUCTION_PORTRAIT_METHOD } from './portraitCandidates';
import { useConfirm } from './shared/ConfirmDialog';
import { RestartGlyph, NewGlyph } from './shared/actionGlyphs';
import { SkirmishClockControl } from './SkirmishClockControl';
import { loadSkirmishClockPref } from '../game/skirmishClockPref';

const TYPE_LABEL = PIECE_LABEL;

const ROLE: Record<PieceType, string> = {
  pawn: 'Forward footman',
  knight: 'L-shaped jumper',
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

type OverlayFlag = 'showEnemyAttacks' | 'showEnemyMoves' | 'showPlayerAttacks' | 'showPlayerMoves';

type GridAction =
  | { kind: 'toggle'; flag: OverlayFlag; label: string; hint: string }
  | { kind: 'zoom'; dir: 1 | -1; label: string; hint: string };

const SHORTCUT_KEY_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't'],
  ['a', 's', 'd', 'f', 'g'],
  ['z', 'x', 'c', 'v', 'b'],
];

const SHORTCUT_BINDINGS: Record<string, GridAction> = {
  q: { kind: 'toggle', flag: 'showEnemyAttacks', label: 'Opp. attacks', hint: 'Show all enemy attack squares (danger zone)' },
  w: { kind: 'toggle', flag: 'showEnemyMoves', label: 'Opp. moves', hint: 'Show all enemy legal-move squares' },
  a: { kind: 'toggle', flag: 'showPlayerAttacks', label: 'Your attacks', hint: 'Show all friendly attack squares' },
  s: { kind: 'toggle', flag: 'showPlayerMoves', label: 'Your moves', hint: 'Show all friendly legal-move squares' },
  z: { kind: 'zoom', dir: 1, label: 'Zoom in', hint: 'Zoom the board in' },
  x: { kind: 'zoom', dir: -1, label: 'Zoom out', hint: 'Zoom the board out' },
};

const ZOOM_STEP = 0.1;

function unitSprite(piece: Piece | null): string | null {
  if (!piece || piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  return pieceSpritePath(piece.type, PALETTE_FOR_SIDE[piece.side], piece.facing);
}

/** Whole numbers print bare; fractional distances print to one decimal (6.5). */
function fmtStat(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function hpText(piece: Piece | null): string {
  if (!piece) return '--';
  const hp = piece.hp ?? 1;
  const maxHp = piece.maxHp ?? hp;
  return `${hp} / ${maxHp}`;
}

function apText(piece: Piece | null): string {
  if (!piece) return '--';
  const ap = piece.ap ?? 1;
  const maxAp = piece.maxAp ?? ap;
  return `${ap} / ${maxAp}`;
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

function CountPip({ side, count }: { side: Side; count: number }) {
  return (
    <span className={`skirmish-count-pip ${side}`}>
      <span className={`skirmish-icon skirmish-icon-rook-${side === 'enemy' ? 'red' : 'blue'}`} aria-hidden="true" />
      <strong>{count}</strong>
    </span>
  );
}

type SkirmishHudProps = {
  /** Show the "New skirmish" (+) button — single-player free skirmish only. */
  canStartNewSkirmish?: boolean;
  /** In-place restart of the CURRENT battle (campaign level or free skirmish). Non-null only
   *  in single-player; shown as the ↻ Restart button. Same action as the title-bar diamond. */
  onRestart?: (() => void) | null;
  /** Accessible name for the Restart button (e.g. "Restart level" / "Restart skirmish"). */
  restartLabel?: string;
};

export function SkirmishHud({
  canStartNewSkirmish = true,
  onRestart = null,
  restartLabel = 'Restart',
}: SkirmishHudProps = {}) {
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const focusedId = useSkirmish((s) => s.focusedId);
  const log = useSkirmish((s) => s.log);
  const net = useSkirmish((s) => s.net);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const resign = useSkirmish((s) => s.resign);
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const testMode = useSkirmish((s) => s.testMode);
  const testMinCpuDelayMs = useSkirmish((s) => s.testMinCpuDelayMs);
  const setTestMinCpuDelay = useSkirmish((s) => s.setTestMinCpuDelay);
  // Free-text seconds for the Test Board CPU-delay floor: local so the field edits freely (clear
  // it, type a decimal) without the store's clamped ms value fighting the caret; committed on
  // change. Cleared when leaving test mode (the store zeroes the floor there too).
  const [delaySecInput, setDelaySecInput] = useState(() => (testMinCpuDelayMs ? String(testMinCpuDelayMs / 1000) : ''));
  useEffect(() => { if (!testMode) setDelaySecInput(''); }, [testMode]);

  // Resign is irreversible and hands the opponent the win — gate it behind a confirm
  // (the kit-framed one, not window.confirm, so it stays in-world). See ConfirmDialog.
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
  const zoom = useSkirmishView((s) => s.zoom);
  const toggleOverlay = useSkirmishView((s) => s.toggle);
  const setZoom = useSkirmishView((s) => s.setZoom);
  const resetView = useSkirmishView((s) => s.resetView);

  // Current state of each grid toggle, for the pressed/active look on the cards.
  const flagValue: Record<OverlayFlag, boolean> = {
    showEnemyAttacks, showEnemyMoves, showPlayerAttacks, showPlayerMoves,
  };

  // Global key handler — the grid keys work anywhere on the board, not just while the
  // Controls tab is open. Reads live view state via getState() so the listener never
  // goes stale (no re-binding per zoom change). Ignores typing fields and modifier
  // combos so it never steals browser/OS shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const action = SHORTCUT_BINDINGS[e.key.toLowerCase()];
      if (!action) return;
      const view = useSkirmishView.getState();
      if (action.kind === 'toggle') {
        if (e.repeat) return; // don't flip the layer repeatedly while the key is held
        view.toggle(action.flag);
      } else {
        view.setZoom(view.zoom + action.dir * ZOOM_STEP);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = game.pieces.find((p) => p.id === selectedId && p.alive) ?? null;
  const focused = game.pieces.find((p) => p.id === focusedId && p.alive) ?? selected;
  const playerPieces = livingPieces(game.pieces, 'player');
  const enemyPieces = livingPieces(game.pieces, 'enemy');
  const logLines = log.length ? log.slice(0, 16) : ['Skirmish begins — capture the enemy King.'];
  const focusedPortraitBackdrop = focused && isPlayablePieceType(focused.type) ? DEFAULT_BACKGROUND_SET.portraits[focused.type] : null;
  // Status reads from THIS client's seat. Single-player: 'you' = 'player'. Netplay:
  // 'you' = the lobby seat this client controls (host='player', guest='enemy'), so the
  // guest sees "Victory" when the 'enemy' side wins and "Your turn" on the enemy turn.
  const localSide: Side = net ? net.localSide : 'player';
  const opponentTurnLabel = net ? 'Opponent turn' : 'Enemy turn';
  const turnLabel = game.winner
    ? game.winner === 'draw' ? 'Stalemate' : game.winner === localSide ? 'Victory' : 'Defeat'
    : game.turn === localSide ? 'Your turn' : opponentTurnLabel;

  return (
    <aside data-testid="skirmish-hud" className="skirmish-hud" aria-label="Skirmish command HUD">
      {/* Portals to <body>; render anywhere. Only visible while a resign confirm is open. */}
      {dialog}
      <section className="skirmish-score-panel" aria-label="Turn summary">
        <div>
          <span className="skirmish-eyebrow">Status</span>
          <strong data-testid="turn-label">{turnLabel}</strong>
        </div>
        <div className="skirmish-counts" aria-label="Remaining forces">
          <CountPip side="player" count={playerPieces.length} />
          <CountPip side="enemy" count={enemyPieces.length} />
        </div>
      </section>

      <div className="skirmish-hud-tabs" role="tablist" aria-label="HUD sections">
        {HUD_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`skirmish-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`skirmish-panel-${t.id}`}
            className={`skirmish-hud-tab ${tab === t.id ? 'active' : ''}`.trim()}
            aria-label={t.label}
            title={t.label}
            onClick={() => setTab(t.id)}
          >
            <span className={`skirmish-tab-icon skirmish-tab-icon-${t.id}`} aria-hidden="true" />
          </button>
        ))}
      </div>

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
                  palette={PALETTE_FOR_SIDE[focused.side] as PortraitPalette}
                  crop={portraitCrops[focused.type as PortraitPiece]}
                  backdrop={focusedPortraitBackdrop}
                  className="unit-portrait--hud"
                  method={PRODUCTION_PORTRAIT_METHOD}
                />
              ) : (
                <div className="unit-portrait unit-portrait--hud" style={{ display: 'grid', placeItems: 'center' }}>
                  <UnitBadge piece={focused} large />
                </div>
              )}
              <div className="skirmish-selected-copy">
                <strong data-testid="selected-name">{focused ? TYPE_LABEL[focused.type] : 'None'}</strong>
                <span>{focused ? `${focused.side === 'enemy' ? 'Enemy' : focused.side === 'player' ? 'Blue' : 'Neutral'} - ${ROLE[focused.type]}` : 'Choose a unit on the board.'}</span>
                <dl>
                  <div>
                    <dt>HP</dt>
                    <dd><span>{hpText(focused)}</span></dd>
                  </div>
                  <div>
                    <dt>AP</dt>
                    <dd><span>{apText(focused)}</span></dd>
                  </div>
                </dl>
              </div>
            </div>
            {focused && (focused.side === 'player' || focused.side === 'enemy') && (
              <div className="skirmish-service-record">
                <h3>Service Record</h3>
                <dl>
                  <div><dt>Used</dt><dd>{focused.timesUsed ?? 0}</dd></div>
                  <div><dt>Dist</dt><dd>{fmtStat(focused.squaresTraveled ?? 0)}</dd></div>
                  <div><dt>Kills</dt><dd>{focused.enemiesKilled ?? 0}</dd></div>
                  <div><dt>Escapes</dt><dd>{focused.escapes ?? 0}</dd></div>
                  <div><dt>Threats</dt><dd>{focused.threatsMade ?? 0}</dd></div>
                </dl>
              </div>
            )}
          </section>
        )}

        {tab === 'roster' && (
          <section className="skirmish-card skirmish-roster-card" aria-label="Roster">
            <h2>Roster</h2>
            <div className="skirmish-roster-rows">
              {[playerPieces, enemyPieces].map((pieces, row) => (
                <div className="skirmish-roster-strip" key={row === 0 ? 'player' : 'enemy'}>
                  {pieces.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      className={`skirmish-roster-slot ${piece.id === focused?.id ? 'active' : ''}`.trim()}
                      onClick={() => piece.side === 'player' ? select(piece.id) : focus(piece.id)}
                      aria-label={`${piece.side} ${TYPE_LABEL[piece.type]}`}
                    >
                      {isPlayablePieceType(piece.type) ? (
                        <UnitPortrait
                          piece={piece.type as PortraitPiece}
                          palette={PALETTE_FOR_SIDE[piece.side] as PortraitPalette}
                          crop={portraitCrops[piece.type as PortraitPiece]}
                          className="unit-portrait--roster"
                          method={PRODUCTION_PORTRAIT_METHOD}
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
                <button type="button" className="app-header-button" onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">−</button>
                <span className="skirmish-zoom-readout">{Math.round(zoom * 100)}%</span>
                <button type="button" className="app-header-button" onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">+</button>
                <button type="button" className="app-header-button" onClick={resetView}>Reset</button>
              </div>
            </div>
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Overlays</span>
              <div className="skirmish-view-row">
                <button type="button" className={`app-header-button ${showMoves ? 'app-header-button-active' : ''}`.trim()} onClick={() => toggleOverlay('showMoves')} aria-pressed={showMoves}>Moves</button>
                <button type="button" className={`app-header-button ${showEnemyAttacks ? 'app-header-button-active' : ''}`.trim()} onClick={() => toggleOverlay('showEnemyAttacks')} aria-pressed={showEnemyAttacks}>Attacks</button>
                <button type="button" className={`app-header-button ${showBlocked ? 'app-header-button-active' : ''}`.trim()} onClick={() => toggleOverlay('showBlocked')} aria-pressed={showBlocked}>Blocks</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'controls' && (
          <section className="skirmish-card skirmish-controls-card" aria-label="Page controls">
            <h2>Controls</h2>
            <div className="skirmish-view-group">
              <span className="skirmish-eyebrow">Shortcuts</span>
              <div className="skirmish-grid" role="group" aria-label="Match shortcut grid">
                {SHORTCUT_KEY_ROWS.flat().map((key) => {
                  const action = SHORTCUT_BINDINGS[key];
                  if (!action) {
                    return (
                      <span key={key} className="app-header-button skirmish-grid-key is-empty" aria-hidden="true">
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
                      data-testid={`shortcut-${key}`}
                      className={`app-header-button skirmish-grid-key ${active ? 'app-header-button-active is-active' : ''}`.trim()}
                      aria-pressed={isToggle ? active : undefined}
                      title={action.hint}
                      onClick={() => {
                        if (action.kind === 'toggle') toggleOverlay(action.flag);
                        else setZoom(zoom + action.dir * ZOOM_STEP);
                      }}
                    >
                      <kbd className="skirmish-grid-cap">{key.toUpperCase()}</kbd>
                      <span className="skirmish-grid-label">{action.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="skirmish-grid-hint">Keys work any time during the match.</p>
            </div>
            {/* Battle clock for a random skirmish. Free-play only — a campaign level and a
                netplay match carry their own time control, so the picker is hidden there
                (same gate as the "New skirmish" button it feeds). */}
            {canStartNewSkirmish && !net ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Battle clock</span>
                <SkirmishClockControl timedHint="Applies on your next New skirmish." />
              </div>
            ) : null}
            {/* Test Board only: floor the CPU's think time so there's room to build a premove chain.
                The player's clock is already paused across the reply, so this is a free softball. */}
            {testMode ? (
              <div className="skirmish-view-group">
                <span className="skirmish-eyebrow">Min CPU delay (test board)</span>
                <label className="skirmish-cpu-delay-field">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    placeholder="0"
                    value={delaySecInput}
                    aria-label="Minimum CPU delay in seconds"
                    onChange={(event) => {
                      setDelaySecInput(event.target.value);
                      const secs = parseFloat(event.target.value);
                      setTestMinCpuDelay(Number.isFinite(secs) && secs > 0 ? secs * 1000 : 0);
                    }}
                  />
                  <span>seconds</span>
                </label>
                <p className="skirmish-grid-hint">Type any floor for the CPU's think time — it widens the window to premove. Your clock is paused during it anyway.</p>
              </div>
            ) : null}
            <div className="skirmish-view-group">
              {/* Battle lifecycle: restart THIS scenario (↻) or start a fresh one (＋). Both are
                  icon-only — the group heading names them and the marks are self-evident, so no
                  per-button tooltip. Netplay shows Resign here instead (a shared board can't be
                  locally reset/reseeded without desyncing). */}
              <span className="skirmish-eyebrow">Scenario</span>
              <div className="skirmish-view-row">
                {onRestart && !net ? (
                  <button
                    type="button"
                    className="app-header-button skirmish-lifecycle-button"
                    data-testid="restart-level"
                    aria-label={restartLabel}
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
                    className="app-header-button skirmish-lifecycle-button"
                    data-testid="new-skirmish"
                    aria-label="New skirmish"
                    onClick={() => newSkirmish({ seed: Date.now() & 0x7fffffff, timeControl: loadSkirmishClockPref() })}
                  >
                    <NewGlyph className="skirmish-lifecycle-icon" />
                  </button>
                ) : null}
                {/* Concede a live multiplayer match (hands the opponent the win). Hidden
                    once the game is decided and in single-player (there's no opponent to
                    concede to — you'd just start a new skirmish). */}
                {net && !game.winner ? (
                  <button
                    type="button"
                    className="app-header-button skirmish-resign-button"
                    data-testid="resign"
                    onClick={async () => {
                      const ok = await ask({
                        title: 'Resign the match?',
                        message: 'Your opponent is awarded the win. This can’t be undone.',
                        confirmLabel: 'Resign',
                        tone: 'danger',
                      });
                      if (ok) resign();
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
    </aside>
  );
}
