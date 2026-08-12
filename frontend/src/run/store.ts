import { create } from 'zustand';
import { reportAuthSessionFailure, startAuthSession } from '../net/authSession';
import { adoptGuestRun, deleteActiveRun, loadActiveRun, saveActiveRun } from '../net/activeRun';
import { HttpError } from '../net/http';
import { clearGuestRunKey, readGuestRunKey } from './guestIdentity';
import {
  UnsupportedRunSaveError,
  migrateRunSaveDocument,
  normalizeRunDocument,
  type RunDocument,
} from './model';
import { recordAtaraxiaCompletion } from './progression';
import { recordLipsanonStatEvents, lipsanonStatEventsForRunTransition } from './lipsanonStatistics';

const LOCAL_RUN_KEY = 'chess-tactics:active-run:v1';

function readLocalRun(): RunDocument | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RUN_KEY) ?? 'null') as unknown;
    if (!parsed) return null;
    const run = migrateRunSaveDocument(parsed);
    localStorage.setItem(LOCAL_RUN_KEY, JSON.stringify(run));
    return run;
  } catch {
    return null;
  }
}

function writeLocalRun(run: RunDocument | null): void {
  try {
    if (run) localStorage.setItem(LOCAL_RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(LOCAL_RUN_KEY);
  } catch {
    // The active tab remains playable. The UI exposes that cloud/browser persistence
    // is unavailable through persistenceError rather than pretending this succeeded.
  }
}

function recordCompletedRun(run: RunDocument | null): void {
  if (run?.phase === 'victory') recordAtaraxiaCompletion(run.ataraxiaTier);
}

export interface RunAdoptionConflict {
  browserRun: RunDocument;
  accountRun: RunDocument;
}

/**
 * Whose server-held Run document this store is writing to (ADR-0587).
 *
 * `'account'` is the signed-in player's row. `'guest'` is the row a signed-out player's browser
 * owns through the opaque key in `guestIdentity`. `null` is browser-only play — which is what
 * every signed-out player used to get, and is still what a browser that cannot mint a key gets.
 *
 * One field rather than a pair of booleans: a store cannot be linked to both documents at once,
 * and two flags could say that it was.
 */
export type RunRemoteOwner = 'account' | 'guest' | null;

export interface ActiveRunState {
  run: RunDocument | null;
  hydrated: boolean;
  syncing: boolean;
  /** Which server document this store has joined, or null while play is browser-only. */
  remoteOwner: RunRemoteOwner;
  remoteRevision: number;
  persistenceError: string | null;
  adoptionConflict: RunAdoptionConflict | null;
  hydrate: () => Promise<void>;
  replace: (run: RunDocument) => void;
  adoptCraftedRun: (run: RunDocument, revision: number) => void;
  abandon: () => Promise<void>;
  keepAccountRun: () => void;
  adoptBrowserRun: () => Promise<void>;
}

let saveChain: Promise<void> = Promise.resolve();

function isUnsupportedRunDocument(error: unknown): boolean {
  return error instanceof UnsupportedRunSaveError;
}

function queueRemoteSave(run: RunDocument): void {
  saveChain = saveChain.then(async () => {
    const state = useActiveRun.getState();
    if (!state.remoteOwner || state.adoptionConflict) return;
    const owner = state.remoteOwner;
    useActiveRun.setState({ syncing: true });
    try {
      const saved = await saveActiveRun(run, state.remoteRevision);
      // Do not replace a newer in-memory state with the body acknowledged for an older
      // queued write. Only advance the CAS token.
      useActiveRun.setState({ remoteRevision: saved.revision, persistenceError: null });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        try {
          const remote = await loadActiveRun();
          const browserRun = useActiveRun.getState().run;
          const accountRun = remote.run ? normalizeRunDocument(remote.run) : null;
          if (accountRun && browserRun && accountRun.id !== browserRun.id) {
            // No companion message: `adoptionConflict` IS the state, and Run preparation states
            // it in full behind Current Run, where the player who has to answer it already is
            // (ADR-0557). Restating it in the shared error channel put it beside Start New Run,
            // which the conflict has never gated.
            useActiveRun.setState({
              adoptionConflict: { browserRun, accountRun },
              remoteRevision: remote.revision,
              syncing: false,
              persistenceError: null,
            });
            return;
          }
        } catch { /* retain the original conflict below */ }
      }
      if (owner === 'guest' && error instanceof HttpError && error.status === 401) {
        // The browser could not mint a guest key, so there is no identity to persist under. This
        // is not a failure to report: it is the local-only play signed-out players always had.
        useActiveRun.setState({ remoteOwner: null, persistenceError: null, syncing: false });
        return;
      }
      if (reportAuthSessionFailure(error)) {
        useActiveRun.setState({ remoteOwner: null, persistenceError: null, syncing: false });
        return;
      }
      useActiveRun.setState({ persistenceError: 'Run progress is saved in this browser, but cloud sync is waiting.', syncing: false });
      return;
    }
    useActiveRun.setState({ syncing: false });
  });
}

