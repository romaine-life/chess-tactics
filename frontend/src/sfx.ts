// Procedural sound-effects service.
//
// The companion to the BGM player (bgm.js): same gesture-armed, settings-driven
// contract, but where BGM streams authored audio files through one <audio> element,
// SFX synthesises short one-shots on the fly with the Web Audio API. There are no
// assets to fetch — every footstep / splash / clack is built from oscillators and
// filtered noise at play time, so terrain feedback costs zero network and is
// trivially re-tunable in code.
//
// Design goals (mirroring bgm.js):
//   - Autoplay-safe: an AudioContext starts suspended until a user gesture. We arm
//     on the first pointerdown/keydown/touchstart (exactly the BGM arm-events) AND
//     keep a safety-net resume() inside playTerrain, so the very first move after a
//     gesture is never silent.
//   - Settings-driven: the master gain tracks the same localStorage settings blob
//     the Settings screen writes (chess-tactics-settings-v1). masterAudio=false (or
//     effectsVolume=0) hard-mutes effects. We re-read on a custom settings-change
//     event and on cross-tab `storage`, so changing the slider takes effect live.
//   - SSR / build-safe: every window / AudioContext touch is typeof-guarded and
//     nothing runs at import time, so this module is import-safe under Vite SSR,
//     tests, and the Node-run tooling.
//   - Bounded: a polyphony cap drops (or steals) voices so a flurry of rapid moves
//     can never pile up an unbounded graph of nodes.
//
// The per-terrain RECIPES are authored, hand-tuned procedural foley (audition them
// in the Studio's "Sound Effects" catalog). Each is intentionally short and subtle —
// landing feedback plays on every move, so it must never fatigue.

import type { TerrainType } from './core/types';

// ---- settings contract (shared with Settings.tsx) --------------------------
// The Settings screen persists a JSON blob under this key; we read the two fields
// that gate effects. Kept as literals here (not imported from the React UI) so the
// service has no dependency on the component tree and stays import-safe everywhere.
const SETTINGS_KEY = 'chess-tactics-settings-v1';

// The Settings screen dispatches this after it mutates masterAudio / effectsVolume
// (see integration in Settings.tsx) so a running service updates its master gain
// without a reload — the SFX analogue of BGM's mute-change event.
export const SFX_SETTINGS_CHANGE_EVENT = 'chess-tactics:settings-change';

const DEFAULT_MASTER_AUDIO = true;
const DEFAULT_EFFECTS_VOLUME = 80; // 0..100, matches Settings DEFAULT_SETTINGS

// Cap on simultaneously-sounding voices. Past this, the oldest voice is stolen so a
// burst of moves stays bounded instead of growing the audio graph without limit.
const MAX_VOICES = 12;

interface EffectsSettings {
  masterAudio: boolean;
  effectsVolume: number; // 0..100
}

// SSR-safe window handle: undefined off the main thread / during build.
function win(): (Window & typeof globalThis) | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function readEffectsSettings(): EffectsSettings {
  const w = win();
  if (!w) return { masterAudio: DEFAULT_MASTER_AUDIO, effectsVolume: DEFAULT_EFFECTS_VOLUME };
  try {
    const raw = w.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { masterAudio: DEFAULT_MASTER_AUDIO, effectsVolume: DEFAULT_EFFECTS_VOLUME };
    const parsed = JSON.parse(raw) as { masterAudio?: unknown; effectsVolume?: unknown };
    const masterAudio = typeof parsed.masterAudio === 'boolean' ? parsed.masterAudio : DEFAULT_MASTER_AUDIO;
    const volume = typeof parsed.effectsVolume === 'number' && Number.isFinite(parsed.effectsVolume)
      ? Math.min(100, Math.max(0, parsed.effectsVolume))
      : DEFAULT_EFFECTS_VOLUME;
    return { masterAudio, effectsVolume: volume };
  } catch {
    // Absent / malformed settings → audible defaults (parity with BGM's readMuted).
    return { masterAudio: DEFAULT_MASTER_AUDIO, effectsVolume: DEFAULT_EFFECTS_VOLUME };
  }
}

