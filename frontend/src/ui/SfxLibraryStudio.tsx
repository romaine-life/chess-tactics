import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  cloneSfxProfile,
  currentLiveSfxProfileDocument,
  assertSfxProfile,
  type SfxProfile,
  type SfxProfileDocument,
  type SfxSoundSetProfile,
} from '../core/sfxProfile';
import {
  auditionDecodedCandidateRaw,
  auditionSampleRaw,
  isSampleReady,
  loadAuthoredSamples,
  loadCandidateSampleRaw,
  previewSample,
  type DecodedCandidateAudio,
  type DecodedAudioSummary,
  type SampleKey,
} from '../sfx';
import {
  encodePcm16Wav,
  pcmFromAudioBuffer,
  pcmWaveformPeaks,
  resolvePcmTrim,
} from '../sfxTrim';
import { sfxSampleWaveform, sfxSampleWaveformCached } from '../sfxWaveform';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import {
  acceptLiveMediaVersions,
  createLiveMediaVersion,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  uploadLiveMediaVersionContent,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { loadLiveMediaCatalog } from '../net/liveMedia';
import { fetchLiveSfxProfile, saveLiveSfxProfile } from '../net/sfxProfile';
import { ASSIGNABLE_TERRAINS, sfxAssets, type SfxAsset } from './sfxCatalog';
import { AudioWaveform } from './shared/AudioWaveform';

// Local storage is a crash/reload draft only. The running game and the reset
// baseline always read the backend document, and Save performs a revision-CAS PUT.
const PROFILE_DRAFT_KEY = 'chess-tactics-sfx-profile-draft-v1';

interface StoredDraft { baseRevision: number; data: SfxProfile }

function loadDraft(document: SfxProfileDocument): SfxProfile {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_DRAFT_KEY) || 'null') as StoredDraft | null;
    if (parsed?.baseRevision === document.revision && parsed.data && typeof parsed.data === 'object') {
      assertSfxProfile(parsed.data);
      return cloneSfxProfile(parsed.data);
    }
  } catch { /* stale/malformed draft -> exact live profile */ }
  return cloneSfxProfile(document.data);
}

