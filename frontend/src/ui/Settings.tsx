import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { readDisabledUrls, writeDisabledUrls, sendBgmCommand, BGM_STATE_EVENT } from '../bgmPrefs.js';
import { normalizeRoutePath, readValidatedReturnTo } from './navigation';
import { KitScroll } from './KitScroll';
import { SettingsButton, SettingsGroup, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { FittedTabLabel } from './shared/FittedTabLabel';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { TitleBarControlContribution } from './shell/TitleBarControls';
import { SFX_SETTINGS_CHANGE_EVENT, previewTerrain } from '../sfx';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { installedUiMedia } from './installedUiMedia';
import { useAuthSession } from '../net/authSession';
import { AdminControls } from './AdminControls';
import { ChromeNavButton } from './shared/ChromeButton';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { SettingsContentSceneSlot } from './shell/AuthoredSceneSlot';
import {
  DEFAULT_APP_SETTINGS,
  updateAppSettings,
  useAppSettings,
  type AppSettings,
} from '../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../settings/boardGridStyle';
import { RUN_CARD_BACK_LABELS } from '../settings/runCardBack';
import { PLAYER_PALETTE_LABELS } from '../settings/playerPalette';
import { PLAYER_PALETTES, type PlayerPalette } from '../core/pieces';
import { BoardGridStylePicker } from './shared/BoardGridStylePicker';
import { RunCardBackPicker } from './shared/RunCardBackPicker';
import { HouseSelect } from './shared/HouseSelect';
import { PieceTypeIcon } from './shared/PieceTypeIcon';

const MUTE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';
type SettingsTab = 'general' | 'audio' | 'gameplay' | 'creator-tools' | 'admin';
type VisibleSettingsTab = Exclude<SettingsTab, 'admin'>;

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
  id: VisibleSettingsTab;
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

const tabs: TabDefinition[] = [
  { id: 'general', label: 'General', icon: 'ui-kit-icons-gear-png' },
  { id: 'audio', label: 'Audio', icon: 'ui-kit-icons-speaker-png' },
  { id: 'gameplay', label: 'Gameplay', icon: 'ui-kit-icons-knight-png' },
  { id: 'creator-tools', label: 'Creator Tools', icon: 'ui-kit-icons-wrench-png' },
];

// Each settings section is its own route (/settings/<tab>) so it can be linked,
// reloaded, and back/forward-navigated. App.tsx mounts <Settings/> for the whole
// /settings/* subtree; the active tab is derived from the URL, not local state.
const TAB_PATHS: Record<VisibleSettingsTab, string> = {
  general: '/settings/general',
  audio: '/settings/audio',
  gameplay: '/settings/gameplay',
  'creator-tools': '/settings/creator-tools',
};

function tabFromPath(pathname: string): SettingsTab {
  // Match only the leading section segment, so deeper routes (e.g.
  // /settings/audio/tracks) still resolve to their owning tab and keep it lit.
  const id = normalizeRoutePath(pathname).match(/^\/settings\/([^/]+)/)?.[1];
  if (id === 'audio' || id === 'gameplay' || id === 'creator-tools' || id === 'general' || id === 'admin') return id;
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
  return installedUiMedia(file);
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

export function Settings({
  embedded = false,
  path = '/settings/general',
  search = '',
  sceneInstanceKey = 'settings/general',
}: {
  embedded?: boolean;
  path?: string;
  search?: string;
  sceneInstanceKey?: string;
} = {}): ReactElement {
  // The mounted authored scene path is the only visible-content authority.
  // Browser navigation requests a destination through App's director; Settings
  // never observes location/history to swap a panel ahead of that lifecycle.
  const activeTab = tabFromPath(path);
  const showTracks = isTracksView(path);
  const display = { tab: activeTab, tracks: showTracks };
  // The origin the user opened Settings from (null on a direct URL open). Rendered as the
  // "‹ Back" control contributed to the title bar's before-divider lane (below), and
  // THREADED through every in-Settings link (withReturnTo) so the ?returnTo param — and
  // thus that Back — survives each tab/tracks hop.
  const returnTo = readValidatedReturnTo(search);
  const [muted, setMuted] = useState(readMuted());
  const settings = useAppSettings();
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
  const authStatus = useAuthSession((session) => session.status);
  const adminAuth = {
    ready: authStatus?.reachable === true,
    isAdmin: authStatus?.reachable === true && authStatus.user.is_admin === true,
  };
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('settings-art-active');
    return () => shell?.classList.remove('settings-art-active');
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

  const active = useMemo(
    () => display.tab === 'admin'
      ? { id: 'admin' as const, label: 'Admin Controls', icon: '' }
      : tabs.find((tab) => tab.id === display.tab) || tabs[0],
    [display.tab],
  );

  const updateSetting = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => {
    setConfirmingReset(false);
    updateAppSettings((current) => ({ ...current, [key]: value }));
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
    updateAppSettings({ ...DEFAULT_APP_SETTINGS });
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
    updateSetting('uiScale', clamp(settings.uiScale + delta, 90, 120, DEFAULT_APP_SETTINGS.uiScale));
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

  // One stack, no eyebrows. Interface / Defaults / Administration were three named groups of ONE
  // row each, so every eyebrow restated the row under it — and each was bare text on the night
  // vista with nothing behind it. They are all General; the tab already says so.
  const renderGeneral = () => (
    <SettingsSection>
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
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </SettingsRow>
      <SettingsRow
        title="Reset to Defaults"
        description={confirmingReset ? 'Press reset again to confirm.' : 'Restore General and Audio settings for this browser.'}
        value={<span>{confirmingReset ? 'Confirm' : 'Ready'}</span>}
      >
        <SettingsButton tone="danger" onClick={resetDefaults}>Reset</SettingsButton>
      </SettingsRow>
      {adminAuth.isAdmin ? (
        <SettingsRow
          title="Admin Controls"
          description="Open playtest interventions for the active Battle or Run."
        >
          <SettingsButton tone="primary" href={withReturnTo('/settings/admin')} ariaLabel="Open Admin Controls">
            Open
          </SettingsButton>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );

  // Master, Music and Notes were named groups of one row, so their eyebrows only restated the row.
  // Effects genuinely holds two settings, so it keeps its name — in a BOX, where the name has a
  // surface, rather than as bare text on the vista. Inside it the rows are members: unframed, told
  // apart by the kit's divider, and "Effects Volume" is just "Volume" because the box says Effects.
  const renderAudio = () => (
    <SettingsSection>
      <SettingsRow title="Master Audio" description="Mute or restore all browser audio for Chess Tactics.">
        <Toggle checked={settings.masterAudio} label="Toggle Master Audio" onChange={setMasterAudio} fillSurface={CHROME_LEAF_FILL_SURFACE} />
      </SettingsRow>
      {/* Background-music on/off lives on the persistent title-bar mute control now
          (ADR-0044) — it drove the same MUTE_KEY as this row, so the row was a dup.
          Master Audio above is the all-sound master; this row keeps mix + tracks. */}
      <SettingsRow title="Music Volume" description="Set the target music mix for this browser.">
        <Slider
          value={settings.musicVolume}
          suffix="%"
          label="Music Volume"
          onChange={(next) => updateSetting('musicVolume', clamp(next, 0, 100, DEFAULT_APP_SETTINGS.musicVolume))}
        />
        <SettingsButton href={withReturnTo(TRACKS_PATH)} ariaLabel="View the soundtrack track list">View Tracks</SettingsButton>
      </SettingsRow>
      <SettingsGroup
        title="Effects"
        titleId="settings-effects-title"
        members={[
          {
            id: 'effects-volume',
            content: (
              <SettingsRow framed={false} title="Volume" description="Set the target effects mix for this browser.">
                <Slider
                  value={settings.effectsVolume}
                  suffix="%"
                  label="Effects Volume"
                  onChange={(next) => updateSetting('effectsVolume', clamp(next, 0, 100, DEFAULT_APP_SETTINGS.effectsVolume))}
                />
                <SettingsButton onClick={() => previewTerrain('water')} ariaLabel="Play a sample effect sound">Test</SettingsButton>
              </SettingsRow>
            ),
          },
          {
            id: 'interface-sounds',
            content: (
              <SettingsRow framed={false} title="Interface Sounds" description="Enable or disable menu and control feedback sounds.">
                <Toggle checked={settings.interfaceSounds} label="Toggle Interface Sounds" onChange={(enabled) => updateSetting('interfaceSounds', enabled)} fillSurface={CHROME_LEAF_FILL_SURFACE} />
              </SettingsRow>
            ),
          },
        ]}
      />
      <SettingsRow
        title="Local Settings"
        description="Audio settings are saved on this device."
      />
    </SettingsSection>
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
                  fillSurface={CHROME_LEAF_FILL_SURFACE}
                />
              </SettingsRow>
            );
          })
        )}
      </div>
    </section>
  );

  const renderGameplay = () => (
    <SettingsSection>
      {/* Only the two player palettes are offered. The rest of the catalog is reserved for
          opponents, so the color on the pieces you command is never on the pieces you fight.
          The choice is shown as the accepted battlefield pawn in that set rather than as its
          name: this picks how the player's army LOOKS, so it is judged by sight, and a colour
          word cannot be compared against the sprite it actually produces. */}
      <SettingsRow
        title="Your color"
        description={PLAYER_PALETTE_LABELS[settings.playerPalette].detail}
      >
        <HouseSelect<PlayerPalette>
          value={settings.playerPalette}
          options={PLAYER_PALETTES.map((palette) => ({
            value: palette,
            title: PLAYER_PALETTE_LABELS[palette].label,
            label: (
              <span className="settings-piece-choice">
                <PieceTypeIcon type="pawn" palette={palette} className="settings-piece-choice-icon" />
                <span className="sr-only">{PLAYER_PALETTE_LABELS[palette].label}</span>
              </span>
            ),
          }))}
          ariaLabel={`Your piece color — ${PLAYER_PALETTE_LABELS[settings.playerPalette].label}`}
          testId="settings-player-palette"
          onChange={(palette) => updateSetting('playerPalette', palette)}
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </SettingsRow>
      {/* Showing or hiding the grid is a per-battle decision and already lives on the in-game HUD's
          Grid toggle, so it is not duplicated here. This row is only what the grid LOOKS like. */}
      <SettingsRow
        title="Grid style"
        description={BOARD_GRID_STYLE_LABELS[settings.boardGridStyle].detail}
        className="settings-row-stacked-control"
        tall
      >
        <BoardGridStylePicker
          value={settings.boardGridStyle}
          onChange={(style) => updateSetting('boardGridStyle', style)}
        />
      </SettingsRow>
      {/* The back is on every face-down card in the Run — the Deployment stack and the pile under
          every Sectio offer — so it is the most-seen single picture in the mode. It changes nothing
          about play, which is why it sits here as a look rather than anywhere near the rules, and
          why it is chosen by sight like the two rows above it. */}
      <SettingsRow
        title="Card back"
        description={RUN_CARD_BACK_LABELS[settings.runCardBack].detail}
        className="settings-row-stacked-control"
        tall
      >
        <RunCardBackPicker
          value={settings.runCardBack}
          onChange={(back) => updateSetting('runCardBack', back)}
        />
      </SettingsRow>
      <SettingsRow
        title="Draw automatically"
        description="Draw the Deployment hand as soon as the battlefield is ready."
      >
        <Toggle
          checked={settings.autoDealDeployment}
          label="Draw Deployment cards automatically"
          onChange={(value) => updateSetting('autoDealDeployment', value)}
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </SettingsRow>
    </SettingsSection>
  );

  const renderCreatorTools = () => (
    <>
      <SettingsSection>
        {creatorTools.map((tool) => (
          <SettingsRow key={tool.href} title={tool.label} description={tool.description}>
            <SettingsButton tone="primary" href={tool.href} external={tool.external} ariaLabel={`Open ${tool.label}`}>Open</SettingsButton>
          </SettingsRow>
        ))}
      </SettingsSection>
      <SettingsSection>
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
      {d.tab === 'admin' ? <AdminControls authReady={adminAuth.ready} isAdmin={adminAuth.isAdmin} /> : null}
    </>
  );

  // The two settings columns — sections (a tab column) + content (an action column). Shared by the
  // standalone route AND the embedded-in-shell render, so both stay identical.
  const inner = (
    <>
      <ApparatusRailColumn
        className={embedded ? 'menu-dest-col menu-dest-tabs' : 'settings-frame settings-rail-frame'}
        placement={embedded ? 'open' : 'framed'}
        aria-label="Settings sections"
      >
        {tabs.map((tab, index) => (
          <ApparatusRailTab
            key={tab.id}
            label={tab.label}
            to={withReturnTo(TAB_PATHS[tab.id])}
            // Position down the rail — drives the shared stone-continuity slice so the tabs
            // read as one sheet (ADR-0063). The primitive owns the seat and the slice now.
            index={index}
            active={tab.id === activeTab}
            iconSrc={asset(tab.icon)}
            onSelect={() => setConfirmingReset(false)}
          />
        ))}
      </ApparatusRailColumn>

      <SettingsContentSceneSlot
        className={embedded ? 'menu-dest-col menu-dest-action' : 'settings-frame settings-main-frame'}
        sceneInstance={sceneInstanceKey}
      >
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
              <div className="settings-panel-content">
                <div className="settings-panel-layer">
                  {renderPanel(display)}
                </div>
              </div>
            </KitScroll>
      </SettingsContentSceneSlot>
    </>
  );

  // The Settings route now usually renders inside MainMenu's persistent shell, but the
  // return affordance still belongs to Settings: it reads Settings' ?returnTo and contributes
  // typed navigation intent before the app title bar's divider. Keep it mounted in embedded mode too, or the
  // title-bar gear becomes a one-way trip from full-screen routes like a campaign game.
  const returnControl = returnTo ? (
    <TitleBarControlContribution
      ariaLabel="Settings navigation"
      controls={[{
        id: 'settings-back',
        kind: 'navigation',
        presentation: 'return',
        label: '‹ Back',
        destination: returnTo,
        title: 'Back to the previous screen',
        testId: 'settings-back',
      }]}
    />
  ) : null;

  // Embedded in the persistent menu shell (MainMenu's second column): render the two columns
  // plus any title-bar portal content. The shell owns the backdrop, screen wrapper, and
  // zoom-safe placement. A standalone open still renders the full art-route below.
  if (embedded) return <>{returnControl}{inner}</>;

  return (
    <section className="settings-art-route" aria-label="Settings" data-testid="settings">
      {/* Return control rides the typed title-bar lane (the app's nav home); shown only when the
          URL carries a valid origin. On a direct open the brand lockup is the way home. */}
      {returnControl}
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
