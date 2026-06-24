import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath } from './navigation';

const MUTE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';
const SETTINGS_KEY = 'chess-tactics-settings-v1';
const ASSET_BASE = '/assets/ui/settings';

type SettingsTab = 'general' | 'audio' | 'gameplay' | 'creator-tools';
type ButtonTone = 'neutral' | 'primary' | 'danger';

interface LocalSettings {
  uiScale: number;
  masterAudio: boolean;
  musicVolume: number;
  effectsVolume: number;
  interfaceSounds: boolean;
}

interface BgmTrack {
  title: string;
  url: string;
}

interface TabDefinition {
  id: SettingsTab;
  label: string;
  icon: string;
  summary: string;
}

interface CreatorTool {
  label: string;
  href: string;
  description: string;
  icon: string;
}

const DEFAULT_SETTINGS: LocalSettings = {
  uiScale: 100,
  masterAudio: true,
  musicVolume: 70,
  effectsVolume: 80,
  interfaceSounds: true,
};

const tabs: TabDefinition[] = [
  { id: 'general', label: 'General', icon: 'icon-gear-generated.png', summary: 'Account and interface defaults' },
  { id: 'audio', label: 'Audio', icon: 'icon-speaker-generated.png', summary: 'Music, effects, and interface sound' },
  { id: 'gameplay', label: 'Gameplay', icon: 'icon-knight-generated.png', summary: 'Rules and assists' },
  { id: 'creator-tools', label: 'Creator Tools', icon: 'icon-wrench-generated.png', summary: 'Design and production workspaces' },
];

// Each settings section is its own route (/settings/<tab>) so it can be linked,
// reloaded, and back/forward-navigated. App.tsx mounts <Settings/> for the whole
// /settings/* subtree; the active tab is derived from the URL, not local state.
const TAB_PATHS: Record<SettingsTab, string> = {
  general: '/settings/general',
  audio: '/settings/audio',
  gameplay: '/settings/gameplay',
  'creator-tools': '/settings/creator-tools',
};

function tabFromPath(pathname: string): SettingsTab {
  const id = normalizeRoutePath(pathname).match(/^\/settings\/(.+)$/)?.[1];
  if (id === 'audio' || id === 'gameplay' || id === 'creator-tools' || id === 'general') return id;
  return 'general';
}

const creatorTools: CreatorTool[] = [
  { label: 'Design Index', href: '/design', icon: 'icon-design-index.png', description: 'Open the system map for UI, content, and art references.' },
  { label: 'Tileset Studio', href: '/tileset-studio', icon: 'icon-tileset-studio.png', description: 'Build and inspect tactical terrain tile sets.' },
  { label: 'Unit Studio', href: '/unit-studio', icon: 'icon-unit-studio.png', description: 'Review unit sprites against terrain and facing rules.' },
  { label: 'Tileset Review', href: '/tileset-review', icon: 'icon-tileset-review.png', description: 'Check generated tile coverage before it ships.' },
];

function asset(file: string): string {
  // Use the shared UI kit's generated glyphs: icon-gear-generated.png -> kit/icons/gear.png
  return `/assets/ui/kit/icons/${file.replace(/^icon-/, '').replace(/-generated/, '')}`;
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}

function writeMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false'); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(MUTE_CHANGE_EVENT, { detail: { muted } }));
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function readLocalSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      uiScale: clamp(parsed.uiScale, 90, 120, DEFAULT_SETTINGS.uiScale),
      masterAudio: typeof parsed.masterAudio === 'boolean' ? parsed.masterAudio : DEFAULT_SETTINGS.masterAudio,
      musicVolume: clamp(parsed.musicVolume, 0, 100, DEFAULT_SETTINGS.musicVolume),
      effectsVolume: clamp(parsed.effectsVolume, 0, 100, DEFAULT_SETTINGS.effectsVolume),
      interfaceSounds: typeof parsed.interfaceSounds === 'boolean' ? parsed.interfaceSounds : DEFAULT_SETTINGS.interfaceSounds,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings: LocalSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function applyUiScale(scale: number): void {
  document.documentElement.style.setProperty('--settings-ui-scale', `${scale / 100}`);
}

