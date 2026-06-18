// Background music (BGM) player.
//
// Plays the game's soundtrack as a continuously-shuffled playlist. Design goals:
//   - Random shuffle: Fisher-Yates over the track list, reshuffled each cycle,
//     and never repeats the same track back-to-back across a cycle boundary.
//   - On-demand streaming: a single <audio preload="none"> element fetches only
//     the track that is currently playing, one at a time, via HTTP range
//     requests. The browser never downloads the whole library up front, so a
//     20-track / ~150MB soundtrack costs the listener only the current song.
//   - App-owned contract: the track list comes from the backend's /api/bgm
//     endpoint ({tracks:[{title,url}]}). The blob storage account stays under the
//     backend and is never exposed to the client; URLs arrive absolute and are
//     streamed as-is.
//   - Autoplay-safe: browsers block audible autoplay until a user gesture, so
//     playback is armed on the first interaction instead of fighting the policy.
//   - User control: a persisted mute toggle; muting pauses (no silent
//     background streaming) and unmuting resumes.

const BGM_API_URL = '/api/bgm';
const MUTE_STORAGE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';
const DEFAULT_VOLUME = 0.5;
// If a track 404s or fails to decode, wait briefly then skip to the next one so
// a single bad asset can never wedge the playlist.
const ERROR_SKIP_DELAY_MS = 1500;

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {
    /* storage unavailable (private mode, etc.) — non-fatal */
  }
}

