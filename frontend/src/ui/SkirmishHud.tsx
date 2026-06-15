import type { CSSProperties } from 'react';
import { useSkirmish } from '../game/store';
import { livingPieces } from '../core/rules';
import type { Piece } from '../core/types';

const TYPE_LABEL: Record<string, string> = { pawn: 'Pawn', knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen', rock: 'Rock', 'random-rock': 'Rock' };
const ROLE: Record<string, string> = { pawn: 'Forward footman', knight: 'L-shaped jumper', bishop: 'Diagonal runner', rook: 'Straight-line tower', queen: 'Promoted raider', rock: 'Impassable obstacle' };

const panel: CSSProperties = { background: 'var(--ds-surface)', border: '1px solid var(--ds-line)', borderRadius: 'var(--ds-radius-md)', padding: '12px 14px' };
const eyebrow: CSSProperties = { fontSize: 'var(--ds-text-xs)', letterSpacing: '.08em', color: 'var(--ds-ink-3)', textTransform: 'uppercase' };
const btn: CSSProperties = { flex: 1, background: 'var(--ds-accent-soft)', color: 'var(--ds-ink)', border: '1px solid var(--ds-line-2)', borderRadius: 'var(--ds-radius-sm)', padding: '8px 10px', cursor: 'pointer', fontSize: 'var(--ds-text-sm)' };

export function SkirmishHud() {
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const log = useSkirmish((s) => s.log);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const endTurn = useSkirmish((s) => s.endTurn);

  const sel: Piece | null = game.pieces.find((p) => p.id === selectedId && p.alive) ?? null;
  const players = livingPieces(game.pieces, 'player').length;
  const enemies = livingPieces(game.pieces, 'enemy').length;
  const turnLabel = game.winner
    ? game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Your turn' : 'Enemy turn';

  return (
    <aside data-testid="skirmish-hud" style={{ width: 264, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: 'var(--ds-ink)' }} data-testid="turn-label">{turnLabel}</strong>
        <span style={{ fontSize: 'var(--ds-text-sm)' }}>You {players} · Foe {enemies}</span>
      </div>

      <div style={panel}>
        <div style={eyebrow}>Selected unit</div>
        {sel ? (
          <>
            <div style={{ color: 'var(--ds-ink)', fontSize: '1.05rem', marginTop: 4 }} data-testid="selected-name">{TYPE_LABEL[sel.type]}</div>
            <div style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-ink-3)' }}>{ROLE[sel.type]} · {sel.side}</div>
          </>
        ) : (
          <div style={{ color: 'var(--ds-ink-3)', marginTop: 4 }}>None</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="end-turn" onClick={() => endTurn()} disabled={game.turn !== 'player' || !!game.winner} style={btn}>End turn</button>
        <button type="button" data-testid="new-skirmish" onClick={() => newSkirmish({ seed: Date.now() & 0x7fffffff })} style={btn}>New skirmish</button>
      </div>

      <div style={panel}>
        <div style={eyebrow}>Legend</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 'var(--ds-text-sm)' }}>
          <span><i style={{ display: 'inline-block', width: 10, height: 10, background: '#ff7a3c', marginRight: 6, verticalAlign: 'middle' }} />Enemy reach</span>
          <span><i style={{ display: 'inline-block', width: 10, height: 10, background: '#49c6ff', marginRight: 6, verticalAlign: 'middle' }} />Your move</span>
        </div>
      </div>

      <div style={{ ...panel, flex: 1, minHeight: 120, overflowY: 'auto' }}>
        <div style={eyebrow}>Event log</div>
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 'var(--ds-text-sm)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.map((line, i) => <li key={i} style={{ color: 'var(--ds-ink-2)' }}>{line}</li>)}
        </ul>
      </div>
    </aside>
  );
}
