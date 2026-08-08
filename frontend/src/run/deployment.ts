export * from '@chess-tactics/board-render/run/deployment';

import type { GameState } from '../core/types';
import { createFromLevel } from '../game/setup';
import type { Level } from '../core/level';
import {
  levelForRunDeployment,
  type RunDeploymentLayout,
} from '@chess-tactics/board-render/run/deployment';
import type { RunDocument } from '@chess-tactics/board-render/run/model';

/**
 * Materialize the pure shared Deployment projection through the application's canonical game
 * setup path. Keeping this adapter in the frontend avoids teaching the shared Run package about
 * the browser game's store while still giving Deployment and Battle one GameState ancestry.
 */
export function gameForRunDeployment(
  run: RunDocument,
  level: Level,
  layout: RunDeploymentLayout,
  includeAutomaticFormation = false,
): GameState {
  const seed = run.deployment?.seed ?? run.seed;
  const game = createFromLevel(levelForRunDeployment(run, level, layout, includeAutomaticFormation), seed);
  return {
    ...game,
    // Authored units — the level's enemy force included — are painted, because they are the
    // position the player is arranging against. A setup-spawn deal is withheld: it fills its
    // zone around the squares already taken, so the force it would show now is not necessarily
    // the force Battle deals once every card has claimed its cells.
    pieces: game.pieces.filter((piece) => !piece.id.startsWith('spawn-')),
  };
}
