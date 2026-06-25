import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { useSkirmish } from '../game/store';
import { useCampaigns } from '../campaign/store';
import { loadWorkspace } from '../net/campaignWorkspace';
import { livingPieces } from '../core/rules';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import { PALETTE_FOR_SIDE, isPlayablePieceType, portraitPath } from '../core/pieces';
import { preloadImages } from '../art/preload';

const OBJECTIVE_COPY = {
  'capture-all': 'Capture all enemy pieces',
  'capture-king': 'Capture the enemy King',
  survive: 'Survive the assault',
  reach: 'Reach the objective',
} as const;

export function Skirmish() {
  const routeParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const routeCampaignId = routeParams.get('campaignId');
  const routeLevelId = routeParams.get('levelId');
  const [routeLevel, setRouteLevel] = useState(() => (routeLevelId ? useCampaigns.getState().levels[routeLevelId] ?? null : null));
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

  // Warm the portrait cache for the units actually on the board so the HUD bust
  // paints instantly on the first click instead of waiting for a fetch+decode at
  // that moment. Scoped to the current roster (both sides are focusable).
  useEffect(() => {
    const urls: string[] = [];
    for (const piece of game.pieces) {
      if (!isPlayablePieceType(piece.type)) continue;
      urls.push(portraitPath(piece.type, PALETTE_FOR_SIDE[piece.side]));
      urls.push(DEFAULT_BACKGROUND_SET.portraits[piece.type]);
    }
    preloadImages(urls);
  }, [game.pieces]);

  useEffect(() => {
    if (!routeLevelId || routeLevel) {
      newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1, level: routeLevel ?? undefined });
      return;
    }
    let active = true;
    loadWorkspace()
      .then((workspace) => {
        if (!active) return;
        useCampaigns.getState().hydrate(workspace);
        if (routeCampaignId) useCampaigns.getState().selectCampaign(routeCampaignId);
        useCampaigns.getState().selectLevel(routeLevelId);
        const level = useCampaigns.getState().levels[routeLevelId] ?? null;
        setRouteLevel(level);
        newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1, level: level ?? undefined });
      })
      .catch(() => newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1 }));
    return () => { active = false; };
  }, [newSkirmish, routeCampaignId, routeLevel, routeLevelId]);

  const screenStyle = {
    '--skirmish-world-bg': `url("${DEFAULT_BACKGROUND_SET.world}")`,
  } as CSSProperties;

  return (
    <div data-testid="skirmish" className="skirmish-screen" style={screenStyle}>
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
              <small>{routeLevel ? OBJECTIVE_COPY[routeLevel.objective] : 'Capture the enemy King'}</small>
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