function SettingsButton({
  children,
  tone = 'neutral',
  onClick,
  href,
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  tone?: ButtonTone;
  onClick?: () => void;
  href?: string;
  className?: string;
  ariaLabel?: string;
}): ReactElement {
  const classes = `settings-chrome-button settings-chrome-button-${tone} ${className}`.trim();
  if (href) {
    return (
      <a className={classes} href={href} aria-label={ariaLabel}>
        <span>{children}</span>
      </a>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} aria-label={ariaLabel}>
      <span>{children}</span>
    </button>
  );
}

function displayAccountName(user: AuthUser | null): string {
  if (user === null) return 'Checking';
  if (!user.signed_in) return 'Guest';
  return user.name || user.email || 'Player';
}

function SettingsToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? 'is-on' : 'is-off'}`}
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <img src={`/assets/ui/kit/toggle-${checked ? 'on' : 'off'}.png`} alt="" aria-hidden="true" />
    </button>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  value,
  tall = false,
  children,
}: {
  icon?: string;
  title: string;
  description?: string;
  value?: ReactNode;
  tall?: boolean;
  children?: ReactNode;
}): ReactElement {
  return (
    <section className={`settings-row ${tall ? 'settings-row-tall' : ''}`}>
      {icon ? <img className="settings-row-icon" src={asset(icon)} alt="" aria-hidden="true" /> : null}
      <div className="settings-row-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {value ? <div className="settings-row-value">{value}</div> : null}
      {children ? <div className="settings-row-control">{children}</div> : null}
    </section>
  );
}

function Stepper({
  value,
  suffix,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
}: {
  value: number;
  suffix: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}): ReactElement {
  return (
    <div className="settings-stepper">
      <SettingsButton ariaLabel={decreaseLabel} onClick={onDecrease}>-</SettingsButton>
      <output>{value}{suffix}</output>
      <SettingsButton ariaLabel={increaseLabel} onClick={onIncrease}>+</SettingsButton>
    </div>
  );
}

export function Settings(): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => tabFromPath(window.location.pathname));
  const [me, setMe] = useState<AuthUser | null>(null);
  const [muted, setMuted] = useState(readMuted());
  const [settings, setSettings] = useState<LocalSettings>(readLocalSettings);
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [tracksStatus, setTracksStatus] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('settings-art-active');
    return () => shell?.classList.remove('settings-art-active');
  }, []);

  useEffect(() => {
    // Bare /settings normalizes to the first section so the URL always names a tab.
    if (normalizeRoutePath(window.location.pathname) === '/settings') {
      navigateApp(TAB_PATHS.general, { replace: true, scroll: false });
    }
    const sync = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(APP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(APP_NAVIGATION_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = () => setMuted(readMuted());
    window.addEventListener('storage', sync);
    window.addEventListener(MUTE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MUTE_CHANGE_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    saveLocalSettings(settings);
    applyUiScale(settings.uiScale);
  }, [settings]);

  const active = useMemo(() => tabs.find((tab) => tab.id === activeTab) || tabs[0], [activeTab]);

  const updateSetting = <Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) => {
    setConfirmingReset(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const setBackgroundMusic = (enabled: boolean) => {
    setConfirmingReset(false);
    setMuted(!enabled);
    writeMuted(!enabled);
  };

  const setMasterAudio = (enabled: boolean) => {
    updateSetting('masterAudio', enabled);
    setMuted(!enabled);
    writeMuted(!enabled);
  };

  const resetDefaults = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setSettings(DEFAULT_SETTINGS);
    setMuted(false);
    writeMuted(false);
    setConfirmingReset(false);
  };

  const viewTracks = async () => {
    setTracksStatus('Loading tracks...');
    try {
      const response = await fetch('/api/bgm');
      if (!response.ok) throw new Error(`bgm ${response.status}`);
      const payload = await response.json() as { tracks?: Array<Partial<BgmTrack>> };
      const nextTracks = Array.isArray(payload.tracks)
        ? payload.tracks
            .filter((track): track is BgmTrack => typeof track.title === 'string' && typeof track.url === 'string')
            .map((track) => ({ title: track.title, url: track.url }))
        : [];
      setTracks(nextTracks);
      setTracksStatus(nextTracks.length ? `${nextTracks.length} tracks loaded.` : 'No tracks are available.');
    } catch {
      setTracks([]);
      setTracksStatus('Tracks are unavailable right now.');
    }
  };

  const signOut = async () => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  const adjustScale = (delta: number) => {
    updateSetting('uiScale', clamp(settings.uiScale + delta, 90, 120, DEFAULT_SETTINGS.uiScale));
  };

  const signedIn = Boolean(me?.signed_in);
  const accountName = displayAccountName(me);
  const accountStatus = signedIn ? 'Signed in' : me === null ? 'Checking account' : 'Not signed in';

  const renderGeneral = () => (
    <>
      <SettingsRow
        icon="icon-info.png"
        title="Account"
        description={signedIn ? 'Signed in profile for this browser.' : 'Guest profile for this browser.'}
        value={<span>{signedIn ? 'Ready' : 'Guest'}</span>}
      />
      <SettingsRow
        icon="icon-monitor.png"
        title="UI Scale"
        description="Interface scale for this browser."
      >
        <Stepper
          value={settings.uiScale}
          suffix="%"
          decreaseLabel="Decrease UI Scale"
          increaseLabel="Increase UI Scale"
          onDecrease={() => adjustScale(-5)}
          onIncrease={() => adjustScale(5)}
        />
      </SettingsRow>
      <SettingsRow
        icon="icon-reset.png"
        title="Reset to Defaults"
        description={confirmingReset ? 'Press reset again to confirm.' : 'Restore General and Audio settings for this browser.'}
        value={<span>{confirmingReset ? 'Confirm' : 'Ready'}</span>}
      >
        <SettingsButton tone="danger" onClick={resetDefaults}>Reset</SettingsButton>
      </SettingsRow>
    </>
  );

  const renderAudio = () => (
    <>
      <SettingsRow title="Master Audio" description="Mute or restore all browser audio for Chess Tactics.">
        <SettingsToggle checked={settings.masterAudio} label="Toggle Master Audio" onChange={setMasterAudio} />
      </SettingsRow>
      <SettingsRow title="Background Music" description="Preserves the existing background music mute preference.">
        <SettingsToggle checked={!muted} label="Toggle Background Music" onChange={setBackgroundMusic} />
      </SettingsRow>
      <SettingsRow icon="icon-music.png" title="Music Volume" description="Set the target music mix for this browser.">
        <Stepper
          value={settings.musicVolume}
          suffix="%"
          decreaseLabel="Lower Music Volume"
          increaseLabel="Raise Music Volume"
          onDecrease={() => updateSetting('musicVolume', clamp(settings.musicVolume - 5, 0, 100, DEFAULT_SETTINGS.musicVolume))}
          onIncrease={() => updateSetting('musicVolume', clamp(settings.musicVolume + 5, 0, 100, DEFAULT_SETTINGS.musicVolume))}
        />
      </SettingsRow>
      <SettingsRow icon="icon-effects.png" title="Effects Volume" description="Set the target effects mix for this browser.">
        <Stepper
          value={settings.effectsVolume}
          suffix="%"
          decreaseLabel="Lower Effects Volume"
          increaseLabel="Raise Effects Volume"
          onDecrease={() => updateSetting('effectsVolume', clamp(settings.effectsVolume - 5, 0, 100, DEFAULT_SETTINGS.effectsVolume))}
          onIncrease={() => updateSetting('effectsVolume', clamp(settings.effectsVolume + 5, 0, 100, DEFAULT_SETTINGS.effectsVolume))}
        />
      </SettingsRow>
      <SettingsRow icon="icon-interface-sounds.png" title="Interface Sounds" description="Enable or disable menu and control feedback sounds.">
        <SettingsToggle checked={settings.interfaceSounds} label="Toggle Interface Sounds" onChange={(enabled) => updateSetting('interfaceSounds', enabled)} />
      </SettingsRow>
      <SettingsRow icon="icon-info.png" title="View Tracks" description={tracksStatus || (tracks ? `${tracks.length} tracks loaded.` : 'Load the active background music playlist.')}>
        <SettingsButton onClick={viewTracks}>View Tracks</SettingsButton>
      </SettingsRow>
    </>
  );

  const renderGameplay = () => (
    <SettingsRow
      icon="icon-knight.png"
      title="Coming Soon"
      description="Gameplay settings are not available yet."
      value={<span>Locked</span>}
      tall
    />
  );

  const renderCreatorTools = () => (
    <>
      {creatorTools.map((tool) => (
        <SettingsRow key={tool.href} icon={tool.icon} title={tool.label} description={tool.description}>
          <SettingsButton tone="primary" href={tool.href} ariaLabel={`Open ${tool.label}`}>Open</SettingsButton>
        </SettingsRow>
      ))}
    </>
  );

  return (
    <section className="settings-art-route" aria-label="Settings" data-testid="settings">
      <div className="settings-screen">
        <header className="settings-header-frame">
          <a className="settings-brand" href="/">
            <img className="settings-brand-mark" src="/assets/ui/kit/icons/brand-shield.png" alt="" aria-hidden="true" />
            <span className="settings-brand-copy">
              <strong>Chess Tactics</strong>
              <em>Settings</em>
            </span>
          </a>
          <div className="settings-account" aria-label="Account">
            <span>
              <strong>{accountName}</strong>
              <em>{accountStatus}</em>
            </span>
            {signedIn
              ? <SettingsButton className="settings-header-button settings-header-button-account" onClick={signOut}>Sign Out</SettingsButton>
              : <SettingsButton className="settings-header-button settings-header-button-account" href={signInHref('/settings')}>Sign In</SettingsButton>}
          </div>
          <nav className="settings-header-actions" aria-label="Settings navigation">
            <SettingsButton className="settings-header-button settings-header-button-back" onClick={() => window.history.back()}>Back</SettingsButton>
            <SettingsButton className="settings-header-button settings-header-button-menu" href="/">Menu</SettingsButton>
          </nav>
        </header>

        <div className="settings-shell">
          <aside className="settings-rail-frame" aria-label="Settings sections">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={TAB_PATHS[tab.id]}
                className={`settings-tab ${tab.id === activeTab ? 'is-active' : ''}`}
                aria-current={tab.id === activeTab ? 'page' : undefined}
                onClick={() => setConfirmingReset(false)}
              >
                <span className="settings-tab-icon" aria-hidden="true">
                  <img src={asset(tab.icon)} alt="" />
                </span>
                <span>
                  <strong>{tab.label}</strong>
                  <em>{tab.summary}</em>
                </span>
              </a>
            ))}
          </aside>

          <main className="settings-main-frame">
            <div className="settings-panel-heading">
              <p>Settings</p>
              <h2>{active.label}</h2>
            </div>
            <div className="settings-panel-content">
              {activeTab === 'general' ? renderGeneral() : null}
              {activeTab === 'audio' ? renderAudio() : null}
              {activeTab === 'gameplay' ? renderGameplay() : null}
              {activeTab === 'creator-tools' ? renderCreatorTools() : null}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
