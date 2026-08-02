import { SCENE_SLOT_IDS } from './sceneManifest';
import type { SceneInstance, ScenePath, SceneSlotId } from './sceneManifest';

export interface SceneSlotState {
  id: SceneSlotId;
  committed: SceneInstance | null;
  pending: SceneInstance | null;
}

// Derived from the scene graph rather than retyped: the hand-maintained copy had
// already drifted (it was missing `run-detail-content`), so the projection silently
// omitted a mounted slot.
const ALL_SLOTS: readonly SceneSlotId[] = SCENE_SLOT_IDS;

function instanceForSlot(path: ScenePath | null, id: SceneSlotId): SceneInstance | null {
  return path?.instances.find((candidate) => candidate.definition.slot === id) ?? null;
}

/**
 * The inspectable scene graph state for one navigation generation.
 *
 * `committed` is the last completed instance. `pending` is acquisition only and
 * cannot become visible merely because its route, data, or React tree exists.
 */
export function sceneSlots(
  committed: ScenePath,
  pending: ScenePath | null,
): readonly SceneSlotState[] {
  return ALL_SLOTS.map((id) => ({
    id,
    committed: instanceForSlot(committed, id),
    pending: instanceForSlot(pending, id),
  }));
}
