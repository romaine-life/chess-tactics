import type { SceneInstance, ScenePath, SceneSlotId } from './sceneManifest';

export interface SceneSlotState {
  id: SceneSlotId;
  committed: SceneInstance | null;
  pending: SceneInstance | null;
}

const ALL_SLOTS: readonly SceneSlotId[] = [
  'root',
  'menu-destination',
  'play-content',
  'settings-content',
  'editor-content',
  'enchiridion-content',
  'gameplay-content',
];

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
