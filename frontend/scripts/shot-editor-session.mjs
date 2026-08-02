const LEVEL_EDITOR_PATHS = new Set(['/editor/level', '/edit', '/level-editor']);
const EDIT_SESSION_OPEN_PATH = /^\/api\/editor-documents\/[^/]+\/edit-sessions$/;

export function isLevelEditorUrl(value) {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, '') || '/';
    return LEVEL_EDITOR_PATHS.has(path);
  } catch {
    return false;
  }
}

/** The one request that decides whether automated verification joins a document as an observer
 *  or as an editing participant. Shared by the page-side rewrite and by the node-side tally that
 *  proves the rewrite was actually applied to every one of them. */
export function isEditSessionOpenRequest(method, requestUrl) {
  if (method !== 'POST') return false;
  try {
    return EDIT_SESSION_OPEN_PATH.test(new URL(requestUrl).pathname);
  } catch {
    return false;
  }
}

export function observationOpenPostData({ targetIsLevelEditor, method, requestUrl, postData }) {
  if (!targetIsLevelEditor) return null;
  if (!isEditSessionOpenRequest(method, requestUrl)) return null;
  try {
    const body = JSON.parse(postData || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return JSON.stringify({ ...body, intent: 'observe' });
  } catch {
    return null;
  }
}

export function isObservationSessionState(value) {
  return value === 'observing';
}

const OBSERVATION_TALLY_KEY = '__ctObservationPatch';

/** Install the observation rewrite INSIDE the page, patching `window.fetch`, rather than through
 *  CDP request interception (`page.setRequestInterception`).
 *
 *  Interception routes EVERY request in the page through this node process, and against the Vite
 *  dev server that wedges module requests: scripts/run-battle-e2e.mjs measured 6/6 runs hung with
 *  the AI worker's own module graph (/src/core/ai.ts, rules.ts, rng.ts) paused in flight forever,
 *  versus 6/6 clean runs with interception removed (commit af37db63). A paused request raises no
 *  error event, so nothing times out — the page simply waits, and every deadline in the caller
 *  expires against a browser that is not making progress. Level Editor verification loads the
 *  same lazily-imported board modules, so it carries exactly that risk for no benefit.
 *
 *  The session-open is a plain `fetch` — net/http.ts `requestJson` sends a string URL and a JSON
 *  string body with credentials — so patching `window.fetch` reaches precisely the same request
 *  without putting the page's whole module graph behind this process. The tally lives in
 *  sessionStorage so it survives the cleanup navigation that closes the observing session. */
export async function installObservationSessionPatch(page) {
  // The page script is composed from the function sources above so the predicate keeps ONE
  // definition. That composition holds only while those functions stay free of template literals:
  // an interpolation inside one would be evaluated HERE instead of reaching the page. Parse the
  // composed source before shipping it, so that mistake surfaces as a named error out here rather
  // than as a silently broken patch inside the browser.
  const source = `
(() => {
  const EDIT_SESSION_OPEN_PATH = ${EDIT_SESSION_OPEN_PATH.toString()};
  const isEditSessionOpenRequest = ${isEditSessionOpenRequest.toString()};
  const observationOpenPostData = ${observationOpenPostData.toString()};
  const KEY = ${JSON.stringify(OBSERVATION_TALLY_KEY)};

  const loadTally = () => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (stored && typeof stored === 'object') return stored;
    } catch { /* fall through to a fresh tally */ }
    return { sessionOpens: 0, rewrites: 0, escaped: [] };
  };
  const saveTally = (tally) => {
    window[KEY] = tally;
    try { sessionStorage.setItem(KEY, JSON.stringify(tally)); } catch { /* window copy still stands */ }
  };
  saveTally(loadTally());

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    let href;
    try {
      href = new URL(isRequest ? input.url : String(input), location.href).href;
    } catch {
      return nativeFetch(input, init);
    }
    const method = String(init?.method ?? (isRequest ? input.method : 'GET') ?? 'GET').toUpperCase();
    if (!isEditSessionOpenRequest(method, href)) return nativeFetch(input, init);

    const tally = loadTally();
    tally.sessionOpens += 1;
    const giveUp = (reason) => {
      // Never swallow the request: an unrewritten open is reported, and the caller fails the run
      // rather than quietly continuing as a writing participant.
      tally.escaped.push({ href, reason });
      saveTally(tally);
      return nativeFetch(input, init);
    };

    let postData = init?.body;
    if (typeof postData !== 'string' && isRequest) {
      try { postData = await input.clone().text(); } catch { return giveUp('unreadable-request-body'); }
    }
    if (typeof postData !== 'string') return giveUp('non-string-body');

    const observed = observationOpenPostData({
      targetIsLevelEditor: true, method, requestUrl: href, postData,
    });
    if (!observed) return giveUp('unparseable-body');

    tally.rewrites += 1;
    saveTally(tally);
    // Any transport failure past this point belongs to the app, not to the patch: the rewrite is
    // already recorded, so it propagates untouched.
    return isRequest
      ? nativeFetch(new Request(input, { body: observed }))
      : nativeFetch(input, { ...init, body: observed });
  };
})();
  `;
  try {
    // eslint-disable-next-line no-new-func -- node-side syntax check only; never evaluated.
    new Function(source);
  } catch (error) {
    throw new Error(`observation patch source did not compose into valid JS: ${error.message}`);
  }
  await page.evaluateOnNewDocument(source);
}

/** Record every edit-session open the BROWSER made, across every transport. `page.on('request')`
 *  needs no interception, so this observation costs the page nothing. Compared against the
 *  page-side tally it proves the rewrite was consumed — an open this process saw but the patch did
 *  not rewrite means the app reached the network by some path `window.fetch` does not cover, and
 *  the run would silently be an EDITING participant in the owner's live document. */
export function watchEditSessionOpens(page) {
  const opens = [];
  page.on('request', (request) => {
    if (isEditSessionOpenRequest(request.method(), request.url())) opens.push(request.url());
  });
  return opens;
}

/** Throw unless every observed session-open went through the page-side rewrite. Zero opens is a
 *  legitimate outcome (a capture may never open a session); an open that ESCAPED the patch is not. */
export async function assertObservationPatchConsumed(page, observedOpens) {
  const tally = await page.evaluate((key) => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (stored && typeof stored === 'object') return stored;
    } catch { /* fall through to the window copy */ }
    return window[key] ?? null;
  }, OBSERVATION_TALLY_KEY);
  if (!tally) {
    throw new Error('observation fetch patch never installed — the run cannot prove it is observation-only');
  }
  if (tally.escaped?.length || tally.rewrites < observedOpens.length) {
    throw new Error(`edit-session open escaped the observation patch: ${JSON.stringify({
      observedOpens, tally,
    })}`);
  }
  return tally;
}