// The effective master gain: 0 when master audio is off, else effectsVolume scaled
// to 0..1. One place computes the multiplier so "muted" is unambiguous everywhere.
function masterGainFor(settings: EffectsSettings): number {
  if (!settings.masterAudio) return 0;
  return settings.effectsVolume / 100;
}

// Cached parse of the settings blob so the per-landing mute gate doesn't re-read +
// JSON.parse localStorage on every footstep (landings fire in staggered bursts).
// Kept fresh by applyMasterGain(), which the settings-change + cross-tab `storage`
// listeners call — the only paths by which these settings change.
let cachedEffects: EffectsSettings | null = null;

function effectsSettings(): EffectsSettings {
  if (!cachedEffects) cachedEffects = readEffectsSettings();
  return cachedEffects;
}

// ---- lazy singleton AudioContext -------------------------------------------
// Built only on demand (after a gesture, or as a safety net inside playTerrain) and
// reused thereafter — one context, one master bus, for the whole session.

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  const w = win();
  if (!w) return undefined;
  // Preserve the globalThis half of the window type (which carries AudioContext)
  // while adding the prefixed Safari fallback that the lib types omit.
  const g = w as typeof w & { webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let armed = false; // gesture listeners attached
let resolved = false; // ctx creation attempted (success or unavailable)
let unavailable = false; // Web Audio not present — give up quietly

// Active voices, oldest first, for the polyphony cap / voice stealing.
interface Voice {
  node: GainNode;
  stopAt: number; // ctx.currentTime when cleanup is scheduled
  timer: ReturnType<typeof setTimeout> | null;
}
const voices: Voice[] = [];

// Create (or return) the shared context + master bus. Returns null if Web Audio is
// unavailable or construction throws — callers must treat null as "do nothing".
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (unavailable) return null;
  resolved = true;
  const Ctor = audioContextCtor();
  if (!Ctor) { unavailable = true; return null; }
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = masterGainFor(effectsSettings());
    master.connect(ctx.destination);
    return ctx;
  } catch {
    // e.g. too many contexts, or a locked-down environment — fail silent.
    unavailable = true;
    ctx = null;
    master = null;
    return null;
  }
}

// Push the current settings into the live master gain (cheap; safe to call often).
function applyMasterGain(): void {
  // Refresh the cache first (above the ctx guard) so the per-landing mute gate sees
  // the new value even if no AudioContext exists yet.
  cachedEffects = readEffectsSettings();
  if (!ctx || !master) return;
  const target = masterGainFor(cachedEffects);
  // Tiny ramp instead of a hard set so a slider drag doesn't click.
  try {
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
  } catch {
    master.gain.value = target;
  }
}

/**
 * Re-read localStorage and update the master gain. Call after the Settings screen
 * changes masterAudio / effectsVolume (it also fires SFX_SETTINGS_CHANGE_EVENT,
 * which this module listens for, so an explicit call is usually unnecessary).
 */
export function refreshSfxSettings(): void {
  applyMasterGain();
}

// ---- gesture arming (autoplay policy) --------------------------------------
// An AudioContext is created suspended; it can only resume after a user gesture.
// Mirror the BGM player exactly: listen on the first pointerdown/keydown/touchstart,
// create+resume the context, then disarm.

const ARM_EVENTS: ReadonlyArray<string> = ['pointerdown', 'keydown', 'touchstart'];

function onGesture(): void {
  const context = ensureContext();
  if (context && context.state === 'suspended') {
    void context.resume().catch(() => { /* resumed later by the safety net */ });
  }
  disarmGesture();
}

function disarmGesture(): void {
  const w = win();
  if (!w || !armed) return;
  armed = false;
  for (const evt of ARM_EVENTS) w.removeEventListener(evt, onGesture);
}

