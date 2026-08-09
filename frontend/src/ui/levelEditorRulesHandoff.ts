/**
 * The rules a canonicalizing remount must carry forward.
 *
 * Resolving `?levelId=<id>` into `?levelId=<id>&document=<id>` rewrites the address, and App keys
 * the Level Editor on levelEditorRouteIdentity, so React tears the component down and builds a new
 * one (deliberately — see sameDocumentRemountRef in LevelEditor.tsx). The seed arbitration in
 * levelEditorRulesSeed.ts already protects a rules field the owner authored while the document was
 * still resolving, but it protects it INSIDE one instance: the replacement starts with an empty
 * authored set and its own initial state, so an edit made in that ~1s window was simply gone.
 * Typing a par or flipping the battle clock the moment the panel appeared silently did nothing.
 *
 * This is the same working copy, in the same tab, one tick apart, so the handoff is an in-memory
 * slot rather than anything durable — it is emphatically NOT a second document identity or a
 * recovery channel (ADR-0304). It carries only the fields the owner actually authored; the
 * document supplies everything else, exactly as it does on an ordinary open.
 *
 * It is keyed by LEVEL id, not document id: the replacement instance knows the level from its own
 * address at mount but does not learn the document id until the load resolves, and adopting before
 * first paint is what keeps the owner from watching their edit blink away and come back.
 */

import type { Level } from '../core/level';
import type { AuthoredRulesField } from './levelEditorRulesSeed';

export interface LevelEditorRulesHandoff {
  levelId: string;
  /** The outgoing instance's live candidate. Only its AUTHORED fields are ever read back. */
  level: Level;
  authored: AuthoredRulesField[];
}

let pending: LevelEditorRulesHandoff | null = null;

/**
 * Hand the authored rules to the instance replacing this one. Nothing authored ⇒ nothing staged,
 * so an ordinary open never carries anything. `templateChoice` is page-local UI state rather than
 * part of the document, cannot be read back out of a Level, and is deliberately not carried.
 */
export function stageRulesHandoff(
  levelId: string,
  level: Level,
  authored: ReadonlySet<AuthoredRulesField>,
): void {
  const carried = [...authored].filter((field) => field !== 'templateChoice');
  pending = carried.length ? { levelId, level, authored: carried } : null;
}

/**
 * Take the handoff staged for this level, if any. Always one shot and always clearing: a slot left
 * behind by a remount that did not happen must never be adopted by some later, unrelated mount.
 */
export function consumeRulesHandoff(levelId: string | undefined): LevelEditorRulesHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff && levelId && handoff.levelId === levelId ? handoff : null;
}