/**
 * Hand this browser's guest Run row to the account that just signed in (ADR-0587).
 *
 * The guest key is forgotten once the server has answered, because the row it named is gone
 * either way — moved onto the account, or released because the account was already playing
 * something. Keeping it would leave a signed-in player holding write authority over a row that is
 * no longer theirs, and would make a later sign-out silently resume an identity already absorbed.
 *
 * A failure here is not fatal to signing in. The key is kept so the next hydrate tries again,
 * which is the correct outcome: the guest row still exists and still belongs to this browser.
 */
async function adoptGuestRunForAccount(): Promise<void> {
  if (!readGuestRunKey()) return;
  try {
    await adoptGuestRun();
    clearGuestRunKey();
  } catch {
    // Left for the next hydrate. The account read below is unaffected — it reads the account's
    // own row, which is simply not yet holding the guest's Run.
  }
}

/**
 * The signed-out hydration (ADR-0587).
 *
 * A guest's browser is the authority on their Run, which is the same rule `campaign_progress`
 * already states for guest campaign progress. So the local Run wins whenever there is one, and the
 * server row is read for the case that makes guest persistence worth having at all: local storage
 * lost or unreadable, with the row still holding the Run.
 *
 * That is why this needs no two-way chooser like the account path. An account's two Runs can come
 * from two devices and only a person can pick between them; a guest row is written by exactly one
 * browser, so there is never a second party to consult.
 */
async function guestHydration(
  set: (partial: Partial<ActiveRunState>) => void,
  browserRun: RunDocument | null,
): Promise<void> {
  const settled = { hydrated: true, remoteOwner: 'guest' as const, adoptionConflict: null, persistenceError: null };
  // No key means this browser has never persisted a guest Run. Reading would mint the identity
  // that only playing should mint, so start local: the first save creates the key and its row
  // together.
  if (!readGuestRunKey()) {
    recordCompletedRun(browserRun);
    set({ ...settled, run: browserRun, remoteRevision: 0 });
    return;
  }
  let remote;
  try {
    remote = await loadActiveRun();
  } catch {
    recordCompletedRun(browserRun);
    // Play stays in this browser for the session, exactly as a failed account hydrate does. The
    // link is dropped rather than kept with a revision of 0: the row may be well past that, and a
    // save carrying a stale token would spend every mutation losing a conflict it cannot settle.
    set({
      ...settled,
      remoteOwner: null,
      run: browserRun,
      remoteRevision: 0,
      persistenceError: 'Run progress is available in this browser; cloud sync could not be reached.',
    });
    return;
  }
  let guestRun: RunDocument | null = null;
  if (remote.run) {
    try {
      guestRun = normalizeRunDocument(remote.run);
    } catch (error) {
      // A row written by an older build. The browser's Run replaces it on the next save; a guest
      // has no second device whose copy might still be readable.
      if (!isUnsupportedRunDocument(error)) throw error;
    }
  }
  const run = browserRun ?? guestRun;
  recordCompletedRun(run);
  writeLocalRun(run);
  set({ ...settled, run, remoteRevision: remote.revision });
  // AFTER the state is applied, because the queued save reads the store to find out which
  // document it is writing to — and would skip itself entirely against the pre-hydrate state.
  // The row catches up whenever the browser is ahead of it.
  if (browserRun && (!guestRun || guestRun.id !== browserRun.id)) queueRemoteSave(browserRun);
}

const activeRunGlobal = globalThis as typeof globalThis & {
  __ctActiveRunStore?: ReturnType<typeof createActiveRunStore>;
};

/**
 * The one active-Run store, held on a global so it SURVIVES Vite replacing this module.
 *
 * Same reasoning as the mounted-Skirmish registry in `game/SkirmishStoreContext`: in dev the
 * app can be running one module generation while a later `import()` — a browser probe, a
 * verification gate, a lazily-loaded route — evaluates a fresh one. Two generations of a
 * module-scope `create()` are two stores, and then the Run the screen is paying into is not
 * the Run the other caller is reading. That failure is silent and looks exactly like the
 * payment never happening: the Battle log names the gold, the title bar moves, and the probe
 * sees an unchanged balance.
 *
 * In production there is only ever one generation, so this is just where the store lives.
 */
export const useActiveRun = activeRunGlobal.__ctActiveRunStore ??= createActiveRunStore();

