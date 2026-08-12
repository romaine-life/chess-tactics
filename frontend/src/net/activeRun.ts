import type { RunDocument } from '../run/model';
import { ensureGuestRunKey, readGuestRunKey } from '../run/guestIdentity';
import { HttpError } from './http';

/** The header a signed-out player's Run travels under (ADR-0588). The server prefers a signed-in
 * session whenever there is one, so sending this while signed in is harmless — and is exactly
 * what `adoptGuestRun` relies on to name the row being inherited. */
const GUEST_RUN_KEY_HEADER = 'x-guest-run-key';

/**
 * Request headers carrying the guest identity, when there is one to carry.
 *
 * `mint` distinguishes reading from writing. A read must not create an identity — hydrating the
 * game is not playing it — so it asks only for a key that already exists. A write is the act that
 * warrants one, so it mints on first use.
 */
function guestHeaders(mint: boolean): Record<string, string> {
  const key = mint ? ensureGuestRunKey() : readGuestRunKey();
  return key ? { [GUEST_RUN_KEY_HEADER]: key } : {};
}

export interface RevisionedActiveRun {
  run: RunDocument | null;
  revision: number;
  updated_at: string | null;
}

export interface CraftedActiveRun extends RevisionedActiveRun {
  /** Admin-only presentation carried by a craft response, never persisted in RunDocument. */
  battleResult: 'player' | null;
}

function safeRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parsedActiveRun(value: unknown): RevisionedActiveRun {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const run = body.run && typeof body.run === 'object' ? body.run as RunDocument : null;
  return {
    run,
    revision: safeRevision(body.revision),
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
  };
}

function parsedCraftedActiveRun(value: unknown): CraftedActiveRun {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...parsedActiveRun(value),
    battleResult: body.battleResult === 'player' ? 'player' : null,
  };
}

export async function loadActiveRun(): Promise<RevisionedActiveRun> {
  const response = await fetch('/api/active-run', {
    credentials: 'include',
    cache: 'no-cache',
    headers: guestHeaders(false),
  });
  if (!response.ok) throw await HttpError.fromResponse('load-active-run', response);
  return parsedActiveRun(await response.json());
}

async function putActiveRun(
  body: Readonly<{ run: unknown; revision: number }>,
): Promise<Response> {
  return fetch('/api/active-run', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...guestHeaders(true) },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

/**
 * Save the Run WITHOUT its War.
 *
 * `run.war` is every Battle's Level, snapshotted once when the Run is created so that editing or
 * deleting authored content cannot change a Run already underway. It is never written again in
 * flight — so sending it with each save shipped ~325 KB to change ~3 KB of actual Run state, on
 * every placement, and put the body past the request ceiling entirely.
 *
 * The server keeps the War it is already holding for this Run. It refuses when that is a DIFFERENT
 * Run, which is exactly the case a new Run's first save is, so that answer is repaired here by
 * sending the whole document once rather than by tracking on the client which Runs the server has
 * seen. A save is not a place to be clever about state the server can simply be asked about.
 */
export async function saveActiveRun(run: RunDocument, revision: number): Promise<RevisionedActiveRun> {
  const { war: _war, ...withoutWar } = run;
  let response = await putActiveRun({ run: withoutWar, revision });
  if (response.status === 400) {
    const error = await HttpError.fromResponse('save-active-run', response);
    if (!error.details?.includes('active_run_war_required')) throw error;
    response = await putActiveRun({ run, revision });
  }
  if (!response.ok) throw await HttpError.fromResponse('save-active-run', response);
  return parsedActiveRun(await response.json());
}

/**
 * Craft the account's active Run from a minted craft link (ADR-0354). The id is all the address
 * carries; the server holds the spec it stands for and composes the state out of the game's real
 * transitions. Opening the same link again crafts it again — that is the restart button.
 */
export async function craftActiveRunFromLink(id: string): Promise<CraftedActiveRun> {
  const response = await fetch(`/api/active-run/craft/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: '{}',
  });
  if (response.ok) return parsedCraftedActiveRun(await response.json());
  throw new Error(await craftRefusal(response));
}

/**
 * Mint the permanent craft link for a hand-written `?craft=` address, without crafting it. The
 * readable grammar stays a way to WRITE a spec; the link a state is handed over as is always the
 * id, so a typed address is turned into one before anything is crafted.
 */
export async function mintRunCraftLink(address: string): Promise<string> {
  const response = await fetch('/api/run-craft-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ address }),
  });
  if (!response.ok) throw new Error(await craftRefusal(response));
  const body = await response.json() as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('The craft link could not be minted.');
  return body.url;
}

/** The refusal a person reads on the Run screen, not a status code. The crafter writes its own
 * messages for a reader, so prefer those; a gate that fails before the crafter gets one here. */
async function craftRefusal(response: Response): Promise<string> {
  let details: unknown;
  try {
    ({ details } = await response.json() as { details?: unknown });
  } catch { /* the status below is all this refusal has to go on */ }
  if (typeof details === 'string' && details.trim()) return details;
  if (response.status === 401) return 'Crafting a Run needs you signed in. Sign in, then open this link again.';
  if (response.status === 403) return 'Crafting a Run needs an administrator account.';
  return `The Run could not be crafted (${response.status}).`;
}

export async function deleteActiveRun(revision: number): Promise<void> {
  const response = await fetch('/api/active-run', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...guestHeaders(false) },
    credentials: 'include',
    body: JSON.stringify({ revision }),
  });
  if (!response.ok) throw await HttpError.fromResponse('delete-active-run', response);
}

/**
 * Hand this browser's guest Run row to the account that just signed in (ADR-0588).
 *
 * `adopted` reports whether the account TOOK the row. False covers both "there was no guest row"
 * and "the account was already playing something, so the guest row was released" — the caller
 * treats them alike, because the guest's Run is in this browser's local storage either way and the
 * store's existing browser-versus-account merge is what decides between them.
 *
 * Returns null when this browser holds no guest identity, which is the ordinary case for someone
 * who has always been signed in.
 */
export async function adoptGuestRun(): Promise<(RevisionedActiveRun & { adopted: boolean }) | null> {
  const key = readGuestRunKey();
  if (!key) return null;
  const response = await fetch('/api/active-run/adopt-guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [GUEST_RUN_KEY_HEADER]: key },
    credentials: 'include',
    body: '{}',
  });
  if (!response.ok) throw await HttpError.fromResponse('adopt-guest-run', response);
  const body = await response.json() as { adopted?: unknown };
  return { ...parsedActiveRun(body), adopted: body.adopted === true };
}
