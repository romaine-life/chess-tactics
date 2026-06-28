import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { BrandLockup } from './shared/BrandLockup';
import { useSkirmish, shouldStartFreshSkirmish } from '../game/store';
import { useCampaigns } from '../campaign/store';
import { loadWorkspace } from '../net/campaignWorkspace';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import { PALETTE_FOR_SIDE, isPlayablePieceType } from '../core/pieces';
import { masterSrc, type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
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
  const turnLabel = game.winner
    ? game.winner === 'draw' ? 'Stalemate' : game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Player Turn' : 'Enemy Turn';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);

  // Warm the portrait cache for the units actually on the board so the HUD bust
  // paints instantly on the first click instead of waiting for a fetch+decode at
  // that moment. The HUD renders the bust live from the editor master render (via
  // <UnitPortrait>), so preload THOSE — not the no-longer-used baked PNGs — plus
  // the backdrop scene. Scoped to the current roster (both sides are focusable).
  useEffect(() => {
    const urls: string[] = [];
    for (const piece of game.pieces) {
      if (!isPlayablePieceType(piece.type)) continue;
      urls.push(masterSrc(piece.type as PortraitPiece, PALETTE_FOR_SIDE[piece.side] as PortraitPalette));
      urls.push(DEFAULT_BACKGROUND_SET.portraits[piece.type]);
    }
    preloadImages(urls);
  }, [game.pieces]);

  useEffect(() => {
    // Returning here from the menu (or any other screen) should resume, not
    // restart: the store is a singleton that already holds the live board. Only
    // build a fresh game when there isn't a matching in-progress one — i.e. the
    // first launch, after a finished game, or when a different level is opened.
    const shouldStartFresh = (levelId: string | null): boolean =>
      shouldStartFreshSkirmish(useSkirmish.getState(), levelId);
    const freshSeed = () => Math.floor(Math.random() * 999999) + 1;

    if (!routeLevelId || routeLevel) {
      const levelId = routeLevel?.id ?? null;
      if (shouldStartFresh(levelId)) newSkirmish({ seed: freshSeed(), level: routeLevel ?? undefined });
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
        if (shouldStartFresh(level?.id ?? null)) newSkirmish({ seed: freshSeed(), level: level ?? undefined });
      })
      .catch(() => { if (shouldStartFresh(null)) newSkirmish({ seed: freshSeed() }); });
    return () => { active = false; };
  }, [newSkirmish, routeCampaignId, routeLevel, routeLevelId]);

  const screenStyle = {
    '--skirmish-world-bg': `url("${DEFAULT_BACKGROUND_SET.world}")`,
  } as CSSProperties;

  return (
    <div data-testid="skirmish" className="skirmish-screen" style={screenStyle}>
      <header className="app-titlebar skirmish-topbar" aria-label="Skirmish status">
        <BrandLockup screenName="Skirmish" />

        <div className="skirmish-topbar-status">
          <div className="skirmish-status-chip skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>{game.winner ? 'Skirmish Complete' : 'Live Board'}</small>
          </div>
          <div className="skirmish-status-chip skirmish-objective">
            <span className="skirmish-icon skirmish-icon-flag" aria-hidden="true" />
            <span>
              <strong>Objective</strong>
              <small>{routeLevel ? OBJECTIVE_COPY[routeLevel.objective] : 'Capture the enemy King'}</small>
            </span>
          </div>
        </div>

        <div className="skirmish-topbar-right">
          <nav className="skirmish-window-actions" aria-label="Skirmish navigation">
            <a className="skirmish-header-button" href="/settings">
              <span className="skirmish-icon skirmish-icon-gear" aria-hidden="true" />
              <span className="skirmish-header-button-label">Settings</span>
            </a>
          </nav>
        </div>
      </header>

      <section className="skirmish-war-room" aria-label="Skirmish battlefield">
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
