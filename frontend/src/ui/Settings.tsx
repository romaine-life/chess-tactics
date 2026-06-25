import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath } from './navigation';
import { BrandLockup } from './shared/BrandLockup';

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
  { id: 'general', label: 'General', icon: 'icon-gear-generated.png' },
  { id: 'audio', label: 'Audio', icon: 'icon-speaker-generated.png' },
  { id: 'gameplay', label: 'Gameplay', icon: 'icon-knight-generated.png' },
  { id: 'creator-tools', label: 'Creator Tools', icon: 'icon-wrench-generated.png' },
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

// One creator-tools entry — the studio is the single workspace: tiles, units,
// and the UI-kit asset library are all categories within it. (The broader Design
// Index still lives at /design directly.)
const creatorTools: CreatorTool[] = [
  { label: 'Studio', href: '/tileset-studio', icon: 'icon-tileset-studio.png', description: 'The creator workspace — browse tiles, units, the UI-kit asset library, and the artwork gallery, all in one place.' },
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
      {/* Atom-built toggle: kit 9-slice track (border-image) + live label + sliding knob.
          The track scales with --settings-ui-scale and the label is live text, so this
          control survives resizing and could host any word, not just ON/OFF. */}
      <span className="settings-toggle-label">{checked ? 'On' : 'Off'}</span>
      <span className="settings-toggle-knob" aria-hidden="true" />
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
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {value ? <div className="settings-row-value">{value}</div> : null}
      {children ? <div className="settings-row-control">{children}</div> : null}
    </section>
  );
}

// A labeled cluster of rows. Purely organizational: a small uppercase eyebrow
// (h3, between the tab's h2 and each row's h4) plus its grouped rows, so a long
// settings list reads as scannable sections instead of one undifferentiated stack.
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-section-rows">{children}</div>
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

function Slider({
  value,
  suffix,
  label,
  onChange,
}: {
  value: number;
  suffix: string;
  label: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="settings-slider">
      {/* The track fills blue up to the thumb via --val (the live percentage). */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        style={{ ['--val' as string]: `${value}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}{suffix}</output>
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
      <SettingsSection title="Account">
        <SettingsRow
          icon="icon-info.png"
          title="Account"
          description={signedIn ? 'Signed in profile for this browser.' : 'Guest profile for this browser.'}
          value={<span>{signedIn ? 'Ready' : 'Guest'}</span>}
        />
      </SettingsSection>
      <SettingsSection title="Interface">
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
      </SettingsSection>
      <SettingsSection title="Defaults">
        <SettingsRow
          icon="icon-reset.png"
          title="Reset to Defaults"
          description={confirmingReset ? 'Press reset again to confirm.' : 'Restore General and Audio settings for this browser.'}
          value={<span>{confirmingReset ? 'Confirm' : 'Ready'}</span>}
        >
          <SettingsButton tone="danger" onClick={resetDefaults}>Reset</SettingsButton>
        </SettingsRow>
      </SettingsSection>
    </>
  );

  const renderAudio = () => (
    <>
      <SettingsSection title="Master">
        <SettingsRow title="Master Audio" description="Mute or restore all browser audio for Chess Tactics.">
          <SettingsToggle checked={settings.masterAudio} label="Toggle Master Audio" onChange={setMasterAudio} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Music">
        <SettingsRow title="Background Music" description="Preserves the existing background music mute preference.">
          <SettingsToggle checked={!muted} label="Toggle Background Music" onChange={setBackgroundMusic} />
        </SettingsRow>
        <SettingsRow icon="icon-music.png" title="Music Volume" description="Set the target music mix for this browser.">
          <Slider
            value={settings.musicVolume}
            suffix="%"
            label="Music Volume"
            onChange={(next) => updateSetting('musicVolume', clamp(next, 0, 100, DEFAULT_SETTINGS.musicVolume))}
          />
          <SettingsButton onClick={viewTracks}>View Tracks</SettingsButton>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Effects">
        <SettingsRow icon="icon-effects.png" title="Effects Volume" description="Set the target effects mix for this browser.">
          <Slider
            value={settings.effectsVolume}
            suffix="%"
            label="Effects Volume"
            onChange={(next) => updateSetting('effectsVolume', clamp(next, 0, 100, DEFAULT_SETTINGS.effectsVolume))}
          />
        </SettingsRow>
        <SettingsRow icon="icon-interface-sounds.png" title="Interface Sounds" description="Enable or disable menu and control feedback sounds.">
          <SettingsToggle checked={settings.interfaceSounds} label="Toggle Interface Sounds" onChange={(enabled) => updateSetting('interfaceSounds', enabled)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Notes">
        <SettingsRow
          icon="icon-info.png"
          title="Local Settings"
          description={tracksStatus || 'Audio settings are saved on this device.'}
        />
      </SettingsSection>
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
    <SettingsSection title="Workspaces">
      {creatorTools.map((tool) => (
        <SettingsRow key={tool.href} icon={tool.icon} title={tool.label} description={tool.description}>
          <SettingsButton tone="primary" href={tool.href} ariaLabel={`Open ${tool.label}`}>Open</SettingsButton>
        </SettingsRow>
      ))}
    </SettingsSection>
  );

  return (
    <section className="settings-art-route" aria-label="Settings" data-testid="settings">
      <div className="settings-screen">
        <header className="app-titlebar settings-header-frame">
          <BrandLockup screenName="Settings" />
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
          <aside className="settings-frame settings-rail-frame" aria-label="Settings sections">
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
                </span>
              </a>
            ))}
          </aside>

          <main className="settings-frame settings-main-frame">
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
