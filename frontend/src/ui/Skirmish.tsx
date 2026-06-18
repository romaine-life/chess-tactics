import { useEffect } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { useSkirmish } from '../game/store';
import { livingPieces } from '../core/rules';

export function Skirmish() {
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const game = useSkirmish((s) => s.game);
  const selectedId = useSkirmish((s) => s.selectedId);
  const movesForSelected = useSkirmish((s) => s.movesForSelected);
  const playerPieces = livingPieces(game.pieces, 'player');
  const enemyPieces = livingPieces(game.pieces, 'enemy');
  const playerCaptured = game.pieces.filter((piece) => piece.side === 'player' && !piece.alive).length;
  const selected = game.pieces.find((piece) => piece.id === selectedId && piece.alive) ?? null;
  const moves = movesForSelected();
  const turnLabel = game.winner
    ? game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Player Turn' : 'Enemy Turn';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);

  useEffect(() => {
    newSkirmish({ seed: 1 });
  }, [newSkirmish]);

  return (
    <div data-testid="skirmish" className="skirmish-screen">
      <section className="skirmish-war-room" aria-label="Skirmish battlefield">
        <header className="skirmish-topbar" aria-label="Skirmish status">
          <div className="skirmish-brand">
            <span className="skirmish-icon skirmish-icon-rook-blue" aria-hidden="true" />
            <span>
              <strong>Chess Tactics</strong>
              <small>Skirmish Mode</small>
            </span>
          </div>
          <div className="skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>{game.winner ? 'Skirmish Complete' : 'Live Board'}</small>
          </div>
          <div className="skirmish-objective">
            <span className="skirmish-icon skirmish-icon-flag" aria-hidden="true" />
            <span>
              <strong>Objective</strong>
              <small>Capture the enemy King</small>
            </span>
          </div>
          <div className="skirmish-top-counts" aria-label="Remaining forces">
            <span><span className="skirmish-icon skirmish-icon-rook-blue" aria-hidden="true" />{playerPieces.length}</span>
            <span><span className="skirmish-icon skirmish-icon-rook-red" aria-hidden="true" />{enemyPieces.length}</span>
          </div>
          <nav className="skirmish-window-actions" aria-label="Skirmish navigation">
            <a className="skirmish-square-action" href="/" aria-label="Main menu">
              <span className="skirmish-icon skirmish-icon-menu" aria-hidden="true" />
            </a>
            <a className="skirmish-square-action" href="/settings" aria-label="Settings">
              <span className="skirmish-icon skirmish-icon-gear" aria-hidden="true" />
            </a>
          </nav>
        </header>

        <div className="skirmish-field">
          <aside className="skirmish-left-panel skirmish-legion-panel" aria-label="Blue legion summary">
            <h2><span className="skirmish-icon skirmish-icon-rook-blue" aria-hidden="true" />Blue Legion</h2>
            <dl>
              <div><dt>Units</dt><dd>{playerPieces.length}</dd></div>
              <div><dt>Captured</dt><dd>{playerCaptured}</dd></div>
              <div><dt>CP</dt><dd>{moves.length} / {game.size.cols}</dd></div>
            </dl>
            <div className="skirmish-charge-track" aria-label="Command points">
              {Array.from({ length: game.size.cols }).map((_, i) => (
                <span key={i} className={i < moves.length ? 'active' : ''} />
              ))}
            </div>
          </aside>
          <div className="skirmish-board-frame">
            <SkirmishBoard />
          </div>
          <aside className="skirmish-left-panel skirmish-terrain-panel" aria-label="Current tile summary">
            <h2>Grassland</h2>
            <p>{selected ? `${selected.type} ready on open ground.` : 'Normal terrain. No special effect.'}</p>
            <dl>
              <div><dt><span className="skirmish-icon skirmish-icon-move" aria-hidden="true" />Move</dt><dd>{moves.length || 1}</dd></div>
              <div><dt><span className="skirmish-icon skirmish-icon-shield" aria-hidden="true" />Defense</dt><dd>0%</dd></div>
            </dl>
          </aside>
        </div>
      </section>
      <SkirmishHud />
    </div>
  );
}