// The SFX assignment editor (terrain→sound + the arrival thump) shown above the grid.
function SfxAssignmentPanel({
  document,
  onSaved,
}: {
  document: SfxProfileDocument;
  onSaved: (next: SfxProfileDocument) => void;
}): ReactElement {
  const [draft, setDraft] = useState<SfxProfile>(() => loadDraft(document));
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const soundKeys = useMemo(() => Object.keys(draft.soundSets).sort(), [draft.soundSets]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(document.data);

  useEffect(() => {
    try {
      if (dirty) window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify({ baseRevision: document.revision, data: draft }));
      else window.localStorage.removeItem(PROFILE_DRAFT_KEY);
    } catch { /* draft persistence is best-effort */ }
  }, [document.revision, draft, dirty]);

  const setOne = (terrain: (typeof ASSIGNABLE_TERRAINS)[number], key: string) => setDraft((current) => ({
    ...current,
    terrainAssignments: { ...current.terrainAssignments, [terrain]: key || null },
  }));
  const setArrival = (patch: Partial<SfxProfile['arrival']>) => setDraft((current) => ({
    ...current,
    arrival: { ...current.arrival, ...patch },
  }));
  const setSound = (key: string, patch: Partial<SfxSoundSetProfile>) => setDraft((current) => ({
    ...current,
    soundSets: { ...current.soundSets, [key]: { ...current.soundSets[key], ...patch } },
  }));
  const reset = () => { setDraft(cloneSfxProfile(document.data)); setStatus('Draft reset to live profile.'); };
  const miniReset = (onReset: () => void, atSaved: boolean, what: string): ReactElement => (
    <button type="button" className="tileset-view-action" title={`Reset ${what} to current`} aria-label={`Reset ${what} to current`}
      disabled={atSaved} onClick={onReset} style={{ minWidth: 30, opacity: atSaved ? 0.4 : 1 }}>↺</button>
  );
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setStatus('Saving…');
    try {
      const saved = await saveLiveSfxProfile(draft, document.revision);
      setDraft(cloneSfxProfile(saved.data));
      onSaved(saved);
      try { window.localStorage.removeItem(PROFILE_DRAFT_KEY); } catch { /* ignore */ }
      setStatus(`Saved live profile revision ${saved.revision}.`);
    } catch (error) {
      const code = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      setStatus(code === 409 ? 'Save conflict: reload the current live profile and reapply this draft.'
        : code === 401 ? 'Sign in to save the live SFX profile.'
          : code === 403 ? 'Admin access is required to save the live SFX profile.'
            : 'Save failed; the local draft is still preserved.');
    } finally {
      setSaving(false);
    }
  };

  const label: CSSProperties = { color: 'var(--ds-ink-1, #ecedf2)', textTransform: 'capitalize' };
  const heading: CSSProperties = { margin: 0, color: '#72bde8', font: '800 12px/1.3 var(--ds-font-sans, system-ui, sans-serif)', letterSpacing: 0.6, textTransform: 'uppercase' };
  const note: CSSProperties = { margin: 0 };
  const rows: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '6px 12px', alignItems: 'center', maxWidth: 460 };

  return (
    <div aria-label="Sound assignments" style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={heading}>Sound sets</h2>
        <p className="tileset-catalog-note" style={note}>Backend-owned labels, descriptions, and mix trims for each recorded set.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          {soundKeys.map((key) => {
            const sound = draft.soundSets[key];
            const saved = document.data.soundSets[key];
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px auto', gap: 8, alignItems: 'center' }}>
                <strong style={label}>{key}</strong>
                <input value={sound.label} onChange={(event) => setSound(key, { label: event.target.value })} aria-label={`${key} label`} />
                <input type="range" min={0} max={2} step={0.05} value={sound.gain}
                  onChange={(event) => setSound(key, { gain: Number(event.target.value) })} aria-label={`${key} gain`} />
                <span>{Math.round(sound.gain * 100)}%</span>
                <span />
                <input value={sound.character} onChange={(event) => setSound(key, { character: event.target.value })} aria-label={`${key} character`} />
                <button type="button" className="tileset-view-action" onClick={() => previewSample(key, 1, sound.gain)}>▶</button>
                {miniReset(() => setSound(key, saved), JSON.stringify(sound) === JSON.stringify(saved), `${key} metadata`) }
                <span />
                <input value={sound.build} onChange={(event) => setSound(key, { build: event.target.value })} aria-label={`${key} build`} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={heading}>Terrain sounds</h2>
        <p className="tileset-catalog-note" style={note}>
          Which recorded sound voices each terrain. Changes remain a local draft until Save.
        </p>
        <div style={rows}>
          {ASSIGNABLE_TERRAINS.map((t) => (
            <Fragment key={t}>
              <span style={label}>{t}</span>
              <select value={draft.terrainAssignments[t] ?? ''} onChange={(e) => setOne(t, e.target.value)} aria-label={`Sound for ${t}`} style={{ width: '100%' }}>
                <option value="">— silent —</option>
                {soundKeys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <button
                type="button"
                className="tileset-view-action"
                disabled={!draft.terrainAssignments[t]}
                onClick={() => { const key = draft.terrainAssignments[t]; if (key) previewSample(key, 1, draft.soundSets[key].gain); }}
                aria-label={`Play the sound assigned to ${t}`}
              >▶</button>
              {miniReset(() => setOne(t, document.data.terrainAssignments[t] ?? ''), draft.terrainAssignments[t] === document.data.terrainAssignments[t], t)}
            </Fragment>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={heading}>Arrival (on deploy)</h2>
        <p className="tileset-catalog-note" style={note}>The thump layered over the terrain sound as a unit lands on the board.</p>
        <div style={rows}>
          <span style={label}>Sound</span>
          <select value={draft.arrival.sample ?? ''} onChange={(e) => setArrival({ sample: e.target.value || null })} aria-label="Arrival sound" style={{ width: '100%' }}>
            <option value="">— none (no thump) —</option>
            {soundKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button
            type="button"
            className="tileset-view-action"
            disabled={!draft.arrival.sample}
            onClick={() => { const key = draft.arrival.sample; if (key) previewSample(key, draft.arrival.gain, draft.soundSets[key].gain); }}
            aria-label="Play the arrival sound at its volume"
          >▶</button>
          {miniReset(() => setArrival({ sample: document.data.arrival.sample }), draft.arrival.sample === document.data.arrival.sample, 'arrival sound')}

          <span style={label}>Volume</span>
          <input
            type="range" min={0} max={2} step={0.05} value={draft.arrival.gain}
            onChange={(e) => setArrival({ gain: Number(e.target.value) })}
            aria-label="Arrival volume" style={{ width: '100%' }}
          />
          <span style={{ color: 'var(--ds-ink-2, #aeb4c2)', minWidth: 34, textAlign: 'right' }}>{Math.round(draft.arrival.gain * 100)}%</span>
          {miniReset(() => setArrival({ gain: document.data.arrival.gain }), draft.arrival.gain === document.data.arrival.gain, 'arrival volume')}

          <span style={label}>Firing</span>
          <select value={draft.arrival.firing} onChange={(e) => setArrival({ firing: e.target.value as SfxProfile['arrival']['firing'] })} aria-label="Arrival firing mode" style={{ width: '100%' }}>
            <option value="per-unit">per-unit (staggered)</option>
            <option value="once">once (whole squad)</option>
          </select>
          <span />
          {miniReset(() => setArrival({ firing: document.data.arrival.firing }), draft.arrival.firing === document.data.arrival.firing, 'arrival firing')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="tileset-view-action" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save live profile'}</button>
        <button type="button" className="tileset-view-action" disabled={!dirty || saving} onClick={reset}>Reset draft</button>
        {status ? <span role="status" className="tileset-catalog-note">{status}</span> : null}
      </div>
    </div>
  );
}

// Read-only catalog for the landing sound effects (ADR-0029 catalog requirements). Each
// card shows the sound's real recorded waveform and auditions it on click; the Viewer
// plays it big with a Details readout. "Read-only" constrains editability, not liveness —
// the whole point is to hear it. Every effect is authored foley (the recorded take's
// envelope is the card art). Reuses the shared studio card classes so it matches the grids.

/** Audition an asset live: the arrival thump, a terrain's landing sound, or any other set. */
function auditionAsset(asset: SfxAsset): void {
  previewSample(asset.sampleKey);
}

/** Normalized peaks for an asset, from the longest decoded take of its sample set. */
function useSfxPeaks(asset: SfxAsset, bars: number): number[] {
  const [peaks, setPeaks] = useState<number[]>(() => sfxSampleWaveformCached(asset.sampleKey, bars) ?? []);
  useEffect(() => {
    const ready = sfxSampleWaveformCached(asset.sampleKey, bars);
    if (ready) { setPeaks(ready); return; }
    let alive = true;
    void sfxSampleWaveform(asset.sampleKey, bars).then((p) => { if (alive) setPeaks(p); });
    return () => { alive = false; };
  }, [asset.sampleKey, bars]);
  return peaks;
}

/** Live amplitude envelope of an effect, drawn as centered SVG bars. */
function SfxWaveform({ asset, bars = 56 }: { asset: SfxAsset; bars?: number }): ReactElement {
  const peaks = useSfxPeaks(asset, bars);
  return <AudioWaveform peaks={peaks} bars={bars} />;
}

export function SfxLibraryStudio({
  search,
  zoom,
  selected,
  onSelect,
  selectedReviewId,
  onSelectReview,
  onViewReview,
}: {
  search: string;
  zoom: number;
  selected?: string;
  onSelect: (name: string) => void;
  selectedReviewId?: string;
  onSelectReview: (versionId: string) => void;
  onViewReview: (versionId: string) => void;
}): ReactElement {
  const [candidateCatalog, setCandidateCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [candidateStatus, setCandidateStatus] = useState('Loading editable recordings…');
  useEffect(() => {
    let alive = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => {
        if (!alive) return;
        setCandidateCatalog(next);
        setCandidateStatus('');
      })
      .catch((error) => {
        if (!alive) return;
        setCandidateStatus(error instanceof Error
          ? `Editable recordings unavailable: ${error.message}`
          : 'Editable recordings unavailable.');
      });
    return () => { alive = false; };
  }, []);
  const q = search.trim().toLowerCase();
  const assets = sfxAssets();
  const visible = assets.filter((s) => !q || [s.label, ...s.terrains, s.character, s.build].join(' ').toLowerCase().includes(q));
  const candidates = editableSfxCandidates(candidateCatalog);
  const visibleCandidates = candidates.filter((candidate) => {
    if (!q) return true;
    const profile = recordValue(candidate.metadata.profile);
    const source = recordValue(candidate.provenance.source);
    return [
      candidate.label,
      candidate.slot ?? '',
      typeof profile?.label === 'string' ? profile.label : '',
      typeof profile?.character === 'string' ? profile.character : '',
      typeof source?.title === 'string' ? source.title : '',
      typeof source?.url === 'string' ? source.url : '',
    ].join(' ').toLowerCase().includes(q);
  });
  // Catalog main is CONTENT ONLY — a single internally-scrolling grid, no sub-headers
  // (docs/studio-control-architecture.md). The terrain→sound assignment editor is a
  // control surface and lives in the Viewer 'sfx' kind (see SfxViewer), not here.
  return (
    <div className="tileset-studio-grid surface-grid" aria-label="Sound Effects">
      {visibleCandidates.map((candidate) => {
        const profile = recordValue(candidate.metadata.profile);
        const runtime = recordValue(candidate.metadata.runtime);
        const editorSource = recordValue(candidate.metadata.editorSource);
        const label = typeof profile?.label === 'string' && profile.label.trim()
          ? profile.label
          : candidate.label;
        const durationMs = typeof runtime?.durationMs === 'number' && Number.isFinite(runtime.durationMs)
          ? runtime.durationMs
          : null;
        const kind = editorSource?.requireTrim === true ? 'Complete source' : 'Candidate cut';
        return (
          <StudioCatalogCard
            key={candidate.id}
            title={label}
            badge={candidate.slot}
            selected={candidate.id === selectedReviewId}
            onSelect={() => onSelectReview(candidate.id)}
            onOpen={() => onViewReview(candidate.id)}
            ariaLabel={`${label}, ${kind}${durationMs === null ? '' : `, ${(durationMs / 1000).toFixed(3)} seconds`}`}
            titleText={`${candidate.label} — select, then open in the trim editor`}
            imageStyle={{
                '--tile-zoom': zoom,
                minHeight: `${Math.round(80 * zoom)}px`,
                display: 'grid',
                placeContent: 'center',
                gap: 4,
                textAlign: 'center',
              } as CSSProperties}
            media={<>
              <strong>{kind}</strong>
              <span>{durationMs === null ? 'Duration unavailable' : `${(durationMs / 1000).toFixed(3)} s`}</span>
            </>}
          />
        );
      })}
      {visible.map((s) => (
        <StudioCatalogCard
          key={s.name}
          title={s.label}
          badge={s.character}
          selected={s.name === selected}
          onSelect={() => { onSelect(s.name); auditionAsset(s); }}
          titleText={`${s.label} — click to hear`}
          imageClassName="sfx-card-wave"
          imageStyle={{ '--tile-zoom': zoom, color: 'var(--ds-accent, #7ea2ff)', height: `${Math.round(80 * zoom)}px` } as CSSProperties}
          media={<SfxWaveform asset={s} />}
        />
      ))}
      {candidateStatus ? <p className="tileset-studio-empty" role="status">{candidateStatus}</p> : null}
      {assets.length === 0 && candidates.length === 0 && !candidateStatus
        ? <p className="tileset-studio-empty">The live SFX profile is unavailable. Gameplay remains intentionally silent.</p>
        : visible.length === 0 && visibleCandidates.length === 0 && !candidateStatus
          ? <p className="tileset-studio-empty">No sound effects match.</p>
          : null}
    </div>
  );
}

export function editableSfxCandidates(catalog: AdminLiveMediaCatalog | null): AdminLiveMediaVersion[] {
  return (catalog?.versions ?? [])
    .filter((version) => (
      version.status === 'candidate'
      && version.domain === 'sfx'
      && Boolean(version.media)
      && /^sfx\/[a-z0-9][a-z0-9_-]{0,63}\/v[0-9]+\.[a-z0-9]+$/.test(version.slot ?? '')
    ))
    .sort((a, b) => (
      Number(recordValue(b.metadata.editorSource)?.requireTrim === true)
      - Number(recordValue(a.metadata.editorSource)?.requireTrim === true)
      || b.createdAt.localeCompare(a.createdAt)
    ));
}

// The 'sfx' Viewer kind owns two URL-addressable editing states in the same stable
// Studio shell. With `sfxReview=<version-id>`, its main stage is the exact candidate
// waveform and its fixed Controls rail owns trim/audition/save/approval. Without a
// candidate it is the global sound-assignment editor (terrain map + arrival thump).
// Neither state injects controls above the other or moves the shell regions.
// Interface-click test + diagnostic. The UI tap is gated in-app by Settings → Audio (Master
// Audio / Effects Volume / Interface Sounds); the "raw" audition here BYPASSES those gates so
// you can confirm the sound exists even when your mix is down — and the readout shows which
// gate would be muting the in-app clicks (the usual reason "I hear nothing").
const INTERFACE_SETTINGS_KEY = 'chess-tactics-settings-v1';
function readAudioGates(): { effectsVolume: number; masterAudio: boolean; interfaceSounds: boolean } {
  try {
    const p = JSON.parse(window.localStorage.getItem(INTERFACE_SETTINGS_KEY) || '{}') as Record<string, unknown>;
    return {
      effectsVolume: typeof p.effectsVolume === 'number' ? p.effectsVolume : 80,
      masterAudio: p.masterAudio !== false,
      interfaceSounds: p.interfaceSounds !== false,
    };
  } catch { return { effectsVolume: 80, masterAudio: true, interfaceSounds: true }; }
}

function InterfaceSoundPanel(): ReactElement {
  const [ready, setReady] = useState<boolean>(() => isSampleReady('click'));
  const [dur, setDur] = useState<number | null>(null);
  const [gates, setGates] = useState(() => readAudioGates());
  useEffect(() => {
    let alive = true;
    void loadAuthoredSamples('click').then((bufs) => {
      if (!alive) return;
      setReady(bufs.length > 0);
      setDur(bufs[0] ? +bufs[0].duration.toFixed(2) : null);
    });
    return () => { alive = false; };
  }, []);
  const heading: CSSProperties = { margin: 0, color: '#72bde8', font: '800 12px/1.3 var(--ds-font-sans, system-ui, sans-serif)', letterSpacing: 0.6, textTransform: 'uppercase' };
  const ok = (b: boolean) => (b ? '✓' : '✗');
  return (
    <div aria-label="Interface click" style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
      <h2 style={heading}>Interface click (UI feedback)</h2>
      <p className="tileset-catalog-note" style={{ margin: 0 }}>
        The tap played on every button/menu click. <strong>Play (raw)</strong> ignores your mix so you can hear the sound itself; <strong>Play (in-game)</strong> respects the Audio settings, exactly like a real click.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="tileset-view-action" onClick={() => auditionSampleRaw('click')}>▶ Play (raw)</button>
        <button type="button" className="tileset-view-action" onClick={() => previewSample('click')}>▶ Play (in-game)</button>
        <span style={{ color: ready ? '#7bd88f' : '#e6a86b', fontSize: 12 }}>
          {ready ? `take loaded${dur ? ` · ${dur}s` : ''}` : 'take NOT loaded — hard-reload (Ctrl+Shift+R)'}
        </span>
      </div>
      <p className="tileset-catalog-note" style={{ margin: 0, fontSize: 12 }}>
        In-app clicks sound only when all of: Master Audio {ok(gates.masterAudio)} · Effects Volume {gates.effectsVolume}% {ok(gates.effectsVolume > 0)} · Interface Sounds {ok(gates.interfaceSounds)}.{' '}
        <button type="button" className="tileset-view-action" onClick={() => setGates(readAudioGates())}>refresh</button>
      </p>
    </div>
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function candidateSoundSetKey(version: AdminLiveMediaVersion): string | null {
  const match = /^sfx\/([a-z0-9][a-z0-9_-]{0,63})\/v[0-9]+\.[a-z0-9]+$/.exec(version.slot ?? '');
  return match?.[1] ?? null;
}

function candidateSoundSetProfile(version: AdminLiveMediaVersion): SfxSoundSetProfile | null {
  const profile = recordValue(version.metadata.profile);
  if (
    !profile
    || typeof profile.label !== 'string' || !profile.label.trim()
    || typeof profile.character !== 'string' || !profile.character.trim()
    || typeof profile.build !== 'string' || !profile.build.trim()
    || typeof profile.gain !== 'number' || !Number.isFinite(profile.gain)
    || profile.gain < 0 || profile.gain > 2
  ) return null;
  return {
    label: profile.label,
    character: profile.character,
    build: profile.build,
    gain: profile.gain,
  };
}

const SFX_TRIM_MIN_MS = 20;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const exact = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', exact.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function secondsLabel(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(3)} s`;
}

function SfxCandidateEditor({
  versionId,
  header,
  onProfileSaved,
}: {
  versionId: string;
  header?: ReactNode;
  onProfileSaved: (document: SfxProfileDocument) => void;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [audio, setAudio] = useState<DecodedCandidateAudio | null>(null);
  const [auditionedExact, setAuditionedExact] = useState<DecodedAudioSummary | null>(null);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [status, setStatus] = useState('Loading private candidate…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setCatalog(null);
    setAudio(null);
    setAuditionedExact(null);
    setTrimStartMs(0);
    setTrimEndMs(0);
    setStatus('Loading private candidate…');
    void (async () => {
      try {
        const next = await fetchAdminLiveMediaCatalog();
        if (!alive) return;
        const selected = next.versions.find((item) => item.id === versionId);
        setCatalog(next);
        if (!selected?.media?.url) throw new Error('That SFX candidate has no audio bytes');
        setStatus('Decoding the exact candidate bytes…');
        const loaded = await loadCandidateSampleRaw(selected.media.url);
        if (!alive) return;
        setAudio(loaded);
        setTrimEndMs(loaded.summary.durationMs);
        setStatus(`Ready to trim · ${loaded.summary.durationMs} ms · ${loaded.summary.sampleRate} Hz · ${loaded.summary.channels === 1 ? 'mono' : `${loaded.summary.channels} channels`}.`);
      } catch (error) {
        if (!alive) return;
        setStatus(error instanceof Error ? error.message : 'Admin access is required to edit this SFX candidate.');
      }
    })();
    return () => { alive = false; };
  }, [versionId]);

  const version = catalog?.versions.find((item) => item.id === versionId) ?? null;
  const slot = version?.slot
    ? catalog?.slots.find((item) => item.slot === version.slot) ?? null
    : null;
  const soundSetKey = version ? candidateSoundSetKey(version) : null;
  const soundSetProfile = version ? candidateSoundSetProfile(version) : null;
  const editorSource = version ? recordValue(version.metadata.editorSource) : null;
  const requiresTrim = editorSource?.requireTrim === true;
  const pcm = useMemo(() => audio ? pcmFromAudioBuffer(audio.buffer) : null, [audio]);
  const trim = useMemo(
    () => pcm ? resolvePcmTrim(pcm, trimStartMs, trimEndMs) : null,
    [pcm, trimEndMs, trimStartMs],
  );
  const peaks = useMemo(() => pcm ? pcmWaveformPeaks(pcm, 180) : [], [pcm]);
  const totalMs = audio?.summary.durationMs ?? 0;
  const minimumRangeMs = Math.min(SFX_TRIM_MIN_MS, totalMs);
  const trimDirty = Boolean(audio && (trimStartMs > 0 || trimEndMs < totalMs));
  const selectedStart = totalMs ? trimStartMs / totalMs : 0;
  const selectedEnd = totalMs ? trimEndMs / totalMs : 1;

  const changeTrimStart = (next: number): void => {
    const maximum = Math.max(0, trimEndMs - minimumRangeMs);
    setTrimStartMs(Math.round(Math.max(0, Math.min(maximum, next))));
    setAuditionedExact(null);
  };
  const changeTrimEnd = (next: number): void => {
    const minimum = Math.min(totalMs, trimStartMs + minimumRangeMs);
    setTrimEndMs(Math.round(Math.max(minimum, Math.min(totalMs, next))));
    setAuditionedExact(null);
  };
  const resetTrim = (): void => {
    setTrimStartMs(0);
    setTrimEndMs(totalMs);
    setAuditionedExact(null);
    setStatus('Trim reset to the complete candidate.');
  };
  const installProfile = async (): Promise<SfxProfileDocument> => {
    if (!soundSetKey || !soundSetProfile) throw new Error('Candidate sound-set profile metadata is incomplete');
    const current = await fetchLiveSfxProfile();
    if (!current) throw new Error('The live SFX profile is unavailable');
    if (current.data.soundSets[soundSetKey]) {
      onProfileSaved(current);
      return current;
    }
    const saved = await saveLiveSfxProfile({
      ...current.data,
      soundSets: {
        ...current.data.soundSets,
        [soundSetKey]: soundSetProfile,
      },
    }, current.revision);
    onProfileSaved(saved);
    return saved;
  };

  const auditionFull = (): void => {
    if (!audio || busy) return;
    try {
      auditionDecodedCandidateRaw(audio.buffer);
      setAuditionedExact(audio.summary);
      setStatus(`Playing the complete exact candidate · ${audio.summary.durationMs} ms.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Audition failed: ${error.message}` : 'Audition failed.');
    }
  };

  const auditionSelection = (): void => {
    if (!audio || !trim || busy) return;
    try {
      auditionDecodedCandidateRaw(audio.buffer, trim.startMs, trim.endMs);
      if (!trimDirty) setAuditionedExact(audio.summary);
      setStatus(`Playing selection · ${secondsLabel(trim.startMs)}–${secondsLabel(trim.endMs)} · ${trim.durationMs} ms.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Audition failed: ${error.message}` : 'Audition failed.');
    }
  };

  const saveTrim = async (): Promise<void> => {
    if (!version?.slot || !version.media || !slot || !pcm || !trim || !trimDirty || busy) return;
    setBusy(true);
    setStatus('Encoding the selected range as a new private candidate…');
    try {
      const encoded = encodePcm16Wav(pcm, trim.startMs, trim.endMs);
      const digest = await sha256Hex(encoded.bytes);
      const runtime = recordValue(version.metadata.runtime);
      if (!runtime) throw new Error('Candidate runtime metadata is incomplete');
      const edit = {
        schema: 'sfx-wave-trim-v1',
        sourceVersionId: version.id,
        sourceSha256: version.media.sha256,
        sourceSlot: version.slot,
        startFrame: encoded.range.startFrame,
        endFrame: encoded.range.endFrame,
        startMs: encoded.range.startMs,
        endMs: encoded.range.endMs,
        durationMs: encoded.range.durationMs,
        sampleRate: pcm.sampleRate,
        channels: pcm.channels.length,
        encoder: 'browser-pcm16-wav-v1',
        outputSha256: digest,
      };
      const idempotencyKey = [
        'sfx-trim',
        version.id,
        version.rowRevision,
        encoded.range.startFrame,
        encoded.range.endFrame,
        'pcm16-v1',
      ].join(':');
      const { editorSource: _editorSource, ...derivedMetadata } = version.metadata;
      void _editorSource;
      let derived = await createLiveMediaVersion({
        slot: version.slot,
        domain: version.domain,
        role: version.role,
        label: `${version.label} · ${secondsLabel(encoded.range.startMs)}–${secondsLabel(encoded.range.endMs)}`,
        availabilityPolicy: slot.availabilityPolicy,
        metadata: {
          ...derivedMetadata,
          runtime: { ...runtime, durationMs: encoded.range.durationMs },
        },
        provenance: {
          ...version.provenance,
          derivedAudioEdit: edit,
        },
      }, idempotencyKey);
      if (!derived.media) {
        const exactBytes = new Uint8Array(encoded.bytes);
        derived = await uploadLiveMediaVersionContent({
          id: derived.id,
          expectedRevision: derived.rowRevision,
          bytes: new Blob([exactBytes.buffer], { type: 'audio/wav' }),
          mediaType: 'audio/wav',
        });
      }
      if (
        derived.media?.sha256 !== digest
        || Number(derived.media.byteLength) !== encoded.bytes.byteLength
      ) throw new Error('The uploaded trim does not match the browser-encoded bytes');

      setStatus('Trim saved. Opening the derived candidate for exact review…');
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('sfxReview', derived.id);
      window.location.assign(nextUrl.toString());
    } catch (error) {
      setStatus(error instanceof Error ? `Trim save failed: ${error.message}` : 'Trim save failed.');
      setBusy(false);
    }
  };

  const approveAndInstall = async () => {
    if (!version?.media || !slot || !auditionedExact || trimDirty || busy) return;
    setBusy(true);
    setStatus('Recording approval for the exact candidate bytes…');
    try {
      const surfaceUrl = window.location.href;
      const reviewed = await reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: `Approved exact-byte SFX audition for ${version.slot}.`,
        surfaceUrl,
        evidence: {
          schema: 'sfx-sample-exact-byte-proof-v1',
          renderer: 'SfxViewer/ExactCandidateAudition',
          surfaceUrl,
          exactByteAudition: true,
          playbackRate: 1,
          decodedAudio: auditionedExact,
          selectedCandidates: [{
            slot: version.slot,
            versionId: version.id,
            sha256: version.media.sha256,
            rowRevision: version.rowRevision,
          }],
          slotSnapshots: [{
            slot: slot.slot,
            rowRevision: slot.rowRevision,
            activeVersionId: slot.activeVersionId,
          }],
        },
      });
      setStatus('Installing the reviewed candidate…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot.rowRevision,
        expectedActiveVersionId: slot.activeVersionId,
      }]);
      await loadLiveMediaCatalog();
      await installProfile();
      const next = await fetchAdminLiveMediaCatalog();
      setCatalog(next);
      setStatus(`${soundSetKey} is accepted, active, and declared in the live SFX profile.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Install failed: ${error.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };
  const addAcceptedProfile = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Adding the accepted sound set to the live profile…');
    try {
      await installProfile();
      setStatus(`${soundSetKey} is declared in the live SFX profile.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Profile update failed: ${error.message}` : 'Profile update failed.');
    } finally {
      setBusy(false);
    }
  };

  const declared = Boolean(soundSetKey && currentLiveSfxProfileDocument()?.data.soundSets[soundSetKey]);
  return (
    <>
      <section className="al-lab-main" aria-label="SFX candidate trim editor">
        {version ? (
          <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
            <div className="tileset-view-header">
              <div>
                <h2>{version.label}</h2>
                <p>{version.slot} · {version.status} · SHA-256 {version.media?.sha256.slice(0, 12) ?? 'no bytes'}…</p>
              </div>
            </div>
            <div
              aria-label="Candidate waveform and selected trim"
              style={{ width: '100%', height: 'min(42vh, 320px)', minHeight: 180, color: 'var(--ds-accent, #7ea2ff)' }}
            >
              <AudioWaveform
                peaks={peaks}
                bars={180}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
              />
            </div>
            <dl className="al-meta">
              <div><dt>Complete</dt><dd>{totalMs ? secondsLabel(totalMs) : 'Decoding…'}</dd></div>
              <div><dt>Selection</dt><dd>{trim ? `${secondsLabel(trim.startMs)}–${secondsLabel(trim.endMs)} (${secondsLabel(trim.durationMs)})` : 'Decoding…'}</dd></div>
              <div><dt>Format</dt><dd>{audio ? `${audio.summary.sampleRate} Hz · ${audio.summary.channels === 1 ? 'mono' : `${audio.summary.channels} channels`}` : 'Decoding…'}</dd></div>
            </dl>
            <p className="tileset-catalog-note" role="status" style={{ margin: 0 }}>{status}</p>
          </div>
        ) : (
          <p className="tileset-studio-empty" role="status">{status || 'That SFX candidate is unavailable.'}</p>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="SFX candidate controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">
              Set the start and end, audition that exact range, then save it as a new private candidate. The source candidate is never overwritten.
            </p>
            <label>
              <span>Start · {secondsLabel(trimStartMs)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalMs - minimumRangeMs)}
                step={10}
                value={trimStartMs}
                disabled={!audio || busy}
                onChange={(event) => changeTrimStart(Number(event.target.value))}
                aria-label="Trim start"
              />
              <input
                type="number"
                min={0}
                max={Math.max(0, (trimEndMs - minimumRangeMs) / 1000)}
                step={0.01}
                value={(trimStartMs / 1000).toFixed(2)}
                disabled={!audio || busy}
                onChange={(event) => changeTrimStart(Number(event.target.value) * 1000)}
                aria-label="Trim start in seconds"
              />
            </label>
            <label>
              <span>End · {secondsLabel(trimEndMs)}</span>
              <input
                type="range"
                min={minimumRangeMs}
                max={totalMs}
                step={10}
                value={trimEndMs}
                disabled={!audio || busy}
                onChange={(event) => changeTrimEnd(Number(event.target.value))}
                aria-label="Trim end"
              />
              <input
                type="number"
                min={(trimStartMs + minimumRangeMs) / 1000}
                max={totalMs / 1000}
                step={0.01}
                value={(trimEndMs / 1000).toFixed(2)}
                disabled={!audio || busy}
                onChange={(event) => changeTrimEnd(Number(event.target.value) * 1000)}
                aria-label="Trim end in seconds"
              />
            </label>
            <button type="button" className="tileset-view-action" disabled={!audio || busy} onClick={auditionFull}>
              ▶ Play complete candidate
            </button>
            <button type="button" className="tileset-view-action" disabled={!audio || !trim || busy} onClick={auditionSelection}>
              ▶ Play selection
            </button>
            <button type="button" className="tileset-view-action" disabled={!trimDirty || busy} onClick={resetTrim}>
              Reset to complete candidate
            </button>
            <button type="button" className="tileset-view-action" disabled={!trimDirty || !trim || busy} onClick={() => void saveTrim()}>
              {busy ? 'Saving…' : 'Save trim as new candidate'}
            </button>
            {version?.status === 'candidate' ? (
              <button
                type="button"
                className="tileset-view-action"
                disabled={requiresTrim || !auditionedExact || trimDirty || !slot || !soundSetProfile || busy}
                onClick={() => void approveAndInstall()}
              >
                Approve and install
              </button>
            ) : version?.status === 'accepted' && !declared ? (
              <button type="button" className="tileset-view-action" disabled={!soundSetProfile || busy} onClick={() => void addAcceptedProfile()}>
                Add to live SFX profile
              </button>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}

export function SfxViewer({
  header,
  reviewVersionId,
}: {
  header?: ReactNode;
  reviewVersionId?: string;
}): ReactElement {
  const [document, setDocument] = useState<SfxProfileDocument | null>(() => currentLiveSfxProfileDocument());
  if (reviewVersionId) {
    return <SfxCandidateEditor versionId={reviewVersionId} header={header} onProfileSaved={setDocument} />;
  }
  return (
    <>
      <section className="al-lab-main" aria-label="Sound assignments">
        {document ? (
          <>
            {document.data.soundSets.click ? <InterfaceSoundPanel /> : null}
            <SfxAssignmentPanel key={document.revision} document={document} onSaved={setDocument} />
          </>
        ) : (
          <p className="tileset-studio-empty" role="status">
            The live SFX profile is unavailable. Sound effects remain silent; there is no committed fallback to edit.
          </p>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Sound assignment controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">
              Edit the backend-owned sound-set metadata, terrain assignments, and arrival behavior. Save performs an optimistic live revision update; unsaved work remains only in this browser's draft.
            </p>
          </div>
        </section>
      </aside>
    </>
  );
}
