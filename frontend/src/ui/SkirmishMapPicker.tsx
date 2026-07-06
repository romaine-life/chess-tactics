import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useCampaigns } from '../campaign/store';
import type { Level } from '../core/level';
import { spawnEventsForLevel } from '../core/levelEvents';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { NavButton } from './shared/NavButton';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { levelObjectiveLine } from './LevelInfoCompact';
import { FittedTabLabel } from './shared/FittedTabLabel';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';
import { ensureDefaultSkirmishProfileLevel, skirmishProfileLevels } from './skirmishProfiles';

const ICONS = '/assets/ui/main-menu/icons-carved';

type SkirmishTab = 'profiles' | 'levels';

function levelForceSummary(level: Level): string {
  const count = (side: 'player' | 'enemy'): number => {
    const painted = level.layers.units.filter((unit) => unit.side === side).length;
    const spawned = spawnEventsForLevel(level)
      .filter((event) => event.side === side)
      .reduce((sum, event) => sum + Object.values(event.roster ?? {}).reduce((inner, n) => inner + (n ?? 0), 0), 0);
    return painted + spawned;
  };
  return `${count('player')}v${count('enemy')}`;
}

function SkirmishProfilesPanel({ levels, embedded }: { levels: Level[]; embedded?: boolean }): ReactElement {
  return (
    <main className={embedded ? 'menu-dest-col menu-dest-action' : 'settings-frame settings-main-frame'}>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">Skirmish Profiles</h3>
          <div className="settings-section-rows">
            {levels.map((level) => (
              <section className="settings-row" key={level.id}>
                <span className="settings-row-thumb" aria-hidden="true">
                  <LevelThumbnail level={level} width={72} height={48} alt="" />
                </span>
                <div className="settings-row-copy">
                  <h4>{level.name}</h4>
                  <p>{levelObjectiveLine(level)} · {levelForceSummary(level)} · {level.board.cols}x{level.board.rows}</p>
                </div>
                <div className="settings-row-control">
                  <NavButton
                    className="app-header-button app-header-button-active"
                    to={playSkirmishLevelHref(level.id)}
                    aria-label={`Play ${level.name}`}
                  >
                    Play
                  </NavButton>
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// The "Levels" section: the uncategorized standalone levels (boards saved in the editor
// that no campaign references), shown as the same level rows the Campaign screen uses.
function SkirmishLevelsPanel({ levels, loading, embedded }: { levels: Level[]; loading: boolean; embedded?: boolean }): ReactElement {
  return (
    <main className={embedded ? 'menu-dest-col menu-dest-action' : 'settings-frame settings-main-frame'}>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">Uncategorized Levels</h3>
          <div className="settings-section-rows">
            {loading ? (
              <section className="settings-row">
                <div className="settings-row-copy"><h4>Loading levels…</h4></div>
              </section>
            ) : null}
            {!loading && levels.length === 0 ? (
              <section className="settings-row">
                <div className="settings-row-copy">
                  <h4>No standalone levels</h4>
                  <p>Save a board in the Level Editor and it appears here.</p>
                </div>
                <div className="settings-row-control">
                  <NavButton className="app-header-button" to="/editor/level">Open Editor</NavButton>
                </div>
              </section>
            ) : null}
            {levels.map((level) => {
              const playerCount = level.layers.units.filter((unit) => unit.side === 'player').length;
              const enemyCount = level.layers.units.filter((unit) => unit.side === 'enemy').length;
              return (
                <section className="settings-row" key={level.id}>
                  <span className="settings-row-thumb" aria-hidden="true">
                    <LevelThumbnail level={level} width={72} height={48} alt="" />
                  </span>
                  <div className="settings-row-copy">
                    <h4>{level.name}</h4>
                    <p>{levelObjectiveLine(level)} · {playerCount}v{enemyCount} · {level.board.cols}x{level.board.rows}</p>
                  </div>
                  <div className="settings-row-control">
                    <NavButton
                      className="app-header-button app-header-button-active"
                      to={playSkirmishLevelHref(level.id)}
                      aria-label={`Play ${level.name}`}
                    >
                      Play
                    </NavButton>
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

// The Skirmish hub: a settings-twin of the main menu (like Campaign). The rail switches
// between editable skirmish profiles and standalone saved levels. Click the brand lockup to go home.
export function SkirmishMapPickerRoute({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const profileLevels = useMemo(() => skirmishProfileLevels(levels), [levels]);
  const skirmishLevels = useMemo(() => skirmishMapLevels(campaigns, levels), [campaigns, levels]);
  const [tab, setTab] = useState<SkirmishTab>('profiles');
  const [contentReady, setContentReady] = useState(() => useCampaigns.getState().campaigns.length > 0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (embedded) return; // the persistent menu shell (MainMenu) owns .main-menu-active + the backdrop
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, [embedded]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ensureCampaignsHydrated()
      .catch(() => {})
      .finally(() => {
        ensureDefaultSkirmishProfileLevel();
        if (active) { setLoading(false); setContentReady(true); }
      });
    return () => { active = false; };
  }, []);

  const TABS: { id: SkirmishTab; label: string; icon: string }[] = [
    { id: 'profiles', label: 'Skirmish Profiles', icon: 'solo-skirmish' },
    { id: 'levels', label: 'Levels', icon: 'level-editor' },
  ];

  // The two skirmish columns — the Profiles/Levels rail (a tab column) + the chosen panel (an action
  // column). Shared by the standalone route AND the embedded-in-shell render. The rail tabs are
  // internal STATE (setTab), not routes, so the skirmish sub-nav lives inside the one instance.
  const inner = (
    <>
      <aside className={embedded ? 'menu-dest-col menu-dest-tabs' : 'settings-frame settings-rail-frame'} aria-label="Skirmish">
        {TABS.map((t, index) => (
          <button
            key={t.id}
            type="button"
            className={`settings-tab main-menu-mode-tab ${t.id === tab ? 'is-active' : ''}`.trim()}
            // ADR-0063: each tab samples its own vertical slice of the rail's continuous
            // stone sheet via --tab-index (see .settings-tab in style.css), so the texture
            // reads as one sheet, not a per-tab restart. Guarded by settingsRailContinuity.test.
            style={{ ['--tab-index' as string]: index }}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">
              <img src={`${ICONS}/${t.icon}.png`} alt="" />
            </span>
            <FittedTabLabel>{t.label}</FittedTabLabel>
          </button>
        ))}
      </aside>

      {tab === 'profiles'
        ? <SkirmishProfilesPanel levels={profileLevels} embedded={embedded} />
        : <SkirmishLevelsPanel levels={skirmishLevels} loading={loading} embedded={embedded} />}
    </>
  );

  // Embedded in the persistent menu shell (MainMenu's second column): render just the two columns.
  // The shell owns the backdrop, screen wrapper, cold-reveal gates, and zoom-safe placement.
  if (embedded) return inner;

  return (
    // The cold-load reveal director only runs on the home menu, so declare both reveal
    // gates up front (like Campaign) to render fully revealed rather than stuck at opacity 0.
    <div
      className="menu-layer main-menu-layer is-ready"
      data-testid="skirmish"
      data-reveal-bg=""
      data-reveal-buttons=""
    >
      <HomepageBackdrop />
      <div className="settings-screen main-menu-twin-screen app-shell-bar-pad">
        <ArtRouteChrome className="settings-shell" ready={contentReady}>
          {inner}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
