import { useEffect, useMemo, useState } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { useSkirmish } from '../game/store';
import { useCampaigns } from '../campaign/store';
import { loadWorkspace } from '../net/campaignWorkspace';
import { livingPieces } from '../core/rules';
import { isPassableTerrain } from '../core/terrain';
import type { TerrainType } from '../core/types';

// Presentation copy for the terrain panel. The first biome is moonlit
// grassland; descriptions read the tile, not the unit. Movement/defense are
// informational this pass — water/cliff block movement (enforced by the rules
// engine) but per-tile move-cost and defense modifiers are not yet live.
const TERRAIN_INFO: Record<TerrainType, { label: string; blurb: string }> = {
  grass: { label: 'Grassland', blurb: 'Normal terrain. No special effect.' },
  road: { label: 'Stone Road', blurb: 'A paved path through the grass.' },
  stone: { label: 'Stone', blurb: 'Solid, open footing.' },
  bridge: { label: 'Bridge', blurb: 'A crossing over the water.' },
  water: { label: 'Water', blurb: 'Open water — impassable to land units.' },
  cliff: { label: 'Cliff', blurb: 'A sheer rock face — impassable.' },
  rock: { label: 'Rocky Ground', blurb: 'Broken, impassable ground.' },
};

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
  const selectedId = useSkirmish((s) => s.selectedId);
  const movesForSelected = useSkirmish((s) => s.movesForSelected);
  const playerPieces = livingPieces(game.pieces, 'player');
  const enemyPieces = livingPieces(game.pieces, 'enemy');
  const playerCaptured = game.pieces.filter((piece) => piece.side === 'player' && !piece.alive).length;
  const selected = game.pieces.find((piece) => piece.id === selectedId && piece.alive) ?? null;
  const moves = movesForSelected();
  const selectedTile = selected ? game.terrain?.find((c) => c.x === selected.x && c.y === selected.y) ?? null : null;
  const terrainInfo = TERRAIN_INFO[selectedTile?.terrain ?? 'grass'];
  const terrainPassable = isPassableTerrain(selectedTile?.terrain ?? 'grass');
  const turnLabel = game.winner
    ? game.winner === 'player' ? 'Victory' : 'Defeat'
    : game.turn === 'player' ? 'Player Turn' : 'Enemy Turn';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);

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
            <h2>{terrainInfo.label}</h2>
            <p>{selected ? terrainInfo.blurb : 'Select a unit to inspect its tile.'}</p>
            <dl>
              <div><dt><span className="skirmish-icon skirmish-icon-move" aria-hidden="true" />Move</dt><dd>{selected ? (terrainPassable ? 'Open' : 'Blocked') : '—'}</dd></div>
              <div><dt><span className="skirmish-icon skirmish-icon-shield" aria-hidden="true" />Defense</dt><dd>0%</dd></div>
            </dl>
          </aside>
        </div>
      </section>
      <SkirmishHud />
    </div>
  );
}