// Fisher-Yates shuffle on a copy of the input array.
export function shuffled(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Build one shuffle cycle of indices [0..length-1], ensuring the first index is
// not `lastIndex` so the same track never plays twice across a cycle boundary.
// Pure and exported for unit testing.
export function planShuffleCycle(length, lastIndex) {
  const indices = Array.from({ length }, (_, i) => i);
  if (length <= 1) return indices;
  const order = shuffled(indices);
  if (order[0] === lastIndex) {
    const swapWith = 1 + Math.floor(Math.random() * (order.length - 1));
    [order[0], order[swapWith]] = [order[swapWith], order[0]];
  }
  return order;
}

export function initBgm() {
  const audio = new Audio();
  audio.preload = 'none';
  audio.loop = false;
  audio.volume = DEFAULT_VOLUME;
  // BGM is decorative; never let it hijack media-session hardware keys.
  audio.setAttribute('aria-hidden', 'true');

  const state = {
    tracks: [],        // [{ title, url }]
    queue: [],         // remaining indices for this shuffle cycle
    lastIndex: -1,     // last index played (to avoid back-to-back repeats)
    currentTitle: '',
    muted: readMuted(),
    started: false,    // playback has begun at least once
    ready: false,      // playlist loaded with at least one track
    loaded: false,     // /api/bgm fetch settled (success or failure)
    errorStreak: 0,    // consecutive load/decode failures
    unavailable: false, // whole library unreachable — stop retrying
  };

  const control = buildControl();
  document.body.appendChild(control.el);

  function refreshQueue() {
    state.queue = planShuffleCycle(state.tracks.length, state.lastIndex);
  }

  function playNext() {
    if (!state.tracks.length) return;
    if (!state.queue.length) refreshQueue();
    const index = state.queue.shift();
    state.lastIndex = index;
    const track = state.tracks[index];
    state.currentTitle = track.title;
    audio.src = track.url;
    state.started = true;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // Most likely the autoplay gesture hasn't happened yet; stay armed and
        // let the next user gesture trigger beginPlayback().
        state.started = false;
      });
    }
    updateControl();
  }

  function beginPlayback() {
    if (!state.ready || state.muted) return;
    if (audio.src) {
      // A track is already cued (possibly from a blocked autoplay attempt) —
      // resume/retry it. Do NOT gate on state.started: a blocked autoplay
      // leaves src set with started=false, and this is exactly the path a user
      // gesture must be able to recover.
      if (audio.paused) {
        const attempt = audio.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
      }
    } else {
      playNext();
    }
    updateControl();
  }

  function setMuted(muted, options = {}) {
    const { persist = true, notify = true } = options;
    const next = Boolean(muted);
    const changed = state.muted !== next;
    state.muted = next;
    if (persist) writeMuted(state.muted);
    if (state.muted) {
      audio.pause();
    } else {
      // Unmuting is also the "retry" affordance if the library was unreachable.
      state.unavailable = false;
      state.errorStreak = 0;
      beginPlayback();
    }
    updateControl();
    if (changed && notify) {
      window.dispatchEvent(new CustomEvent(MUTE_CHANGE_EVENT, { detail: { muted: state.muted } }));
    }
  }

  function toggleMute() {
    setMuted(!state.muted);
  }

  // ---- audio element events ------------------------------------------------
  audio.addEventListener('ended', () => {
    state.errorStreak = 0;
    if (state.muted) return;
    playNext();
  });
  audio.addEventListener('error', () => {
    if (state.muted) return;
    state.errorStreak += 1;
    // If a whole shuffle cycle's worth of tracks fails in a row (e.g. the blob
    // container isn't populated yet), stop retrying so we don't churn endless
    // 404s in the background. Unmuting resets and retries.
    if (state.tracks.length && state.errorStreak >= state.tracks.length) {
      state.unavailable = true;
      updateControl();
      return;
    }
    window.setTimeout(() => {
      if (!state.muted) playNext();
    }, ERROR_SKIP_DELAY_MS);
  });
  audio.addEventListener('playing', () => {
    // Playback truly started — only now is it safe to stop listening for the
    // arming gesture (a gesture fired while the manifest was still loading, or
    // an autoplay that the browser blocked, must not disarm us prematurely).
    state.started = true;
    state.errorStreak = 0;
    state.unavailable = false;
    disarmGesture();
    updateControl();
  });
  audio.addEventListener('pause', updateControl);

  // ---- arm on user gesture (autoplay policy) -------------------------------
  // Browsers block audible autoplay until a user gesture. Keep listening on
  // every gesture until playback actually begins, then disarm.
  const armEvents = ['pointerdown', 'keydown', 'touchstart'];
  function onGesture() {
    beginPlayback();
  }
  function disarmGesture() {
    armEvents.forEach((evt) => window.removeEventListener(evt, onGesture));
  }
  armEvents.forEach((evt) => window.addEventListener(evt, onGesture, { passive: true }));

  window.addEventListener(MUTE_CHANGE_EVENT, (event) => {
    setMuted(Boolean(event && event.detail && event.detail.muted), { persist: false, notify: false });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === MUTE_STORAGE_KEY) setMuted(readMuted(), { persist: false });
  });

  // ---- mute control UI -----------------------------------------------------
  function buildControl() {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bgm-control';
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (state.unavailable && !state.muted) {
        // In the unavailable state the button is a retry affordance.
        state.unavailable = false;
        state.errorStreak = 0;
        beginPlayback();
        updateControl();
      } else {
        toggleMute();
      }
    });
    return { el };
  }

  function updateControl() {
    const el = control.el;
    if (state.loaded && !state.tracks.length) {
      // No BGM configured for this environment — don't show a dead control.
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (state.unavailable && !state.muted) {
      el.classList.remove('is-playing');
      el.classList.add('is-muted');
      el.textContent = '🔈';
      el.setAttribute('aria-label', 'Background music unavailable — click to retry');
      el.title = 'Background music unavailable — click to retry';
      return;
    }
    const playing = !audio.paused && state.started && !state.muted;
    el.classList.toggle('is-muted', state.muted);
    el.classList.toggle('is-playing', playing);
    el.textContent = state.muted ? '🔇' : '🔊';
    const now = state.currentTitle ? `♪ ${state.currentTitle}` : 'Background music';
    el.setAttribute('aria-label', state.muted ? 'Unmute background music' : `Mute background music (${now})`);
    el.title = state.muted
      ? 'Background music muted — click to unmute'
      : `${now} — click to mute`;
  }

  // ---- load playlist from the app-owned /api/bgm contract ------------------
  fetch(BGM_API_URL, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`bgm ${res.status}`);
      return res.json();
    })
    .then((payload) => {
      const list = Array.isArray(payload && payload.tracks) ? payload.tracks : [];
      state.tracks = list
        .filter((t) => t && t.url)
        .map((t) => ({ title: t.title || t.url, url: t.url }));
      state.ready = state.tracks.length > 0;
      state.loaded = true;
      refreshQueue();
      updateControl();
      // If the user already interacted before the list finished loading, the
      // next gesture arms playback; if autoplay is permitted, start now.
      if (state.ready && !state.muted) beginPlayback();
    })
    .catch(() => {
      state.ready = false;
      state.loaded = true;
      updateControl();
    });

  updateControl();

  return {
    toggleMute,
    setMuted,
    isMuted: () => state.muted,
    nowPlaying: () => state.currentTitle,
    // exposed for debugging / tests
    _state: state,
  };
}
