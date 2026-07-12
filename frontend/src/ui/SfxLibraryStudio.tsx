import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  cloneSfxProfile,
  currentLiveSfxProfileDocument,
  assertSfxProfile,
  type SfxProfile,
  type SfxProfileDocument,
  type SfxSoundSetProfile,
} from '../core/sfxProfile';
import { auditionSampleRaw, isSampleReady, loadAuthoredSamples, previewSample, type SampleKey } from '../sfx';
import { sfxSampleWaveform, sfxSampleWaveformCached } from '../sfxWaveform';
import { saveLiveSfxProfile } from '../net/sfxProfile';
import { ASSIGNABLE_TERRAINS, sfxAssets, type SfxAsset } from './sfxCatalog';

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
  const n = peaks.length || bars;
  return (
    <svg
      className="sfx-wave"
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {peaks.length === 0 ? (
        <line x1="0" y1="50" x2={n} y2="50" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      ) : (
        peaks.map((p, i) => {
          const h = Math.max(p * 96, 1.5);
          return <rect key={i} x={i + 0.12} y={(100 - h) / 2} width={0.76} height={h} fill="currentColor" />;
        })
      )}
    </svg>
  );
}

export function SfxLibraryStudio({
  search,
  zoom,
  selected,
  onSelect,
}: {
  search: string;
  zoom: number;
  selected?: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const assets = sfxAssets();
  const visible = assets.filter((s) => !q || [s.label, ...s.terrains, s.character, s.build].join(' ').toLowerCase().includes(q));
  // Catalog main is CONTENT ONLY — a single internally-scrolling grid, no sub-headers
  // (docs/studio-control-architecture.md). The terrain→sound assignment editor is a
  // control surface and lives in the Viewer 'sfx' kind (see SfxViewer), not here.
  return (
    <div className="tileset-studio-grid surface-grid" aria-label="Sound Effects">
      {visible.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`tileset-studio-card ${s.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => { onSelect(s.name); auditionAsset(s); }}
          aria-pressed={s.name === selected}
          title={`${s.label} — click to hear`}
        >
          <span
            className="tileset-studio-card-image sfx-card-wave"
            style={{ '--tile-zoom': zoom, color: 'var(--ds-accent, #7ea2ff)', height: `${Math.round(80 * zoom)}px` } as CSSProperties}
          >
            <SfxWaveform asset={s} />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{s.label}</strong>
              <em>{s.character}</em>
            </span>
          </span>
        </button>
      ))}
      {assets.length === 0
        ? <p className="tileset-studio-empty">The live SFX profile is unavailable. Gameplay remains intentionally silent.</p>
        : visible.length === 0 ? <p className="tileset-studio-empty">No sound effects match.</p> : null}
    </div>
  );
}

// The 'sfx' Viewer kind is the sound-ASSIGNMENT EDITOR (not a per-sound read-only view).
// It's a global config — the terrain→sound map + the arrival thump — so it ignores per-card
// selection and always renders the same editor. It uses the blessed editing-kind shape the
// spec names for Portrait/9-Slice (docs/studio-control-architecture.md): the editor IS the
// .al-lab-main stage (room for the matrix), and the rail carries only the standing {header}
// (Workspace tabs + Viewer-kind select) plus a one-line note — controls don't fragment
// across regions. Reached from the catalog's "Assign sounds…" affordance (openViewer('sfx'))
// or the Viewer-kind dropdown. (First global-config Viewer kind; deliberate — don't "fix" it
// back into the 260px catalog rail, where the matrix would dominate, against the spec.)
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

export function SfxViewer({ header }: { header?: ReactNode }): ReactElement {
  const [document, setDocument] = useState<SfxProfileDocument | null>(() => currentLiveSfxProfileDocument());
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
