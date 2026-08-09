import type { Level } from '../core/level';
import { editorBoardToLevel, levelToEditorBoard } from '../core/levelBoard';
import { effectiveLevelEvents } from '../core/levelEvents';
import { levelRulesSeed } from './levelEditorRulesSeed';

/**
 * The dirty-check signature used by the Level Editor. Keep this formula shared between
 * live editor state, canonical targets, durable working copies, and local recovery drafts.
 */
export function levelEditorLevelSignature(level: Level): string {
  return JSON.stringify([
    level.name,
    level.boardCode ?? '',
    level.objective,
    level.placement ?? 'fixed',
    level.surviveTurns ?? '',
    level.roster ?? {},
    level.timeControl ?? '',
    level.parTurns ?? '',
    level.victory ?? '',
    effectiveLevelEvents(level),
    level.battle ?? '',
  ]);
}

/**
 * Project a saved Level through the same board/rules normalization used by the editor's
 * candidate Level. This matters for legacy levels without boardCode and for preset rules
 * that collapse back to omitted fields after an untouched editor round-trip.
 */
export function normalizedLevelEditorSignature(level: Level): string {
  const seed = levelRulesSeed(level);
  const normalized = editorBoardToLevel(levelToEditorBoard(level), {
    id: level.id,
    name: seed.name,
    objective: seed.objective,
    surviveTurns: seed.save.surviveTurns,
    timeControl: seed.save.timeControl,
    parTurns: seed.save.parTurns,
    victory: seed.save.victory,
    events: seed.save.events,
    battle: level.battle,
  });
  return levelEditorLevelSignature(normalized);
}

export function draftBaselineMatchesLevel(draftSavedSig: string, level: Level): boolean {
  return draftSavedSig === normalizedLevelEditorSignature(level);
}
