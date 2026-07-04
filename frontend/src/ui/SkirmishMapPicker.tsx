import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useCampaigns } from '../campaign/store';
import type { Level } from '../core/level';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { NavButton } from './shared/NavButton';
import { LightArtRouteShell } from './shell/LightArtRouteShell';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';

const OBJECTIVE_COPY = {
  'capture-all': 'Capture all enemy pieces',
  'capture-king': 'Capture the enemy King',
  'rival-kings': 'Capture the rival King',
  survive: 'Survive the assault',
  reach: 'Reach the objective',
} as const;

function SkirmishPickerStatus(): ReactElement {
  return (
    <>
      <div className="skirmish-status-chip skirmish-turn-plate">
        <strong>Map Select</strong>
        <small>Saved Boards</small>
      </div>
      <div className="skirmish-status-chip skirmish-objective">
        <span className="skirmish-icon skirmish-icon-flag" aria-hidden="true" />
        <span>
          <strong>Objective</strong>
          <small>Pick a map or roll a random board</small>
        </span>
      </div>
    </>
  );
}

function SkirmishMapPickerContent({ levels, loading }: { levels: Level[]; loading: boolean }): ReactElement {
  return (
    <>
      <div className="skirmish-picker-header">
        <div>
          <span className="skirmish-eyebrow">Skirmish</span>
          <h1>Choose Map</h1>
        </div>
        <NavButton className="ce-link-button skirmish-picker-random" to="/play?random=1&returnTo=%2Fskirmish">
          <span>Random Skirmish</span>
        </NavButton>
      </div>

      {loading ? <p className="ce-empty skirmish-picker-empty">Loading maps.</p> : null}
      {!loading && levels.length === 0 ? (
        <div className="skirmish-card skirmish-picker-empty-card">
          <h2>No saved skirmish maps</h2>
          <p>Save a standalone board in the Level Editor, then it will appear here.</p>
          <NavButton className="ce-link-button" to="/level-editor"><span>Open Level Editor</span></NavButton>
        </div>
      ) : null}

      <div className="skirmish-map-grid">
        {levels.map((level) => {
          const playerCount = level.layers.units.filter((unit) => unit.side === 'player').length;
          const enemyCount = level.layers.units.filter((unit) => unit.side === 'enemy').length;
          return (
            <article key={level.id} className="skirmish-map-card">
              <div className="skirmish-map-thumb" aria-hidden="true">
                <LevelThumbnail level={level} width={180} height={118} />
              </div>
              <div className="skirmish-map-copy">
                <h2>{level.name}</h2>
                <dl>
                  <div><dt>Board</dt><dd>{level.board.cols}x{level.board.rows}</dd></div>
                  <div><dt>Forces</dt><dd>{playerCount}v{enemyCount}</dd></div>
                  <div><dt>Goal</dt><dd>{OBJECTIVE_COPY[level.objective]}</dd></div>
                </dl>
              </div>
              <div className="skirmish-map-actions">
                <NavButton className="ce-link-button ce-link-button-ghost" to={`/edit?levelId=${encodeURIComponent(level.id)}&returnTo=${encodeURIComponent('/skirmish')}`}>
                  <span>Edit</span>
                </NavButton>
                <NavButton className="ce-link-button" to={playSkirmishLevelHref(level.id)}>
                  <span>Play</span>
                </NavButton>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function SkirmishMapPickerRoute(): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const skirmishLevels = useMemo(() => skirmishMapLevels(campaigns, levels), [campaigns, levels]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ensureCampaignsHydrated()
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <LightArtRouteShell
      rootClassName="skirmish-screen skirmish-picker-screen"
      chromeClassName="skirmish-picker"
      chromeAriaLabel="Skirmish maps"
      shellClassName="main-menu-active"
      testId="skirmish"
      centerSlot={<SkirmishPickerStatus />}
      centerSlotClassName="skirmish-topbar-status"
    >
      <SkirmishMapPickerContent levels={skirmishLevels} loading={loading} />
    </LightArtRouteShell>
  );
}
