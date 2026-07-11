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

  // Layer and brush query rewrites use replaceState and are editor state, not user departures.
  if (destinationIsEditor && source === 'app' && replace) return 'allow';

  // The full rules editor is a nested surface. A first Back closes it, even when the level
  // beneath it has a working draft; a subsequent Back continues normal navigation.
  if (rulesEditorOpen) return 'close-rules-editor';
  return 'allow';
}