let settingsListenersAttached = false;

function attachSettingsListeners(): void {
  const w = win();
  if (!w || settingsListenersAttached) return;
  settingsListenersAttached = true;
  // Live in-tab update from the Settings screen.
  w.addEventListener(SFX_SETTINGS_CHANGE_EVENT, applyMasterGain);
  // Cross-tab: another tab wrote the settings blob.
  w.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) applyMasterGain();
  });
}

/**
 * Attach one-time gesture listeners that arm the AudioContext, plus the settings
 * listeners that keep the master gain live. Call once from app init (next to
 * initBgm()). Idempotent and SSR-safe.
 */
export function primeSfx(): void {
  const w = win();
  if (!w) return;
  attachSettingsListeners();
  if (armed) return;
  armed = true;
  for (const evt of ARM_EVENTS) w.addEventListener(evt, onGesture, { passive: true });
}

// ---- noise helper ----------------------------------------------------------
// A short noise burst as a one-shot AudioBufferSourceNode (not yet started — the
// caller wires it up and calls .start()). 'white' is flat; 'pink' and 'brown' are
// cheap integrator approximations of white noise, plenty for footstep/splash grit.

export type NoiseColor = 'white' | 'pink' | 'brown';

export function noiseSource(context: BaseAudioContext, seconds: number, color: NoiseColor): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(context.sampleRate * Math.max(0, seconds)));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  if (color === 'white') {
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  } else if (color === 'pink') {
    // Paul Kellet's economical pink-noise filter (3-pole approximation).
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
  } else {
    // Brown noise: integrated white, leak-corrected to stay in range.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }

  const node = context.createBufferSource();
  node.buffer = buffer;
  return node;
}

// ---- per-terrain recipes ---------------------------------------------------
// Each recipe builds its voice graph onto `dest` (a per-voice GainNode that already
// routes to the master bus) starting at `now`, and returns its total duration in
// seconds so playTerrain can schedule cleanup. Hand-tuned procedural foley — keep
// them subtle (this plays on every landing). cliff/rock are no-ops (impassable:
// pieces never land on them) and return 0.

// Recipes take a BaseAudioContext (not AudioContext) so the very same recipe can be
// rendered offline for the catalog waveform preview (OfflineAudioContext) as well as
// played live. They only ever use create*/currentTime/sampleRate, all on the base type.
export type SfxRecipe = (ctx: BaseAudioContext, dest: AudioNode, now: number) => number;

const NO_OP: SfxRecipe = () => 0;

