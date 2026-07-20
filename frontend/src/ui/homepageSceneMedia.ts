import { requiredDrawableRole } from '@chess-tactics/board-render';

/** The exact installed media consumed by the homepage DOM. This lives outside
 * SceneBackdrop so startup can prioritize the binding without importing the
 * scene module's catalog-backed Studio proxy before hydration. */
export function homepageSceneMedia() {
  const binding = requiredDrawableRole('animated-scene', 'homepage-scene').media.background?.media;
  if (!binding) throw new Error('installed homepage scene has no background media');
  return binding;
}
