import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useCampaigns } from '../campaign/store';
import type { Level } from '../core/level';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { NavButton } from './shared/NavButton';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { levelObjectiveLine } from './LevelInfoCompact';
import { SkirmishClockControl } from './SkirmishClockControl';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';

const ICONS = '/assets/ui/main-menu/icons-carved';

type SkirmishTab = 'random' | 'levels';

// The "Random Skirmish" section: pick the battle clock, then roll a fresh random board.
// Time controls write straight to the shared preference (SkirmishClockControl), and Start
// enters the board with ?random=1 — which always rolls a fresh battle on that clock
// (ui/Skirmish reads the preference).
function RandomSkirmishPanel(): ReactElement {
  return (
    <main className="settings-frame settings-main-frame">
      <div className="settings-panel-content">
        <section className="settings-section skirmish-setup-section">
          <h3 className="settings-section-title">Random Skirmish</h3>
          <p className="skirmish-setup-blurb">
            A freshly rolled board and forces every time — capture the enemy King. Set the
            battle clock, then start.
          </p>
          <div className="skirmish-setup-clock">
            <span className="skirmish-eyebrow">Battle clock</span>
            <SkirmishClockControl timedHint="Starts a fresh random battle on this clock." />
          </div>
          <div className="skirmish-setup-actions">
            <NavButton className="app-header-button app-header-button-active skirmish-setup-start" to="/play?random=1">
              Start Skirmish
            </NavButton>
          </div>
        </section>
      </div>
    </main>
  );
}

// The "Levels" section: the uncategorized standalone levels (boards saved in the editor
// that no campaign references), shown as the same level rows the Campaign screen uses.
function SkirmishLevelsPanel({ levels, loading }: { levels: Level[]; loading: boolean }): ReactElement {
  return (
    <main className="settings-frame settings-main-frame">
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
                  <NavButton className="app-header-button" to="/level-editor">Open Editor</NavButton>
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
// between "Random Skirmish" (roll a fresh board, choose the clock) and "Levels" (pick a
// standalone board). Click the brand lockup to go home.
export function SkirmishMapPickerRoute(): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const skirmishLevels = useMemo(() => skirmishMapLevels(campaigns, levels), [campaigns, levels]);
  const [tab, setTab] = useState<SkirmishTab>('random');
  const [contentReady, setContentReady] = useState(() => useCampaigns.getState().campaigns.length > 0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ensureCampaignsHydrated()
      .catch(() => {})
      .finally(() => { if (active) { setLoading(false); setContentReady(true); } });
    return () => { active = false; };
  }, []);

  const TABS: { id: SkirmishTab; label: string; icon: string }[] = [
    { id: 'random', label: 'Random Skirmish', icon: 'solo-skirmish' },
    { id: 'levels', label: 'Levels', icon: 'level-editor' },
  ];

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
          <aside className="settings-frame settings-rail-frame" aria-label="Skirmish">
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
                <span><strong>{t.label}</strong></span>
              </button>
            ))}
          </aside>

          {tab === 'random'
            ? <RandomSkirmishPanel />
            : <SkirmishLevelsPanel levels={skirmishLevels} loading={loading} />}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
