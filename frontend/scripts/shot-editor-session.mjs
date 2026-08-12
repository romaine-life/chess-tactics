const LEVEL_EDITOR_PATHS = new Set(['/editor/level', '/edit', '/level-editor']);
const EDIT_SESSION_OPEN_PATH = /^\/api\/editor-documents\/[^/]+\/edit-sessions$/;
const DOCUMENT_RESOLVE_PATH = /^\/api\/editor-documents\/resolve$/;

/** The two refusals an observing resolve can earn from the server. Named here so the capture can
 *  report the FACT it hit — no document for this level, or a URL that would create one — instead of
 *  surfacing a bare HTTP status from somewhere inside the editor's bootstrap. */
export const OBSERVATION_RESOLVE_REFUSALS = {
  editor_document_not_found_for_level:
    'no editor document exists for this level yet, and an observing capture will not create one',
  observation_cannot_create_editor_document:
    'this editor URL carries no levelId, so opening it would create a new working copy',
};

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

/** The request that DECIDES WHETHER A DOCUMENT EXISTS AT ALL. Resolve both attaches to a working
 *  copy and, for a URL that has none, creates one — so a capture that rewrites only the session-open
 *  observes a document it silently brought into being. Same predicate shape as the open, and shared
 *  with the tally for the same reason. */
export function isEditorDocumentResolveRequest(method, requestUrl) {
  if (method !== 'POST') return false;
  try {
    return DOCUMENT_RESOLVE_PATH.test(new URL(requestUrl).pathname);
  } catch {
    return false;
  }
}

/** Which document-touching request this is, or null for everything else. One classifier so the
 *  page-side rewrite and the node-side tally cannot drift apart about what needed rewriting. */
export function editorDocumentObservationKind(method, requestUrl) {
  if (isEditSessionOpenRequest(method, requestUrl)) return 'edit-session-open';
  if (isEditorDocumentResolveRequest(method, requestUrl)) return 'resolve';
  return null;
}

export function observationOpenPostData({ targetIsLevelEditor, method, requestUrl, postData }) {
  if (!targetIsLevelEditor) return null;
  if (!editorDocumentObservationKind(method, requestUrl)) return null;
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
  const DOCUMENT_RESOLVE_PATH = ${DOCUMENT_RESOLVE_PATH.toString()};
  const isEditSessionOpenRequest = ${isEditSessionOpenRequest.toString()};
  const isEditorDocumentResolveRequest = ${isEditorDocumentResolveRequest.toString()};
  const editorDocumentObservationKind = ${editorDocumentObservationKind.toString()};
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
    if (!editorDocumentObservationKind(method, href)) return nativeFetch(input, init);

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

/** Record every document-touching request the BROWSER made, across every transport.
 *  `page.on('request')` needs no interception, so this observation costs the page nothing. Compared
 *  against the page-side tally it proves the rewrite was consumed — a request this process saw but
 *  the patch did not rewrite means the app reached the network by some path `window.fetch` does not
 *  cover, and the run would silently be an EDITING participant in the owner's live document, or
 *  would MINT one of its own. */
export function watchEditSessionOpens(page) {
  const opens = [];
  page.on('request', (request) => {
    if (editorDocumentObservationKind(request.method(), request.url())) opens.push(request.url());
  });
  return opens;
}

/** Report the server's refusal of an observing resolve as the fact the capture actually hit. A
 *  refusal is the contract working: the run asked to look at a document that does not exist, or at
 *  a URL whose only outcome is a new one. Returns null for every other response. */
export function observationResolveRefusal(status, body) {
  if (status !== 404 && status !== 409) return null;
  let error;
  try {
    error = (typeof body === 'string' ? JSON.parse(body) : body)?.error;
  } catch {
    return null;
  }
  const reason = OBSERVATION_RESOLVE_REFUSALS[error];
  return reason ? { error, reason } : null;
}

/** Throw unless every observed document-touching request went through the page-side rewrite. Zero
 *  is a legitimate outcome (a capture may never resolve or open a session); one that ESCAPED the
 *  patch is not. */
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
