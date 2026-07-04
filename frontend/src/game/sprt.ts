// The Sequential Probability Ratio Test — how Fishtest decides a change is (or is
// not) an improvement, using the standard normal-approximation trinomial GSPRT.
//
// You feed it a running W/D/L record and two Elo hypotheses (H0: the change is
// worth elo0, H1: it is worth elo1). It returns a log-likelihood ratio (LLR) and
// a verdict: keep playing ("continue"), the change is real ("accept"), or the
// change is not an improvement ("reject"). The two decision bounds come from the
// chosen error rates (alpha, beta), so the test controls false accepts/rejects.
//
// Pure and deterministic: no Math.random, no Date — it is a closed-form function
// of (w, d, l, cfg).

/** A win probability (score in [0,1]) for a given Elo advantage. */
export function eloToScore(e: number): number {
  return 1 / (1 + Math.pow(10, -e / 400));
}

/** The Elo advantage implied by a score in (0,1). Inverse of eloToScore. */
export function scoreToElo(s: number): number {
  const clamped = Math.min(Math.max(s, 1e-6), 1 - 1e-6);
  return -400 * Math.log10(1 / clamped - 1);
}

export interface SprtConfig {
  /** Null-hypothesis Elo (H0 — "no real improvement"). */
  elo0: number;
  /** Alternative-hypothesis Elo (H1 — the improvement we're testing for). */
  elo1: number;
  /** Allowed false-accept rate. */
  alpha: number;
  /** Allowed false-reject rate. */
  beta: number;
}

/** Fishtest's defaults for a "is this even a tiny bit better" test. */
export const DEFAULT_SPRT: SprtConfig = { elo0: 0, elo1: 8, alpha: 0.05, beta: 0.05 };

export type SprtVerdict = 'continue' | 'accept' | 'reject';

export interface SprtResult {
  /** Log-likelihood ratio: how much the record favors H1 over H0. */
  llr: number;
  /** Lower bound (cross it => reject) — always < 0. */
  lower: number;
  /** Upper bound (cross it => accept) — always > 0. */
  upper: number;
  verdict: SprtVerdict;
  /** Games played so far (w + d + l). */
  n: number;
  /** Observed score (wins + ½·draws)/n. */
  score: number;
  /** Observed score expressed as an Elo estimate. */
  elo: number;
}

/**
 * Trinomial GSPRT (normal approximation). Given the running W/D/L, computes the
 * LLR for H1 (elo1) over H0 (elo0) and compares it to the two decision bounds.
 * Deterministic; safe on an empty record (returns "continue", llr 0).
 */
export function sprt(wins: number, draws: number, losses: number, cfg: SprtConfig = DEFAULT_SPRT): SprtResult {
  const { elo0, elo1, alpha, beta } = cfg;
  const lower = Math.log(beta / (1 - alpha));
  const upper = Math.log((1 - beta) / alpha);
  const n = wins + draws + losses;
  if (n === 0) {
    return { llr: 0, lower, upper, verdict: 'continue', n: 0, score: 0.5, elo: 0 };
  }
  const mean = (wins + 0.5 * draws) / n;
  const ex2 = (wins + 0.25 * draws) / n;
  const variance = Math.max(ex2 - mean * mean, 1e-6);
  const mu0 = eloToScore(elo0);
  const mu1 = eloToScore(elo1);
  const llr = (n * (mu1 - mu0) * (2 * mean - mu0 - mu1)) / (2 * variance);
  const verdict: SprtVerdict = llr >= upper ? 'accept' : llr <= lower ? 'reject' : 'continue';
  return { llr, lower, upper, verdict, n, score: mean, elo: scoreToElo(mean) };
}
