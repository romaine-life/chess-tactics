import { useEffect } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { useSkirmish } from '../game/store';
import { livingPieces } from '../core/rules';

export function Skirmish() {
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const game = useSkirmish((s) => s.game);
  const playerPieces = livingPieces(game.pieces, 'player');
  const enemyPieces = livingPieces(game.pieces, 'enemy');
  const turnLabel = game.winner
    ? game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Player Turn' : 'Enemy Turn';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);

  useEffect(() => {
    newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1 });
  }, [newSkirmish]);

  return (
    <div data-testid="skirmish" className="skirmish-screen">
      <section className="skirmish-war-room" aria-label="Skirmish battlefield">
        <header className="skirmish-topbar" aria-label="Skirmish status">
          <a className="skirmish-brand" href="/" aria-label="Chess Tactics home">
            <span className="skirmish-icon skirmish-icon-rook-blue" aria-hidden="true" />
            <span>
              <strong>Chess Tactics</strong>
              <small>Skirmish Mode</small>
            </span>
          </a>
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
          <div className="skirmish-board-frame">
            <SkirmishBoard />
          </div>
        </div>
      </section>
      <SkirmishHud />
    </div>
  );
}
