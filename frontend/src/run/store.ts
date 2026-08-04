import { create } from 'zustand';
import { reportAuthSessionFailure, startAuthSession } from '../net/authSession';
import { deleteActiveRun, loadActiveRun, saveActiveRun } from '../net/activeRun';
import { HttpError } from '../net/http';
import { RUN_FORMAT_VERSION, normalizeRunDocument, type RunDocument } from './model';
import { recordAtaraxiaCompletion } from './progression';
import { recordLipsanonStatEvents, lipsanonStatEventsForRunTransition } from './lipsanonStatistics';

const LOCAL_RUN_KEY = 'chess-tactics:active-run:v1';

function readLocalRun(): RunDocument | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RUN_KEY) ?? 'null') as RunDocument | null;
    const formatVersion = Number(parsed?.formatVersion);
    return parsed && Number.isSafeInteger(formatVersion) && formatVersion >= 1 && formatVersion <= RUN_FORMAT_VERSION
      ? normalizeRunDocument(parsed)
      : null;
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

export interface ActiveRunState {
  run: RunDocument | null;
  hydrated: boolean;
  syncing: boolean;
  /** True only after this store has successfully joined the signed-in account document. */
  accountLinked: boolean;
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
  return error instanceof Error && (
    error.message === 'Older Run Shop documents are unsupported.'
    || error.message === 'The retired Run draft phase is unsupported.'
  );
}

function queueRemoteSave(run: RunDocument): void {
  saveChain = saveChain.then(async () => {
    const state = useActiveRun.getState();
    if (!state.accountLinked || state.adoptionConflict) return;
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
            useActiveRun.setState({
              adoptionConflict: { browserRun, accountRun },
              remoteRevision: remote.revision,
              syncing: false,
              persistenceError: 'Choose which active Run this account should keep.',
            });
            return;
          }
        } catch { /* retain the original conflict below */ }
      }
      if (reportAuthSessionFailure(error)) {
        useActiveRun.setState({ accountLinked: false, persistenceError: null, syncing: false });
        return;
      }
      useActiveRun.setState({ persistenceError: 'Run progress is saved in this browser, but cloud sync is waiting.', syncing: false });
      return;
    }
    useActiveRun.setState({ syncing: false });
  });
}

export const useActiveRun = create<ActiveRunState>((set, get) => ({
  run: readLocalRun(),
  hydrated: false,
  syncing: false,
  accountLinked: false,
  remoteRevision: 0,
  persistenceError: null,
  adoptionConflict: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const browserRun = readLocalRun();
    try {
      const me = (await startAuthSession()).user;
      if (!me.signed_in) {
        recordCompletedRun(browserRun);
        set({ run: browserRun, hydrated: true, accountLinked: false, persistenceError: null });
        return;
      }
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
          accountLinked: true,
          remoteRevision: remote.revision,
          adoptionConflict: null,
          persistenceError: browserRun
            ? 'Replacing the account’s retired Run with this current Run.'
            : 'The account’s previous Run used a retired format. Start a new Run to replace it.',
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
          accountLinked: true,
          remoteRevision: remote.revision,
          adoptionConflict: { browserRun, accountRun },
          persistenceError: 'This browser and account each have an active Run.',
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
        accountLinked: true,
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
        accountLinked: false,
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
      accountLinked: true,
      remoteRevision: revision,
      adoptionConflict: null,
      persistenceError: null,
    });
  },

  abandon: async () => {
    writeLocalRun(null);
    set({ run: null, adoptionConflict: null, persistenceError: null });
    if (!get().accountLinked) return;
    // Serialize abandonment behind any already-queued progress writes so a late PUT cannot
    // resurrect the Run after its DELETE.
    await saveChain;
    const revision = get().remoteRevision;
    try {
      await deleteActiveRun(revision);
      set({ remoteRevision: 0 });
    } catch (error) {
      reportAuthSessionFailure(error);
      set({ persistenceError: 'The browser Run was cleared, but the account copy could not be abandoned yet.' });
    }
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
