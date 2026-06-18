import { useSkirmish } from '../game/store';
import { enemyThreats, livingPieces } from '../core/rules';
import type { Piece, PieceType, Side } from '../core/types';

const TYPE_LABEL: Record<PieceType, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  rock: 'Rock',
  'random-rock': 'Rock',
};

const ROLE: Record<PieceType, string> = {
  pawn: 'Forward footman',
  knight: 'L-shaped jumper',
  bishop: 'Diagonal runner',
  rook: 'Straight-line tower',
  queen: 'Promoted raider',
  rock: 'Impassable obstacle',
  'random-rock': 'Impassable obstacle',
};

const MARK: Record<PieceType, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  rock: 'R',
  'random-rock': '?',
};

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
  return (
    <span className={`skirmish-unit-badge ${side} ${large ? 'large' : ''}`.trim()} aria-hidden="true">
      {label}
    </span>
  );
}

function StatBar({ value, max }: { value: number; max: number }) {
  const safeMax = Math.max(1, max);
  return (
    <span className="skirmish-stat-bar" aria-hidden="true">
      {Array.from({ length: safeMax }).map((_, i) => (
        <span key={i} className={i < value ? 'filled' : ''} />
      ))}
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

export function SkirmishHud() {
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const log = useSkirmish((s) => s.log);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const select = useSkirmish((s) => s.select);
  const movesForSelected = useSkirmish((s) => s.movesForSelected);
  const endTurn = useSkirmish((s) => s.endTurn);

  const selected = game.pieces.find((p) => p.id === selectedId && p.alive) ?? null;
  const moves = movesForSelected();
  const captures = moves.filter((move) => move.capture).length;
  const playerPieces = livingPieces(game.pieces, 'player');
  const enemyPieces = livingPieces(game.pieces, 'enemy');
  const threats = enemyThreats(game.pieces, game.size);
  const recentLog = log.length ? log.slice(0, 4) : ['Skirmish begins - move or capture; last side standing wins.'];
  const turnLabel = game.winner
    ? game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Your turn' : 'Enemy turn';

  return (
    <aside data-testid="skirmish-hud" className="skirmish-hud" aria-label="Skirmish command HUD">
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

      <section className="skirmish-card skirmish-selected-card" aria-label="Selected unit">
        <h2>Selected Unit</h2>
        <div className="skirmish-selected-body">
          <div className="skirmish-portrait-frame">
            <UnitBadge piece={selected} large />
          </div>
          <div className="skirmish-selected-copy">
            <strong data-testid="selected-name">{selected ? TYPE_LABEL[selected.type] : 'None'}</strong>
            <span>{selected ? ROLE[selected.type] : 'Choose a blue unit on the board.'}</span>
            <dl>
              <div>
                <dt>HP</dt>
                <dd>
                  <span>{hpText(selected)}</span>
                  <StatBar value={selected?.hp ?? 1} max={selected?.maxHp ?? selected?.hp ?? 1} />
                </dd>
              </div>
              <div>
                <dt>AP</dt>
                <dd>
                  <span>{apText(selected)}</span>
                  <StatBar value={selected?.ap ?? 1} max={selected?.maxAp ?? selected?.ap ?? 1} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="skirmish-card skirmish-actions-card" aria-label="Actions">
        <h2>Actions</h2>
        <div className="skirmish-actions">
          <button className="skirmish-action-button blue" type="button" disabled={!selected || moves.length === 0}>
            <span className="skirmish-icon skirmish-icon-move" aria-hidden="true" />
            <strong>Move</strong>
            <small>{moves.length} tiles</small>
          </button>
          <button className="skirmish-action-button red" type="button" disabled={!selected || captures === 0}>
            <span className="skirmish-icon skirmish-icon-power" aria-hidden="true" />
            <strong>Capture</strong>
            <small>{captures || 'No'} targets</small>
          </button>
          <button
            className="skirmish-action-button dark"
            data-testid="end-turn"
            type="button"
            onClick={() => endTurn()}
            disabled={game.turn !== 'player' || !!game.winner}
          >
            <span className="skirmish-icon skirmish-icon-hourglass" aria-hidden="true" />
            <strong>Wait</strong>
            <small>End turn</small>
          </button>
        </div>
      </section>

      <section className="skirmish-card skirmish-roster-card" aria-label="Roster">
        <h2>Roster</h2>
        <div className="skirmish-roster-rows">
          {[playerPieces, enemyPieces].map((pieces, row) => (
            <div className="skirmish-roster-strip" key={row === 0 ? 'player' : 'enemy'}>
              {pieces.map((piece) => (
                <button
                  key={piece.id}
                  type="button"
                  className={`skirmish-roster-slot ${piece.id === selectedId ? 'active' : ''}`.trim()}
                  onClick={() => piece.side === 'player' ? select(piece.id) : undefined}
                  disabled={piece.side !== 'player'}
                  aria-label={`${piece.side} ${TYPE_LABEL[piece.type]}`}
                >
                  <UnitBadge piece={piece} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="skirmish-card skirmish-threat-card" aria-label="Threats">
        <h2>Threats</h2>
        <ul>
          <li><span className="skirmish-icon skirmish-icon-power" aria-hidden="true" />Enemy reach <strong>{threats.length}</strong></li>
          <li><span className="skirmish-icon skirmish-icon-shield" aria-hidden="true" />Blue moves <strong>{moves.length}</strong></li>
          <li><span className="skirmish-icon skirmish-icon-crossed-swords" aria-hidden="true" />Captures <strong>{captures}</strong></li>
        </ul>
      </section>

      <section className="skirmish-card skirmish-log-card" aria-label="Event log">
        <h2>Event Log</h2>
        <ul>
          {recentLog.map((line, i) => (
            <li key={`${line}-${i}`}>
              <span aria-hidden="true" />
              <strong>T{Math.max(1, recentLog.length - i)}</strong>
              <em>{line}</em>
            </li>
          ))}
        </ul>
      </section>

      <div className="skirmish-bottom-actions">
        <button
          className="skirmish-end-turn"
          type="button"
          onClick={() => endTurn()}
          disabled={game.turn !== 'player' || !!game.winner}
        >
          End Turn
        </button>
        <button
          className="skirmish-new-run"
          data-testid="new-skirmish"
          type="button"
          onClick={() => newSkirmish({ seed: Date.now() & 0x7fffffff })}
        >
          New
        </button>
      </div>
    </aside>
  );
}