export const RECIPES: Record<TerrainType, SfxRecipe> = {
  // grass — a soft dry rustle/swish of blades: a bandpassed noise burst with a
  // quick swish, gently high-passed so it stays light and never thuddy.
  grass: (ctx, dest, now) => {
    const t = now;
    const dur = 0.13;

    // Dry rustle: a short noise burst pushed through a sweeping bandpass + a high-pass to keep it light.
    const src = noiseSource(ctx, dur + 0.05, 'pink');

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(900, t);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(0.9, t);
    // quick swish: band center rises then settles, like blades brushing past
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.linearRampToValueAtTime(4200, t + 0.025);
    bp.frequency.exponentialRampToValueAtTime(1700, t + dur);

    // gentle top roll-off so it never gets hissy/harsh
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6500, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.04);

    return dur + 0.05;
  },

  // water — a small 'ploop' splash: a noise burst with a downward low-pass + pitch
  // sweep for the splash body, plus a tiny descending sine droplet blip on top.
  water: (ctx, dest, now) => {
    const t = now;
    const dur = 0.18;

    // --- Splash body: noise burst with a downward low-pass sweep (wet, plummeting) ---
    const src = noiseSource(ctx, dur + 0.04, 'pink');

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + dur);
    bp.Q.value = 0.9;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 240;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.linearRampToValueAtTime(0.30, t + 0.005);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp);
    bp.connect(hp);
    hp.connect(nGain);
    nGain.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.03);

    // --- Droplet blip: tiny descending sine, slightly delayed, for the 'ploop' pitch drop ---
    const dt = t + 0.018;
    const dDur = 0.085;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, dt);
    osc.frequency.exponentialRampToValueAtTime(360, dt + dDur);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, dt);
    oGain.gain.linearRampToValueAtTime(0.18, dt + 0.004);
    oGain.gain.exponentialRampToValueAtTime(0.0001, dt + dDur);

    osc.connect(oGain);
    oGain.connect(dest);

    osc.start(dt);
    osc.stop(dt + dDur + 0.02);

    return dur + 0.04;
  },

  // stone — a crisp hard flagstone 'tok': a bright short filtered-noise clack, a
  // tiny damped high resonant ping, and a quick low knock for weight.
  stone: (ctx, dest, now) => {
    const t = now;
    const dur = 0.16;

    // bright hard transient: short band/high-passed white-noise clack
    const click = noiseSource(ctx, 0.04, 'white');
    const clickBP = ctx.createBiquadFilter();
    clickBP.type = 'bandpass';
    clickBP.frequency.setValueAtTime(2600, t);
    clickBP.Q.setValueAtTime(0.9, t);
    const clickHP = ctx.createBiquadFilter();
    clickHP.type = 'highpass';
    clickHP.frequency.setValueAtTime(1100, t);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.linearRampToValueAtTime(0.34, t + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    click.connect(clickBP);
    clickBP.connect(clickHP);
    clickHP.connect(clickGain);
    clickGain.connect(dest);
    click.start(t);
    click.stop(t + 0.045);

    // tiny resonant ping: damped high sine, the 'tok' body
    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(1850, t);
    ping.frequency.exponentialRampToValueAtTime(1500, t + 0.10);
    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0.0001, t);
    pingGain.gain.linearRampToValueAtTime(0.18, t + 0.003);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    ping.connect(pingGain);
    pingGain.connect(dest);
    ping.start(t);
    ping.stop(t + 0.15);

    // low knock thump for weight, very quick
    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(220, t);
    knock.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.0001, t);
    knockGain.gain.linearRampToValueAtTime(0.12, t + 0.003);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    knock.connect(knockGain);
    knockGain.connect(dest);
    knock.start(t);
    knock.stop(t + 0.07);

    return dur;
  },

  // road — a packed cobble footstep scuff: a brief gritty noise transient through a
  // bandpassed mid filter (between dirt thud and stone tap) with a tiny low body knock.
  road: (ctx, dest, now) => {
    const t = now;
    const dur = 0.13;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.36, t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.06, t + 0.07);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(dest);

    // Gritty scuff: white noise through a swept bandpass (mid, dirt-to-stone)
    const n = noiseSource(ctx, dur + 0.02, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(1.1, t);
    bp.frequency.setValueAtTime(1750, t);
    bp.frequency.exponentialRampToValueAtTime(820, t + 0.085);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(380, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.95, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t); n.stop(t + dur + 0.01);

    // Small low body knock so it reads as a packed-ground contact, not just hiss
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    body.frequency.exponentialRampToValueAtTime(105, t + 0.05);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.5, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    body.connect(bg); bg.connect(out);
    body.start(t); body.stop(t + 0.09);

    return dur + 0.03;
  },

  // bridge — a hollow wooden plank knock: a triangle ping with a woody bandpassed
  // body, a faint higher harmonic, and a soft noise tick at contact.
  bridge: (ctx, dest, now) => {
    const t = now;
    const dur = 0.19;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.36, t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(dest);

    // Woody body: triangle fundamental with a fast pitch settle (plank knock)
    const f0 = 232;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0 * 1.18, t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
    const woodbp = ctx.createBiquadFilter();
    woodbp.type = 'bandpass';
    woodbp.Q.setValueAtTime(2.4, t);
    woodbp.frequency.setValueAtTime(f0, t);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.72, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(woodbp); woodbp.connect(og); og.connect(out);
    osc.start(t); osc.stop(t + dur);

    // Faint higher harmonic for the hollow knock attack, decays fast
    const harm = ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(f0 * 2.76, t);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.linearRampToValueAtTime(0.22, t + 0.003);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    harm.connect(hg); hg.connect(out);
    harm.start(t); harm.stop(t + 0.08);

    // Soft contact tick (lowpassed noise) so the plank reads as struck, not bowed
    const n = noiseSource(ctx, 0.05, 'white');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(lp); lp.connect(ng); ng.connect(out);
    n.start(t); n.stop(t + 0.05);

    return dur + 0.03;
  },

  // dirt — a soft muffled low thud/pat of packed earth: a heavily low-passed noise
  // pat layered with a faint short low sine body, both fast-decaying.
  dirt: (ctx, dest, now) => {
    const t = now;
    const dur = 0.13;

    // Muffled pat: low-passed noise burst — the dry 'pat' of packed earth.
    const src = noiseSource(ctx, dur + 0.05, 'brown');

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(0.7, t);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + dur);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.linearRampToValueAtTime(0.30, t + 0.004);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    src.connect(lp);
    lp.connect(nGain);
    nGain.connect(dest);

    // Faint low body — gives the thud a little grounded weight without boom.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.09);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, t);
    oGain.gain.linearRampToValueAtTime(0.16, t + 0.005);
    oGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    osc.connect(oGain);
    oGain.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.04);
    osc.start(t);
    osc.stop(t + 0.13);

    return dur + 0.05;
  },

  // pebble — a granular gravel crunch: eight tiny scattered band-passed noise grains
  // in rapid succession over a soft low brown-noise settle.
  pebble: (ctx, dest, now) => {
    const t = now;
    const dur = 0.18;

    // granular gravel crunch: several tiny scattered noise grains
    const grainTimes = [0.000, 0.012, 0.021, 0.034, 0.048, 0.063, 0.082, 0.105];
    const grainGains = [0.30, 0.22, 0.26, 0.18, 0.24, 0.15, 0.12, 0.09];
    const grainFreqs = [3200, 4100, 2700, 3600, 4400, 3000, 2400, 3800];
    for (let i = 0; i < grainTimes.length; i++) {
      const gt = t + grainTimes[i];
      const glen = 0.018;
      const grain = noiseSource(ctx, glen, 'white');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(grainFreqs[i], gt);
      bp.Q.setValueAtTime(1.6, gt);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(900, gt);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, gt);
      g.gain.linearRampToValueAtTime(grainGains[i], gt + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, gt + 0.014);
      grain.connect(bp);
      bp.connect(hp);
      hp.connect(g);
      g.connect(dest);
      grain.start(gt);
      grain.stop(gt + glen);
    }

    // soft low settle under the grains for body
    const settle = noiseSource(ctx, 0.12, 'brown');
    const settleLP = ctx.createBiquadFilter();
    settleLP.type = 'lowpass';
    settleLP.frequency.setValueAtTime(500, t);
    const settleGain = ctx.createGain();
    settleGain.gain.setValueAtTime(0.0001, t);
    settleGain.gain.linearRampToValueAtTime(0.10, t + 0.004);
    settleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    settle.connect(settleLP);
    settleLP.connect(settleGain);
    settleGain.connect(dest);
    settle.start(t);
    settle.stop(t + 0.13);

    return dur;
  },

  // sand — a soft airy 'shff' shuffle: high-passed white noise with a fast attack
  // and gentle decay, band-shaped so there is zero low end.
  sand: (ctx, dest, now) => {
    const t = now;
    const dur = 0.13;

    const src = noiseSource(ctx, dur + 0.04, 'white');

    // High-pass to kill all low end, then a gentle low-pass to keep it airy not hissy.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1400, t);
    hp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    hp.Q.value = 0.5;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(4200, t + dur);
    lp.Q.value = 0.3;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.34, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.03);

    return dur + 0.04;
  },

  // Impassable terrain — pieces never land here, so there is no footstep.
  cliff: NO_OP,
  rock: NO_OP,
};

