import { isLevelEditorRoutePath } from './levelEditorRoute';

export type LevelEditorExitAction = 'allow' | 'close-rules-editor';

export interface LevelEditorExitState {
  destinationHref: string;
  replace: boolean;
  rulesEditorOpen: boolean;
  source: 'app' | 'history';
}

export function levelEditorExitAction({
  destinationHref,
  replace,
  rulesEditorOpen,
  source,
}: LevelEditorExitState): LevelEditorExitAction {
  const destination = new URL(destinationHref, 'https://chess-tactics.local');
  const destinationIsEditor = isLevelEditorRoutePath(destination.pathname);
  const destinationIsPlayTest = destination.pathname === '/play'
    && destination.searchParams.get('mode') === 'test';

  // Back/Forward already lands on an address that fully describes whether Events is open.
  // Let route synchronization restore that state instead of undoing the browser traversal.
  if (source === 'history') return 'allow';

  // Layer and brush query rewrites use replaceState and are editor state, not user departures.
  if (destinationIsEditor && replace) return 'allow';

  // Play Test already carries the exact editor address in returnTo. Let one click enter the test;
  // Back then restores the same open Events tab instead of consuming the click to close it.
  if (destinationIsPlayTest) return 'allow';

  // An app-initiated departure gives the nested Events workspace one close before leaving.
  if (rulesEditorOpen) return 'close-rules-editor';
  return 'allow';
}
