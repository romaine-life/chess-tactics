// The named AI APPROACHES a level can play. An approach is the whole recipe — the
// algorithm plus the evaluation it searches plus that evaluation's own tunable
// parameter set — not just a weight vector. The level's AI is a POINTER to one
// approach carrying that approach's tuned parameters (lab/openingBooks.LevelAiDoc),
// so a future approach (piece-square tables, a small value network — the next rungs
// of the value-function ladder) gets its OWN parameter slot beside this one instead
// of trampling its tuning.
//
// Today there is exactly one: every enemy reply is an alpha-beta search over a
// material evaluation (core/ai.ts), and both tuning surfaces — the Piece-values
// pane's TD(λ) self-play runs and the Training tab's SPSA champions — tune ITS
// parameter vector. Adding an approach = a new id here, its config shape, and a
// resolver branch in game/adoptedWeights.

export type AiApproachId = 'material-search';

export interface AiApproachInfo {
  /** Display name — what the audit box and the adopt verbs call the approach. */
  name: string;
  /** The searchable technique line (the named-methods reading list). */
  technique: string;
}

export const AI_APPROACHES: Record<AiApproachId, AiApproachInfo> = {
  'material-search': {
    name: 'Tuned material search',
    technique: 'alpha-beta search over a material evaluation — unit values learned by afterstate TD(λ) self-play (Beal & Smith) or SPSA champion tuning',
  },
};

/** The one approach both current tuning surfaces feed. */
export const MATERIAL_SEARCH: AiApproachId = 'material-search';