// ---- playback --------------------------------------------------------------
// Drop the oldest voice (free its node + timer) to make room under the cap.
function stealOldestVoice(): void {
  const oldest = voices.shift();
  if (!oldest) return;
  if (oldest.timer !== null) clearTimeout(oldest.timer);
  try { oldest.node.disconnect(); } catch { /* already gone */ }
}

function retireVoice(voice: Voice): void {
  const idx = voices.indexOf(voice);
  if (idx !== -1) voices.splice(idx, 1);
  if (voice.timer !== null) clearTimeout(voice.timer);
  try { voice.node.disconnect(); } catch { /* already gone */ }
}

/**
 * Play the footstep / material one-shot for a terrain.
 *
 * No-ops when effects are muted (master gain 0), Web Audio is unavailable, or the
 * context can't run. Otherwise builds a per-voice GainNode → master, runs the
 * terrain's recipe, and schedules cleanup after the recipe's reported duration.
 * A polyphony cap (MAX_VOICES) steals the oldest voice so rapid moves stay bounded.
 *
 * @param opts.gain optional per-call multiplier (0..1+) layered onto the voice.
 */
export function playTerrain(terrain: TerrainType, opts?: { gain?: number }): void {
  // Safety net: if a gesture armed listeners but the context was never created (or
  // is still suspended), create + resume it here so the first move isn't swallowed.
  const context = ensureContext();
  if (!context || !master) return;
  if (context.state === 'suspended') {
    void context.resume().catch(() => { /* may need a real gesture first */ });
  }

  // Hard-muted: master audio off or effects volume 0 → don't build any nodes.
  if (masterGainFor(effectsSettings()) <= 0) return;

  const recipe = RECIPES[terrain];
  if (!recipe) return;

  // Enforce the polyphony cap by stealing the oldest voice(s) before adding one.
  while (voices.length >= MAX_VOICES) stealOldestVoice();

  const now = context.currentTime;
  const voiceGain = context.createGain();
  const callGain = typeof opts?.gain === 'number' && Number.isFinite(opts.gain) ? Math.max(0, opts.gain) : 1;
  voiceGain.gain.value = callGain;
  voiceGain.connect(master);

  let duration = 0;
  try {
    duration = recipe(context, voiceGain, now);
  } catch {
    // A malformed recipe must not strand the voice node.
    try { voiceGain.disconnect(); } catch { /* already gone */ }
    return;
  }

  if (!(duration > 0)) {
    // No-op recipe (cliff/rock) or zero-length — nothing scheduled, clean up now.
    try { voiceGain.disconnect(); } catch { /* already gone */ }
    return;
  }

  const voice: Voice = { node: voiceGain, stopAt: now + duration, timer: null };
  voices.push(voice);
  // Cleanup a touch after the sound ends so release tails finish. Disconnecting the
  // voice node lets its now-finished source/oscillator nodes be GC'd.
  const cleanupMs = Math.ceil((duration + 0.05) * 1000);
  voice.timer = setTimeout(() => retireVoice(voice), cleanupMs);
}

/** Demo-page alias for playTerrain (the procedural-SFX preview / tuning page). */
export function previewTerrain(terrain: TerrainType): void {
  playTerrain(terrain);
}

// Test / debug hook: current live-voice count (parity with bgm's _state).
export function _activeVoiceCount(): number {
  return voices.length;
}

// Silence the linter about intentionally-unused tracking flags that aid debugging
// of the lazy-init state machine without being read in the happy path.
void resolved;
