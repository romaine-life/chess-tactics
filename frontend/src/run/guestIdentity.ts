/**
 * The identity a signed-out player's Run persists under (ADR-0588).
 *
 * A guest holds an opaque key; the server holds only its SHA-256. That is the shape the auth
 * session cookie already uses and the shape the Level Editor's page credential already uses, so
 * it is reused here rather than a third one being invented for guests.
 *
 * The key lives in local storage BESIDE the guest's Run, which is deliberate: clearing browser
 * storage should lose the local Run and the ability to reach its server row together. A guest who
 * keeps one without the other would be reading a Run they can no longer write, or writing a row
 * they can no longer see.
 */

const GUEST_RUN_KEY = 'chess-tactics:guest-run-key:v1';

/** 64 lowercase hex characters — the 32 random bytes the server's SHA-256 is taken over. */
const VALID_GUEST_KEY = /^[0-9a-f]{64}$/;

/** The same bare global `store.ts` reads the Run itself through, so the key and the Run it
 * identifies are always found in — or missing from — the same place. */
function guestKeyStore(): Storage | null {
  try {
    return localStorage;
  } catch {
    // Storage disabled by the browser. Guest play stays on the device, which is what it did
    // before guests had a server identity at all.
    return null;
  }
}

/**
 * A fresh key, or null when this browser cannot produce one securely.
 *
 * There is deliberately no `Math.random` fallback. The key IS the authority to write the guest's
 * Run row, so a guessable one would hand that row to anyone who guessed it — a weaker guarantee
 * than the local-only play it replaces. Same reasoning as the Level Editor's page session key,
 * which refuses for the same reason.
 */
function mintGuestRunKey(): string | null {
  try {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') return null;
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** The key this browser already holds, or null. Reading never mints one. */
export function readGuestRunKey(): string | null {
  const store = guestKeyStore();
  if (!store) return null;
  try {
    const raw = store.getItem(GUEST_RUN_KEY);
    return typeof raw === 'string' && VALID_GUEST_KEY.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The key this browser persists guest Runs under, minting one on first use.
 *
 * Minting is lazy on purpose: loading the game is not playing it, and a visitor who never starts
 * a Run should leave nothing behind. The first acknowledged Run mutation is what asks for this,
 * so the identity and the row it owns come into being together.
 *
 * Null means guest persistence is unavailable in this browser. Callers keep playing locally.
 */
export function ensureGuestRunKey(): string | null {
  const existing = readGuestRunKey();
  if (existing) return existing;
  const store = guestKeyStore();
  if (!store) return null;
  const minted = mintGuestRunKey();
  if (!minted) return null;
  try {
    store.setItem(GUEST_RUN_KEY, minted);
  } catch {
    return null;
  }
  return minted;
}

/**
 * Forget this browser's guest identity, after the account has adopted the row it owned.
 *
 * Called once the server has moved or released the guest row. Keeping the key would leave the
 * signed-in player able to write a row they no longer own, and would make a later sign-out
 * silently resume an identity the account has already absorbed.
 */
export function clearGuestRunKey(): void {
  const store = guestKeyStore();
  if (!store) return;
  try {
    store.removeItem(GUEST_RUN_KEY);
  } catch {
    // Nothing to repair: the server row is already gone, so the stale key names nothing.
  }
}