function createActiveRunStore() {
  return create<ActiveRunState>((set, get) => ({
  run: readLocalRun(),
  hydrated: false,
  syncing: false,
  remoteOwner: null,
  remoteRevision: 0,
  persistenceError: null,
  adoptionConflict: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const browserRun = readLocalRun();
    try {
      const me = (await startAuthSession()).user;
      if (!me.signed_in) {
        await guestHydration(set, browserRun);
        return;
      }
      // Inherit whatever this browser was playing as a guest BEFORE reading the account, so the
      // row read below is already the adopted one. The Run's own content still merges by the
      // rules further down — this settles which server row is the account's, not which Run wins.
      await adoptGuestRunForAccount();
      const remote = await loadActiveRun();
      let accountRun: RunDocument | null = null;
      let accountRunUnsupported = false;
      if (remote.run) {
        try {
          accountRun = normalizeRunDocument(remote.run);
        } catch (error) {
          if (!isUnsupportedRunDocument(error)) throw error;
          accountRunUnsupported = true;
        }
      }
      if (accountRunUnsupported) {
        recordCompletedRun(browserRun);
        set({
          run: browserRun,
          hydrated: true,
          remoteOwner: 'account',
          remoteRevision: remote.revision,
          adoptionConflict: null,
          persistenceError: browserRun
            ? 'Replacing the account’s retired Run with this current Run.'
            : 'The account’s previous Run used an unsupported save version. Start a new Run to replace it.',
        });
        writeLocalRun(browserRun);
        if (browserRun) queueRemoteSave(browserRun);
        return;
      }
      if (accountRun && browserRun && accountRun.id !== browserRun.id) {
        recordCompletedRun(accountRun);
        recordCompletedRun(browserRun);
        set({
          run: accountRun,
          hydrated: true,
          remoteOwner: 'account',
          remoteRevision: remote.revision,
          adoptionConflict: { browserRun, accountRun },
          // Same as the save path above: the conflict speaks for itself where it is answered.
          persistenceError: null,
        });
        return;
      }
      const browserIsNewer = Boolean(
        accountRun
        && browserRun
        && accountRun.id === browserRun.id
        && Date.parse(browserRun.updatedAt) > Date.parse(accountRun.updatedAt),
      );
      const run = browserIsNewer ? browserRun : accountRun ?? browserRun;
      recordCompletedRun(run);
      set({
        run,
        hydrated: true,
        remoteOwner: 'account',
        remoteRevision: remote.revision,
        persistenceError: null,
      });
      writeLocalRun(run);
      if ((!accountRun || browserIsNewer) && browserRun) queueRemoteSave(browserRun);
    } catch (error) {
      recordCompletedRun(browserRun);
      const signedOut = reportAuthSessionFailure(error);
      set({
        run: browserRun,
        hydrated: true,
        remoteOwner: null,
        persistenceError: signedOut
          ? null
          : 'Run progress is available in this browser; cloud sync could not be reached.',
      });
    }
  },

  replace: (run) => {
    recordLipsanonStatEvents(lipsanonStatEventsForRunTransition(get().run, run));
    recordCompletedRun(run);
    writeLocalRun(run);
    set({ run, persistenceError: null });
    queueRemoteSave(run);
  },

  // A crafted Run is already the account's Run: the server composed it and wrote the row it
  // reports the revision of. Adopting it therefore takes the acknowledged revision rather than
  // saving it back — a PUT here would race the craft's own write and could only lose to it. Any
  // browser/account adoption conflict is settled by the craft too: this IS the answer.
  adoptCraftedRun: (run, revision) => {
    recordLipsanonStatEvents(lipsanonStatEventsForRunTransition(get().run, run));
    recordCompletedRun(run);
    writeLocalRun(run);
    set({
      run,
      hydrated: true,
      remoteOwner: 'account',
      remoteRevision: revision,
      adoptionConflict: null,
      persistenceError: null,
    });
  },

  abandon: async () => {
    // The browser is rid of the Run before this function ever suspends, so a caller that only
    // wants it gone — and to leave — needs nothing from the promise. Awaiting it is for callers
    // that go on to write a REPLACEMENT Run under the same account.
    writeLocalRun(null);
    set({ run: null, adoptionConflict: null, persistenceError: null });
    if (!get().remoteOwner) return;
    // The DELETE belongs IN the save chain, not merely behind it. Behind it only stops an
    // already-queued PUT from resurrecting the Run; inside it also stops the reverse, where a
    // Run started moments later queues its PUT while this DELETE is still in flight and has its
    // brand-new row deleted out from under it. That reverse race is what an unawaited abandon
    // would otherwise open.
    saveChain = saveChain.then(async () => {
      const revision = useActiveRun.getState().remoteRevision;
      try {
        await deleteActiveRun(revision);
        useActiveRun.setState({ remoteRevision: 0 });
      } catch (error) {
        reportAuthSessionFailure(error);
        useActiveRun.setState({ persistenceError: 'The browser Run was cleared, but the account copy could not be abandoned yet.' });
      }
    });
    await saveChain;
  },

  keepAccountRun: () => {
    const conflict = get().adoptionConflict;
    if (!conflict) return;
    recordCompletedRun(conflict.accountRun);
    writeLocalRun(conflict.accountRun);
    set({ run: conflict.accountRun, adoptionConflict: null, persistenceError: null });
  },

  adoptBrowserRun: async () => {
    const conflict = get().adoptionConflict;
    if (!conflict) return;
    set({ syncing: true });
    try {
      await deleteActiveRun(get().remoteRevision);
      const saved = await saveActiveRun(conflict.browserRun, 0);
      recordCompletedRun(conflict.browserRun);
      writeLocalRun(conflict.browserRun);
      set({
        run: conflict.browserRun,
        adoptionConflict: null,
        remoteRevision: saved.revision,
        syncing: false,
        persistenceError: null,
      });
    } catch (error) {
      reportAuthSessionFailure(error);
      set({ syncing: false, persistenceError: 'The browser Run could not replace the account Run.' });
    }
  },
  }));
}
