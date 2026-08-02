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
  createSkirmishViewStore,
  type SkirmishViewState,
  type SkirmishViewStore,
} from './skirmishView';

const SkirmishViewStoreContext = createContext<SkirmishViewStore | null>(null);
const diagnosticsGlobal = globalThis as typeof globalThis & {
  __ctMountedSkirmishViewStores?: SkirmishViewStore[];
};
const mountedSkirmishViewStores = diagnosticsGlobal.__ctMountedSkirmishViewStores ??= [];

/** Explicit provider for a battlefield lifetime or a standalone HUD presentation. */
export function SkirmishViewStoreProvider({
  children,
  store: suppliedStore,
}: {
  children: ReactNode;
  store?: SkirmishViewStore;
}): ReactElement {
  const [store] = useState(() => suppliedStore ?? createSkirmishViewStore());
  useEffect(() => {
    mountedSkirmishViewStores.push(store);
    return () => {
      const index = mountedSkirmishViewStores.lastIndexOf(store);
      if (index >= 0) mountedSkirmishViewStores.splice(index, 1);
    };
  }, [store]);
  return (
    <SkirmishViewStoreContext.Provider value={store}>
      {children}
    </SkirmishViewStoreContext.Provider>
  );
}

/** Read-only automation access to the foremost mounted battlefield view. */
export function activeSkirmishViewStoreForDiagnostics(): SkirmishViewStore | null {
  return mountedSkirmishViewStores.at(-1) ?? null;
}

export function useSkirmishViewStoreApi(): SkirmishViewStore {
  const store = useContext(SkirmishViewStoreContext);
  if (!store) throw new Error('Skirmish view state requires a SkirmishViewStoreProvider.');
  return store;
}

export function useSkirmishView<T>(selector: (state: SkirmishViewState) => T): T {
  return useStore(useSkirmishViewStoreApi(), selector);
}
