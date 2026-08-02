import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import {
  createSkirmishStore,
  defaultSkirmishStore,
  type SkirmishState,
  type SkirmishStore,
} from './store';
import { SkirmishViewStoreProvider } from './SkirmishViewStoreContext';

const SkirmishStoreContext = createContext<SkirmishStore | null>(null);
const diagnosticsGlobal = globalThis as typeof globalThis & {
  __ctMountedSkirmishStores?: SkirmishStore[];
};
// The registry is diagnostics only, but it must survive Vite replacing this module:
// a direct browser probe and the mounted provider can otherwise observe different
// module generations even though the actual contextual store remains healthy.
const mountedSkirmishStores = diagnosticsGlobal.__ctMountedSkirmishStores ??= [];

/** One game-session store per mounted battlefield activity (Deployment may promote it to Battle). */
export function SkirmishStoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [store] = useState(createSkirmishStore);
  useEffect(() => {
    mountedSkirmishStores.push(store);
    return () => {
      const index = mountedSkirmishStores.lastIndexOf(store);
      if (index >= 0) mountedSkirmishStores.splice(index, 1);
    };
  }, [store]);
  return (
    <SkirmishStoreContext.Provider value={store}>
      <SkirmishViewStoreProvider>
        {children}
      </SkirmishViewStoreProvider>
    </SkirmishStoreContext.Provider>
  );
}

/** Read-only automation/diagnostic access to the foremost mounted session. */
export function activeSkirmishStoreForDiagnostics(): SkirmishStore | null {
  return mountedSkirmishStores.at(-1) ?? null;
}

export function useSkirmishStoreApi(): SkirmishStore {
  return useContext(SkirmishStoreContext) ?? defaultSkirmishStore;
}

export function useSkirmish<T>(selector: (state: SkirmishState) => T): T {
  return useStore(useSkirmishStoreApi(), selector);
}
