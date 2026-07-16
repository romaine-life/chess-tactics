import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { readDisabledUrls, writeDisabledUrls, sendBgmCommand, BGM_STATE_EVENT } from '../bgmPrefs.js';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath, readValidatedReturnTo } from './navigation';
import { KitScroll } from './KitScroll';
import { NavButton } from './shared/NavButton';
import { SettingsButton, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { FittedTabLabel } from './shared/FittedTabLabel';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarActions, TitleBarButton } from './shell/TitleBarControls';
import { SFX_SETTINGS_CHANGE_EVENT, previewTerrain } from '../sfx';
import { chromeUnitClassNames } from './chromeUnitRegistry';

const MUTE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';
const SETTINGS_KEY = 'chess-tactics-settings-v1';
const ASSET_BASE = '/assets/ui/settings';
// How long the panel body fades out before swapping in the next menu's controls,
// then fades back in. MUST match --ds-duration-fade on .settings-panel-content in style.css
// (the ONE shared fade duration, ADR-0046 — same speed as the screen entrance).
const PANEL_FADE_MS = 350;

type SettingsTab = 'general' | 'audio' | 'gameplay' | 'creator-tools';

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
  artist?: string;
  album?: string;
}

interface NowPlayingState {
  playing: boolean;
  paused: boolean;
  currentUrl: string | null;
  otherTab: boolean;
  otherPaused: boolean;
  otherTitle: string | null;
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
  // When true the href is an external URL opened in a new tab (e.g. the ambience
  // broadcast monitor), not an in-app SPA route.
  external?: boolean;
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
  // Match only the leading section segment, so deeper routes (e.g.
  // /settings/audio/tracks) still resolve to their owning tab and keep it lit.
  const id = normalizeRoutePath(pathname).match(/^\/settings\/([^/]+)/)?.[1];
  if (id === 'audio' || id === 'gameplay' || id === 'creator-tools' || id === 'general') return id;
  return 'general';
}

// The Audio tab has one sub-view: the soundtrack list at /settings/audio/tracks.
// It's its own route so the ← back button, reload, and browser back all work.
const TRACKS_PATH = '/settings/audio/tracks';

function isTracksView(pathname: string): boolean {
  return normalizeRoutePath(pathname) === TRACKS_PATH;
}

// One creator-tools entry — the studio is the single workspace: tiles, units,
// and the UI-kit asset library are all categories within it. (The broader Design
// Index still lives at /design directly.)
const creatorTools: CreatorTool[] = [
  { label: 'Studio', href: '/studio', description: 'The creator workspace — browse tiles, units, the UI-kit asset library, and the artwork gallery, all in one place.' },
  { label: 'Artwork Compare', href: '/artwork-compare', description: 'Two-panel view — the accepted concept art beside the live screen, for matching the art direction.' },
  { label: 'Broadcast Monitor', href: 'https://ambience.romaine.life/?world=chess', description: 'Inspect the live menu-rain broadcast on ambience — the current scene, what is queued up next, and the event log. Opens in a new tab.', external: true },
];

function asset(file: string): string {
  // Use the shared UI kit's generated glyphs: icon-gear-generated.png -> kit/icons/gear.png
  return `/assets/ui/kit/icons/${file.replace(/^icon-/, '').replace(/-generated/, '')}`;
}

// Build / server provenance, stamped by vite.config buildInfo, surfaced in About so
// "which server/build am I actually on?" is summonable from one place — dev or prod.
// Every build carries the app's semver. In dev it also names the WORKTREE + commit +
// live port (a server from the wrong worktree reports its own name, so being on the
// wrong one is a glance, not a 2-hour hunt). In prod the deploy-time PR/commit is not
// knowable at build time (Docker has no .git) — it's fetched at runtime from
// /api/build-info (see BuildInfoRemote below).
declare const __BUILD_INFO__:
  | { mode: 'dev'; version: string; worktree: string; commit: string; dirty: boolean; startedAt: number }
  | { mode: 'prod'; version: string; commit: string; dirty: boolean }
  | undefined;

