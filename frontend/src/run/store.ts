import { create } from 'zustand';
import { fetchMe } from '../net/auth';
import { deleteActiveRun, loadActiveRun, saveActiveRun } from '../net/activeRun';
import { HttpError } from '../net/http';
import { normalizeRunDocument, type RunDocument } from './model';
import { recordRunRelicStatEvents, relicStatEventsForRunTransition } from './relicStatistics';

const LOCAL_RUN_KEY = 'chess-tactics:active-run:v1';

function readLocalRun(): RunDocument | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RUN_KEY) ?? 'null') as RunDocument | null;
    return parsed && (
      Number(parsed.formatVersion) === 1
      || Number(parsed.formatVersion) === 2
      || Number(parsed.formatVersion) === 3
      || Number(parsed.formatVersion) === 4
    )
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

export interface RunAdoptionConflict {
  browserRun: RunDocument;
  accountRun: RunDocument;
}

export interface ActiveRunState {
  run: RunDocument | null;
  hydrated: boolean;
  syncing: boolean;
  signedIn: boolean;
  remoteRevision: number;
  persistenceError: string | null;
  adoptionConflict: RunAdoptionConflict | null;
  hydrate: () => Promise<void>;
  replace: (run: RunDocument) => void;
  abandon: () => Promise<void>;
  keepAccountRun: () => void;
  adoptBrowserRun: () => Promise<void>;
}

let saveChain: Promise<void> = Promise.resolve();

function queueRemoteSave(run: RunDocument): void {
  saveChain = saveChain.then(async () => {
    const state = useActiveRun.getState();
    if (!state.signedIn || state.adoptionConflict) return;
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
          if (remote.run && browserRun && remote.run.id !== browserRun.id) {
            useActiveRun.setState({
              adoptionConflict: { browserRun, accountRun: remote.run },
              remoteRevision: remote.revision,
              persistenceError: 'Choose which active Run this account should keep.',
            });
            return;
          }
        } catch { /* retain the original conflict below */ }
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
  signedIn: false,
  remoteRevision: 0,
  persistenceError: null,
  adoptionConflict: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const browserRun = readLocalRun();
    try {
      const me = await fetchMe();
      if (!me.signed_in) {
        set({ run: browserRun, hydrated: true, signedIn: false, persistenceError: null });
        return;
      }
      const remote = await loadActiveRun();
      const accountRun = remote.run ? normalizeRunDocument(remote.run) : null;
      if (accountRun && browserRun && accountRun.id !== browserRun.id) {
        set({
          run: accountRun,
          hydrated: true,
          signedIn: true,
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
      set({
        run,
        hydrated: true,
        signedIn: true,
        remoteRevision: remote.revision,
        persistenceError: null,
      });
      writeLocalRun(run);
      if ((!accountRun || browserIsNewer) && browserRun) queueRemoteSave(browserRun);
    } catch (error) {
      set({
        run: browserRun,
        hydrated: true,
        signedIn: false,
        persistenceError: error instanceof HttpError && error.status === 401
          ? null
          : 'Run progress is available in this browser; cloud sync could not be reached.',
      });
    }
  },

  replace: (run) => {
    recordRunRelicStatEvents(relicStatEventsForRunTransition(get().run, run));
    writeLocalRun(run);
    set({ run, persistenceError: null });
    queueRemoteSave(run);
  },

  abandon: async () => {
    writeLocalRun(null);
    set({ run: null, adoptionConflict: null, persistenceError: null });
    if (!get().signedIn) return;
    // Serialize abandonment behind any already-queued progress writes so a late PUT cannot
    // resurrect the Run after its DELETE.
    await saveChain;
    const revision = get().remoteRevision;
    try {
      await deleteActiveRun(revision);
      set({ remoteRevision: 0 });
    } catch {
      set({ persistenceError: 'The browser Run was cleared, but the account copy could not be abandoned yet.' });
    }
  },

  keepAccountRun: () => {
    const conflict = get().adoptionConflict;
    if (!conflict) return;
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
      writeLocalRun(conflict.browserRun);
      set({
        run: conflict.browserRun,
        adoptionConflict: null,
        remoteRevision: saved.revision,
        syncing: false,
        persistenceError: null,
      });
    } catch {
      set({ syncing: false, persistenceError: 'The browser Run could not replace the account Run.' });
    }
  },
}));
