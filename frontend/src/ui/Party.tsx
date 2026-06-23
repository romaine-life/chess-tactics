import { useState } from 'react';
import { PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';

const OPTIONS = PLAYABLE_PIECE_TYPES.filter((piece) => piece !== 'pawn');

function PieceIcon({ type }: { type: PlayablePieceType }) {
  return <span className={`utility-piece-icon icon-${type}`} aria-hidden="true" />;
}

// Squad picker (ported from legacy app.js): pawn is locked; choose two more
// pieces, then deploy into a skirmish.
export function Party() {
  const [picks, setPicks] = useState<PlayablePieceType[]>([]);
  const toggle = (p: PlayablePieceType) => setPicks((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : cur.length < 2 ? [...cur, p] : cur);
  return (
    <div data-testid="party" className="utility-screen utility-party">
      <header className="utility-page-header">
        <span className="utility-header-icon icon-pawn" aria-hidden="true" />
        <div className="utility-title-copy">
          <h1>Assemble your squad</h1>
          <p>Pawn is locked in. Choose two more ({picks.length}/2).</p>
        </div>
        <a href="/" className="utility-button utility-button-neutral">Menu</a>
      </header>
      <section className="utility-panel">
        <div className="utility-squad-grid">
          <span className="utility-squad-card is-selected is-locked">
            <PieceIcon type="pawn" />
            <strong>Pawn</strong>
            <small>Locked</small>
          </span>
        {OPTIONS.map((p) => (
          <button key={p} type="button" data-testid={`party-${p}`} className={`utility-squad-card ${picks.includes(p) ? 'is-selected' : ''}`.trim()} onClick={() => toggle(p)}>
            <PieceIcon type={p} />
            <strong>{p}</strong>
            <small>{picks.includes(p) ? 'Selected' : 'Available'}</small>
          </button>
        ))}
        </div>
      </section>
      <div className="utility-actions">
        <a
          href="/play"
          data-testid="party-deploy"
          aria-disabled={picks.length !== 2}
          className={`utility-button utility-button-primary ${picks.length === 2 ? '' : 'is-disabled'}`.trim()}
        >Deploy</a>
        <a href="/" className="utility-button utility-button-neutral">Menu</a>
      </div>
    </div>
  );
}