// Deploy-time provenance served by the backend from k8s env (backend/server.js
// GET /api/build-info; populated by build-and-deploy.yaml into k8s/values.yaml's
// `build:` block on each deploy). All fields optional — the endpoint never 500s and
// non-prod lanes leave it empty, so About degrades to just the baked app version.
type BuildInfoRemote = { prTitle?: string; prNumber?: string | number; prUrl?: string; commit?: string };

const BUILD_MONO: CSSProperties = { fontFamily: 'ui-monospace, monospace' };

function readMuted(): boolean {
  // Default OFF — music is muted until explicitly enabled (kept in sync with bgm.js
  // readMuted). Only an explicit 'false' (user turned it on) counts as un-muted.
  try { return localStorage.getItem(MUTE_KEY) !== 'false'; } catch { return true; }
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

// SettingsButton / SettingsRow / SettingsSection moved to ./shared/SettingsControls so the
// Editor (/editor) composes the SAME primitives instead of a bespoke parallel (ADR-0059).

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

export function Settings({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => tabFromPath(window.location.pathname));
  const [showTracks, setShowTracks] = useState<boolean>(() => isTracksView(window.location.pathname));
  // The INCOMING/target panel (switches immediately on a tab change). `previous` holds the
  // OUTGOING panel only during a crossfade, rendered stacked under `display` so the two
  // overlap-fade (old 1->0 while new 0->1) in one --ds-duration-fade pass (ADR-0046). The
  // rail highlight tracks activeTab directly, so the clicked tab lights instantly.
  const [display, setDisplay] = useState<{ tab: SettingsTab; tracks: boolean }>(() => ({
    tab: tabFromPath(window.location.pathname),
    tracks: isTracksView(window.location.pathname),
  }));
  const [previous, setPrevious] = useState<{ tab: SettingsTab; tracks: boolean } | null>(null);
  const [xfade, setXfade] = useState<'idle' | 'enter' | 'active'>('idle');
  // The origin the user opened Settings from (null on a direct URL open). Rendered as the
  // "‹ Back" control portaled into the title bar's trailing actions slot (below), and
  // THREADED through every in-Settings link (withReturnTo) so the ?returnTo param — and
  // thus that Back — survives each tab/tracks hop.
  const [returnTo, setReturnTo] = useState<string | null>(readValidatedReturnTo);
  const [muted, setMuted] = useState(readMuted());
  const [settings, setSettings] = useState<LocalSettings>(readLocalSettings);
  const [tracks, setTracks] = useState<BgmTrack[] | null>(null);
  const [tracksStatus, setTracksStatus] = useState('');
  const [disabledUrls, setDisabledUrls] = useState<string[]>(() => readDisabledUrls());
  // Mirrors disabledUrls so back-to-back toggles read the latest set, not a stale
  // render snapshot (otherwise rapid toggles clobber each other before re-render).
  const disabledRef = useRef<string[]>(disabledUrls);
  // The single BGM player owns playback; we just reflect its broadcast transport
  // state so the sounding row shows ■ Stop, paused music stays selected, and the
  // rest show ▶ Play.
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState>({
    playing: false,
    paused: false,
    currentUrl: null,
    otherTab: false,
    otherPaused: false,
    otherTitle: null,
  });
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [buildRemote, setBuildRemote] = useState<BuildInfoRemote | null>(null);
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('settings-art-active');
    return () => shell?.classList.remove('settings-art-active');
  }, []);

  useEffect(() => {
    // Bare /settings normalizes to the first section so the URL always names a tab.
    // The query string rides along — dropping it here would strip ?returnTo and kill Back.
    if (normalizeRoutePath(window.location.pathname) === '/settings') {
      navigateApp(`${TAB_PATHS.general}${window.location.search}`, { replace: true, scroll: false });
    }
    const sync = () => {
      setActiveTab(tabFromPath(window.location.pathname));
      setShowTracks(isTracksView(window.location.pathname));
      setReturnTo(readValidatedReturnTo());
    };
    window.addEventListener('popstate', sync);
    window.addEventListener(APP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(APP_NAVIGATION_EVENT, sync);
    };
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
    // Let the running SFX service pick up master-audio / effects-volume changes live
    // (it re-reads localStorage on this event), so the Effects slider takes effect
    // without a reload — the SFX analogue of the BGM mute-change event.
    window.dispatchEvent(new CustomEvent(SFX_SETTINGS_CHANGE_EVENT));
  }, [settings]);

  // Load the soundtrack list whenever the dedicated tracks view is opened. A fresh
  // fetch each entry (the backend caches for 5 min); `tracks === null` is the loading
  // state, an empty array means none / unavailable (disambiguated by tracksStatus).
  useEffect(() => {
    if (!showTracks) return;
    let active = true;
    setTracks(null);
    setTracksStatus('Loading tracks...');
    (async () => {
      try {
        const response = await fetch('/api/bgm');
        if (!response.ok) throw new Error(`bgm ${response.status}`);
        const payload = await response.json() as { tracks?: Array<Partial<BgmTrack>> };
        const nextTracks = Array.isArray(payload.tracks)
          ? payload.tracks
              .filter((track): track is BgmTrack => typeof track.title === 'string' && typeof track.url === 'string')
              .map((track) => ({
                title: track.title,
                url: track.url,
                artist: typeof track.artist === 'string' ? track.artist : undefined,
                album: typeof track.album === 'string' ? track.album : undefined,
              }))
          : [];
        if (!active) return;
        setTracks(nextTracks);
        setTracksStatus(nextTracks.length ? `${nextTracks.length} tracks loaded.` : 'No tracks are available.');
      } catch {
        if (!active) return;
        setTracks([]);
        setTracksStatus('Tracks are unavailable right now.');
      }
    })();
    return () => { active = false; };
  }, [showTracks]);

  // Reflect the BGM player's transport state so the current row distinguishes
  // sounding playback from paused/muted playback.
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<NowPlayingState>;
      setNowPlaying({
        playing: Boolean(detail.playing),
        paused: Boolean(detail.paused),
        currentUrl: detail.currentUrl ?? null,
        otherTab: Boolean(detail.otherTab),
        otherPaused: Boolean(detail.otherPaused),
        otherTitle: detail.otherTitle ?? null,
      });
    };
    window.addEventListener(BGM_STATE_EVENT, onState);
    return () => window.removeEventListener(BGM_STATE_EVENT, onState);
  }, []);

  // Deploy-time build provenance for About (prod only). Dev already knows its
  // worktree + commit from the baked __BUILD_INFO__, so it skips the call. Best-
  // effort and defensively parsed: any failure (no backend, non-JSON SPA fallback,
  // empty env) just leaves About showing the baked app version.
  useEffect(() => {
    const info = typeof __BUILD_INFO__ === 'undefined' ? undefined : __BUILD_INFO__;
    if (info?.mode === 'dev') return undefined;
    const controller = new AbortController();
    fetch('/api/build-info', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((res) => (res.ok && (res.headers.get('content-type') || '').includes('application/json') ? res.json() : null))
      .then((data) => { if (data && typeof data === 'object') setBuildRemote(data as BuildInfoRemote); })
      .catch(() => { /* provenance is chrome; never block or surface */ });
    return () => controller.abort();
  }, []);

  // Start a crossfade when the target menu changes: keep the current panel as `previous`,
  // swap `display` to the new one, and render both stacked. The data fetch keys off
  // showTracks, so the soundtrack list loads during the fade. Pure opacity = reduced-motion
  // safe (runs even with Windows animations off → Chrome `reduce`).
  useEffect(() => {
    if (display.tab === activeTab && display.tracks === showTracks) return;
    setPrevious(display);
    setDisplay({ tab: activeTab, tracks: showTracks });
    setXfade('enter');
  }, [activeTab, showTracks, display.tab, display.tracks]);

  // Drive enter -> active one frame later, so the start opacities (prev 1 / next 0) paint
  // before the transition runs — then the two overlap-fade simultaneously.
  useEffect(() => {
    if (xfade !== 'enter') return undefined;
    const raf = requestAnimationFrame(() => setXfade('active'));
    return () => cancelAnimationFrame(raf);
  }, [xfade]);

  // Once a crossfade has run its --ds-duration-fade pass, drop the outgoing layer. Keyed on
  // `previous` so a new tab click mid-fade cleanly restarts the timer (queue-last).
  useEffect(() => {
    if (!previous) return undefined;
    const timer = window.setTimeout(() => { setPrevious(null); setXfade('idle'); }, PANEL_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [previous]);

  const active = useMemo(() => tabs.find((tab) => tab.id === display.tab) || tabs[0], [display.tab]);

  const updateSetting = <Key extends keyof LocalSettings>(key: Key, value: LocalSettings[Key]) => {
    setConfirmingReset(false);
    setSettings((current) => ({ ...current, [key]: value }));
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

  const setTrackEnabled = (track: BgmTrack, enabled: boolean) => {
    const base = disabledRef.current;
    const next = enabled
      ? base.filter((url) => url !== track.url)
      : Array.from(new Set([...base, track.url]));
    disabledRef.current = next;
    setDisabledUrls(next);
    writeDisabledUrls(next); // persist + notify the running player
  };

  // Play/Shuffle start audio even when it was muted; reflect that in the controls so
  // they don't lie — turn Background Music (and Master Audio) back on to match.
  const restoreAudibleControls = () => {
    if (muted) { setMuted(false); writeMuted(false); }
    if (!settings.masterAudio) updateSetting('masterAudio', true);
  };

  const playTrack = (track: BgmTrack, playing: boolean) => {
    if (playing) { sendBgmCommand('stop'); return; }
    sendBgmCommand('play', track.url);
    restoreAudibleControls();
  };

  const shuffleTracks = () => {
    sendBgmCommand('shuffle');
    restoreAudibleControls();
  };

  const adjustScale = (delta: number) => {
    updateSetting('uiScale', clamp(settings.uiScale + delta, 90, 120, DEFAULT_SETTINGS.uiScale));
  };

  // The About → Build row. Dev keeps its worktree · commit line; prod shows the
  // baked semver plus the most recent PR (title links to the GitHub pull request),
  // with the deploy's short commit in the muted subtitle. Replaces the old
  // "(no-git) · <asset-hash>" line, which said nothing to a human.
  const buildInfo = typeof __BUILD_INFO__ === 'undefined' ? undefined : __BUILD_INFO__;
  let buildDetail: string;
  let buildValue: ReactNode;
  if (buildInfo?.mode === 'dev') {
    const port = window.location.port || 'default';
    buildDetail = `Local dev server · :${port} · started ${new Date(buildInfo.startedAt).toLocaleTimeString()}`;
    buildValue = (
      <span style={{ ...BUILD_MONO, fontSize: 12 }}>
        {`${buildInfo.worktree} · ${buildInfo.commit}${buildInfo.dirty ? '*' : ''}`}
      </span>
    );
  } else {
    const version = buildInfo?.version ? `v${buildInfo.version}` : '(unknown)';
    const commit = (buildRemote?.commit || '').trim();
    buildDetail = `Production build${commit ? ` · ${commit}` : ''}`;
    const prTitle = (buildRemote?.prTitle || '').trim();
    const prUrl = (buildRemote?.prUrl || '').trim();
    const prNumber = buildRemote?.prNumber != null ? String(buildRemote.prNumber).trim() : '';
    // Lead with #NNN so the durable PR handle survives the ellipsis on long titles;
    // the full title is on the tooltip and one click away.
    const prLabel = [prNumber ? `#${prNumber}` : '', prTitle].filter(Boolean).join(' ');
    const prClamp: CSSProperties = { maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    const prLink: CSSProperties = { ...prClamp, color: 'var(--ds-accent)' };
    buildValue = (
      <span style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={BUILD_MONO}>{version}</span>
        {prLabel ? <span aria-hidden style={{ opacity: 0.4 }}>·</span> : null}
        {prLabel
          ? (prUrl
              ? <a href={prUrl} target="_blank" rel="noreferrer noopener" title={prTitle || prLabel} style={prLink}>{prLabel}</a>
              : <span title={prTitle || prLabel} style={prClamp}>{prLabel}</span>)
          : null}
      </span>
    );
  }

  // Decorate an intra-settings href so the ?returnTo thread survives every hop —
  // rail tabs, View Tracks, and the tracks bar's ← Back. Drop it on any one of these
  // and the screen-level Back silently vanishes after that click.
  const withReturnTo = (path: string): string =>
    returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;

  // The track currently selected in the player, looked up in the loaded list by
  // the player's broadcast url — drives the permanent "Now Playing" row. Muting
  // pauses the current track; it does not clear the now-playing identity.
  const nowPlayingTrack = nowPlaying.currentUrl && tracks
    ? tracks.find((track) => track.url === nowPlaying.currentUrl) ?? null
    : null;
  const nowPlayingEyebrow = nowPlayingTrack
    ? [nowPlaying.paused ? 'Paused' : null, nowPlayingTrack.artist].filter(Boolean).join(' · ')
    : '';

  const renderGeneral = () => (
    <>
      <SettingsSection title="Interface">
        <SettingsRow
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
          <Toggle checked={settings.masterAudio} label="Toggle Master Audio" onChange={setMasterAudio} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Music">
        {/* Background-music on/off lives on the persistent title-bar mute control now
            (ADR-0044) — it drove the same MUTE_KEY as this row, so the row was a dup.
            Master Audio above is the all-sound master; this section keeps mix + tracks. */}
        <SettingsRow title="Music Volume" description="Set the target music mix for this browser.">
          <Slider
            value={settings.musicVolume}
            suffix="%"
            label="Music Volume"
            onChange={(next) => updateSetting('musicVolume', clamp(next, 0, 100, DEFAULT_SETTINGS.musicVolume))}
          />
          <SettingsButton href={withReturnTo(TRACKS_PATH)} ariaLabel="View the soundtrack track list">View Tracks</SettingsButton>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Effects">
        <SettingsRow title="Effects Volume" description="Set the target effects mix for this browser.">
          <Slider
            value={settings.effectsVolume}
            suffix="%"
            label="Effects Volume"
            onChange={(next) => updateSetting('effectsVolume', clamp(next, 0, 100, DEFAULT_SETTINGS.effectsVolume))}
          />
          <SettingsButton onClick={() => previewTerrain('water')} ariaLabel="Play a sample effect sound">Test</SettingsButton>
        </SettingsRow>
        <SettingsRow title="Interface Sounds" description="Enable or disable menu and control feedback sounds.">
          <Toggle checked={settings.interfaceSounds} label="Toggle Interface Sounds" onChange={(enabled) => updateSetting('interfaceSounds', enabled)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Notes">
        <SettingsRow
          title="Local Settings"
          description="Audio settings are saved on this device."
        />
      </SettingsSection>
    </>
  );

  // Dedicated soundtrack list, reached from the Music section's "View Tracks" pill.
  // Its own route (/settings/audio/tracks); the ← back (pinned outside the scroll
  // area, see the panel header below) returns to the Audio page.
  const renderTracks = () => (
    // The "Soundtrack" eyebrow is pinned in the panel header above; here we render
    // only the scrolling rows (reusing the section-rows chrome without its title).
    <section className="settings-section">
      <div className="settings-section-rows">
        {tracks === null ? (
          <SettingsRow title="Loading tracks…" description="Fetching the background music playlist." />
        ) : tracks.length === 0 ? (
          <SettingsRow
            title="No tracks to show"
            description={tracksStatus || 'No background music is configured for this environment.'}
          />
        ) : (
          tracks.map((track) => {
            const enabled = !disabledUrls.includes(track.url);
            const playing = nowPlaying.playing && nowPlaying.currentUrl === track.url;
            return (
              <SettingsRow
                key={track.url}
                eyebrow={track.artist}
                title={track.title}
              >
                <SettingsButton
                  onClick={() => playTrack(track, playing)}
                  ariaLabel={playing ? `Stop ${track.title}` : `Play ${track.title}`}
                >{playing ? '■ Stop' : '▶ Play'}</SettingsButton>
                <Toggle
                  checked={enabled}
                  label={`Include ${track.title} in background music`}
                  onChange={(value) => setTrackEnabled(track, value)}
                />
              </SettingsRow>
            );
          })
        )}
      </div>
    </section>
  );

  const renderGameplay = () => (
    <SettingsSection title="Gameplay">
      <SettingsRow
        title="Coming Soon"
        description="Gameplay settings are not available yet."
        value={<span>Locked</span>}
        tall
      />
    </SettingsSection>
  );

  const renderCreatorTools = () => (
    <>
      <SettingsSection title="Workspaces">
        {creatorTools.map((tool) => (
          <SettingsRow key={tool.href} title={tool.label} description={tool.description}>
            <SettingsButton tone="primary" href={tool.href} external={tool.external} ariaLabel={`Open ${tool.label}`}>Open</SettingsButton>
          </SettingsRow>
        ))}
      </SettingsSection>
      <SettingsSection title="About">
        <SettingsRow
          title="Build"
          description={buildDetail}
          value={buildValue}
        />
      </SettingsSection>
    </>
  );

  // One panel's content, by tab — used for BOTH the incoming and (during a crossfade) the
  // outgoing layer, so the two stack and overlap-fade in a single pass.
  const renderPanel = (d: { tab: SettingsTab; tracks: boolean }) => (
    <>
      {d.tab === 'general' ? renderGeneral() : null}
      {d.tab === 'audio' ? (d.tracks ? renderTracks() : renderAudio()) : null}
      {d.tab === 'gameplay' ? renderGameplay() : null}
      {d.tab === 'creator-tools' ? renderCreatorTools() : null}
    </>
  );

  // The two settings columns — sections (a tab column) + content (an action column). Shared by the
  // standalone route AND the embedded-in-shell render, so both stay identical.
  const inner = (
    <>
      <aside
        className={embedded ? 'menu-dest-col menu-dest-tabs' : 'settings-frame settings-rail-frame'}
        aria-label="Settings sections"
      >
        {tabs.map((tab, index) => (
          <NavButton
            data-chrome-unit="inner-box"
            key={tab.id}
            to={withReturnTo(TAB_PATHS[tab.id])}
            className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab', tab.id === activeTab && 'is-active')}
            // Position down the rail — drives the shared stone-continuity slice
            // (--tab-index, see .settings-tab in style.css) so the tabs read as one sheet (ADR-0063).
            style={{ ['--tab-index' as string]: index }}
            aria-current={tab.id === activeTab ? 'page' : undefined}
            onClick={() => setConfirmingReset(false)}
          >
            <span className="settings-tab-icon" aria-hidden="true">
              <img src={asset(tab.icon)} alt="" />
            </span>
            <FittedTabLabel>{tab.label}</FittedTabLabel>
          </NavButton>
        ))}
      </aside>

      <main className={embedded ? 'menu-dest-col menu-dest-action' : 'settings-frame settings-main-frame'}>
        {/* Screen + section are already shown by the brand lockup and the active
            nav button; a visible panel heading just duplicated them. Keep an
            accessible heading for screen-reader structure. */}
        <h2 className="sr-only">{active.label}</h2>
        {display.tracks ? (
              <div className="settings-tracks-bar">
                <div className="settings-tracks-bar-col">
                  <div className="settings-tracks-bar-actions">
                    <SettingsButton href={withReturnTo(TAB_PATHS.audio)} ariaLabel="Back to Audio settings">← Back</SettingsButton>
                    <SettingsButton onClick={shuffleTracks} ariaLabel="Shuffle and play the soundtrack">⇄ Shuffle</SettingsButton>
                  </div>
                  <section className="settings-row settings-nowplaying-row" aria-label="Now playing">
                    <div className="settings-row-copy">
                      <span className="settings-nowplaying-label">Now Playing</span>
                      {nowPlaying.otherTab ? (
                        <>
                          <span className="settings-row-eyebrow">{nowPlaying.otherPaused ? 'Paused in another tab' : 'Playing in another tab'}</span>
                          <h4 className="settings-nowplaying-empty">{nowPlaying.otherTitle ?? '—'}</h4>
                        </>
                      ) : nowPlayingTrack ? (
                        <>
                          {nowPlayingEyebrow ? <span className="settings-row-eyebrow">{nowPlayingEyebrow}</span> : null}
                          <h4>{nowPlayingTrack.title}</h4>
                        </>
                      ) : (
                        <h4 className="settings-nowplaying-empty">Nothing</h4>
                      )}
                    </div>
                  </section>
                  <h3 className="settings-section-title">Soundtrack</h3>
                </div>
              </div>
            ) : null}
            <KitScroll className="settings-scroll">
              <div className={`settings-panel-content settings-xfade-${xfade}`}>
                {previous ? (
                  <div className="settings-xfade-layer settings-xfade-prev" aria-hidden="true">
                    {renderPanel(previous)}
                  </div>
                ) : null}
                <div className="settings-xfade-layer settings-xfade-next">
                  {renderPanel(display)}
                </div>
              </div>
            </KitScroll>
      </main>
    </>
  );

  // The Settings route now usually renders inside MainMenu's persistent shell, but the
  // return affordance still belongs to Settings: it reads Settings' ?returnTo and portals
  // into the app title bar's actions slot. Keep it mounted in embedded mode too, or the
  // title-bar gear becomes a one-way trip from full-screen routes like a campaign game.
  const returnSlot = returnTo ? (
    <TitleBarSlot region="actions">
      <TitleBarActions aria-label="Settings navigation">
        <TitleBarButton variant="return" data-testid="settings-back" to={returnTo} title="Back to the previous screen">‹ Back</TitleBarButton>
      </TitleBarActions>
    </TitleBarSlot>
  ) : null;

  // Embedded in the persistent menu shell (MainMenu's second column): render the two columns
  // plus any title-bar portal content. The shell owns the backdrop, screen wrapper, and
  // zoom-safe placement. A standalone open still renders the full art-route below.
  if (embedded) return <>{returnSlot}{inner}</>;

  return (
    <section className="settings-art-route" aria-label="Settings" data-testid="settings">
      {/* Return control rides the title-bar actions slot (the app's nav home); shown only when the
          URL carries a valid origin. On a direct open the brand lockup is the way home. */}
      {returnSlot}
      {/* One continuous homepage backdrop (scene + synced rain), shared across the menu family (ADR-0064). */}
      <HomepageBackdrop />
      <div className="settings-screen app-shell-bar-pad">
        <ArtRouteChrome className="settings-shell">
          {inner}
        </ArtRouteChrome>
      </div>
    </section>
  );
}
