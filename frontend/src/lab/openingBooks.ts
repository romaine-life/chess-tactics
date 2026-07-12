// Per-level opening-book store: types + pure helpers.
//
// A level's gym state is a set of opening books. Each book bundles:
//   - its generation settings (size / seedBase / plies / variety),
//   - its generated positions (the seeded opening walks), and
//   - its RETAINED training session (SPSA step count, current theta, champion, the
//     convergence curve) — so switching between books restores each one's training
//     exactly where it was left, and a fresh book starts clean at 0.5.
//
// Persistence is account-scoped in the backend (net/openingBooks.ts, one blob row
// per (owner, level)). capSessionForStorage caps each book's traj before persisting
// so a long auto-run can't grow the blob without bound.

import { encodeWeights } from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { AI_APPROACHES, MATERIAL_SEARCH, type AiApproachId } from '../game/aiApproach';
import type { BookPosition, OpeningBookSettings } from '../game/openingBook';
import type { SpsaStepGameRecord } from '../game/tuning';
import type { TdAdoptionRecord, TdRunsDoc, TdSessionDoc } from './tdSession';

/** One point on a book's convergence curve — the worker's step output. Game outcomes
 * (this step's decisive/draw split) are optional so trajectories persisted before they
 * were surfaced still load. */
export interface GymPoint {
  step: number;
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
}

/** A book's RETAINED training state — the complete, portable SPSA session.
 * `k` is the next step index (also the SPSA step seed offset), so replaying k from
 * the master seed re-derives the trajectory. `champion` is the best point seen;
 * `established` counts steps since it last improved. */
export interface GymSession {
  k: number;
  theta: number[];
  champion: { step: number; score: number; theta: number[] };
  established: number;
  traj: GymPoint[];
  /** Full records for the most recent local training step only; replaced every step. */
  latestStepGames?: SpsaStepGameRecord[];
}

/** One opening book: its settings, generated positions, and retained session. */
export interface OpeningBook {
  id: number;
  settings: OpeningBookSettings;
  positions: BookPosition[];
  session: GymSession;
  /** Optional deterministic train/holdout partition (holdout = indices into
   * positions). Absent ⇒ whole book is train, holdout empty (back-compat with
   * pre-split books). SPSA tunes on trainPositions; SPRT validates on
   * holdoutPositions — the anti-overfit guard: a champion must beat the shipped AI
   * on openings it never trained on. */
  split?: { holdout: number[] };
}

/** One approach's OWN tuned parameter set. Each approach keeps its own config —
 * pointing the level at another approach must never destroy this one's tuning. */
export interface AiApproachConfig {
  /** The approach's tuned parameter vector (encodeWeights order for material-search).
   * This is the durable, account-scoped copy; game/adoptedWeights mirrors the LIVE
   * approach's vector into a local cache the live AI reads synchronously. */
  vector: number[];
  /** Provenance when the Piece-values pane set the values (names the run; survives
   * deleting the run it came from — each run also keeps its own copy as history).
   * Absent when the Training tab's SPRT champion set them. */
  adoption?: TdAdoptionRecord;
}

/** The level's AI as the owner set it: WHICH named approach is in force (`live`,
 * absent = stock AI — shipped or default values) plus every approach's own config
 * (game/aiApproach.ts is the registry). Setting an AI is always the whole pointer:
 * approach + its parameters + provenance, never a bare weight vector. */
export interface LevelAiDoc {
  live?: AiApproachId;
  approaches: Partial<Record<AiApproachId, AiApproachConfig>>;
}

/** The per-level persisted blob: an id counter and the level's books. */
export interface BooksBlob {
  nextId: number;
  books: OpeningBook[];
  /** The level's AI document — the named approach in force and each approach's own
   * tuned parameters. */
  levelAi?: LevelAiDoc;
  /** RETIRED bare-vector adoption (the pre-approach format): read for migration
   * only, never written. migrateLevelAi folds it into `levelAi` on load. */
  adoptedWeights?: number[];
  /** RETIRED single-run field (the pre-library format): read for migration only,
   * never written. migrateTdRuns folds it into `tdRuns` as Run 1 on load. */
  tdSession?: TdSessionDoc;
  /** The Piece-values learner's run library (lab/tdSession.ts): every run the owner
   * has recorded on this level, autosaved so closing the tab never discards one. */
  tdRuns?: TdRunsDoc;
  /** RETIRED blob-level live adoption record beside `adoptedWeights` (pre-approach
   * format): read for migration only, never written. Lives on inside the approach
   * config (levelAi.approaches[..].adoption). */
  tdAdoption?: TdAdoptionRecord;
}

/** A persisted run/legacy document the pane can actually restore and render (the
 * picker and compare dereference session.train and opts unguarded). */
export function isRestorableTdDoc(doc: TdSessionDoc | undefined | null): doc is TdSessionDoc {
  return !!(doc && doc.session && doc.session.train && doc.opts && typeof doc.opts.games === 'number');
}

/** Drop runs a malformed blob can't render (defense at the load boundary — the UI
 * trusts every run in the library). */
export function sanitizeTdRuns(lib: TdRunsDoc): TdRunsDoc {
  const runs = lib.runs.filter((r) => typeof r.id === 'number' && isRestorableTdDoc(r));
  return runs.length === lib.runs.length ? lib : { ...lib, runs };
}

/** Migrate the retired single-run `tdSession` field into the run library: the old
 * document becomes Run 1 (its adoption, summary, and Kept mark intact), and its
 * adoption record — if any — is hoisted to the blob-level live-adoption slot (the
 * old format only kept a record while it was in force; migrateLevelAi then folds
 * that slot into the approach config). A malformed legacy doc is
 * dropped (the old code ignored it too); a blob that already has a library just
 * drops the stale legacy field. Pure — the net client applies it on load, and the
 * next save persists the migrated shape. */
export function migrateTdRuns(blob: BooksBlob): BooksBlob {
  if (!blob.tdSession) return blob;
  const { tdSession, ...rest } = blob;
  if (rest.tdRuns || !isRestorableTdDoc(tdSession)) return rest;
  return {
    ...rest,
    tdRuns: { nextId: 2, activeId: 1, runs: [{ id: 1, name: 'Run 1', ...tdSession }] },
    ...(tdSession.adoption && !rest.tdAdoption ? { tdAdoption: { ...tdSession.adoption, runId: 1, runName: 'Run 1' } } : {}),
  };
}

const sameVec = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const numericVec = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number');

/** Point the level's AI at `id`, replacing THAT approach's config. Other
 * approaches' configs are untouched — setting an AI is repointing, never
 * overwriting a sibling's tuning. */
export function setLevelAiApproach(blob: BooksBlob, id: AiApproachId, config: AiApproachConfig): BooksBlob {
  return { ...blob, levelAi: { live: id, approaches: { ...blob.levelAi?.approaches, [id]: config } } };
}

/** Repoint which approach is in force WITHOUT touching any config — the approach
 * picker's verb. `null` = stock (live unset, every approach's tuned values kept, so
 * switching back restores them); an id with no config on this level is a no-op
 * (there is nothing to put in force). Destroying values is a different verb:
 * clearLevelAiApproach. */
export function pointLevelAi(blob: BooksBlob, id: AiApproachId | null): BooksBlob {
  const cur = blob.levelAi;
  if (id === null) {
    if (!cur?.live) return blob;
    const { live: _unset, ...rest } = cur;
    return { ...blob, levelAi: rest };
  }
  if (!cur?.approaches[id]) return blob;
  if (cur.live === id) return blob;
  return { ...blob, levelAi: { ...cur, live: id } };
}

/** Drop one approach's config (the owner cleared it). If it was the live one the
 * level falls back to stock; an emptied document is removed entirely. */
export function clearLevelAiApproach(blob: BooksBlob, id: AiApproachId): BooksBlob {
  const cur = blob.levelAi;
  if (!cur) return blob;
  const { [id]: _dropped, ...approaches } = cur.approaches;
  const { levelAi: _doc, ...rest } = blob;
  if (Object.keys(approaches).length === 0) return rest;
  return { ...rest, levelAi: { ...(cur.live !== undefined && cur.live !== id ? { live: cur.live } : {}), approaches } };
}

/** Load-boundary defense for the level-AI document (the resolver mirror and audit
 * box trust it): drop configs without an all-numeric vector, strip a malformed
 * adoption record (the audit read compares its vector), unset `live` when it
 * points at a missing approach OR an id this build's registry does not know (the
 * audit box dereferences AI_APPROACHES[live] — a foreign id, e.g. written by a
 * newer client, must degrade the level to stock, not crash the pane; the foreign
 * CONFIG is preserved for the client that wrote it), and drop an emptied
 * document. Same object when clean. */
export function sanitizeLevelAi(doc: LevelAiDoc): LevelAiDoc | undefined {
  const src = doc.approaches && typeof doc.approaches === 'object' ? doc.approaches : {};
  let dirty = false;
  const entries: Array<[AiApproachId, AiApproachConfig]> = [];
  for (const [id, cfg] of Object.entries(src) as Array<[AiApproachId, AiApproachConfig | undefined]>) {
    if (!cfg || !numericVec(cfg.vector)) { dirty = true; continue; }
    if (cfg.adoption && !numericVec(cfg.adoption.vector)) {
      const { adoption: _malformed, ...kept } = cfg;
      entries.push([id, kept]);
      dirty = true;
      continue;
    }
    entries.push([id, cfg]);
  }
  if (!entries.length) return undefined;
  const liveOk = doc.live !== undefined && doc.live in AI_APPROACHES && entries.some(([id]) => id === doc.live);
  if (!dirty && doc.approaches === src && (doc.live === undefined || liveOk)) return doc;
  return { ...(liveOk ? { live: doc.live } : {}), approaches: Object.fromEntries(entries) as LevelAiDoc['approaches'] };
}

/** Migrate the retired bare-vector adoption fields (`adoptedWeights` + the
 * blob-level `tdAdoption` record) into the level-AI document: the vector becomes
 * the material-search approach's config — live, since the old format only stored a
 * vector while it was in force — carrying the adoption record when its vector
 * matches (the old read path applied the same guard: a stale record beside a
 * Training-tab vector was ignored). Orphaned or corrupt fields (a record without a
 * vector, a non-all-numeric vector — the shape sanitizeLevelAi would reject — or
 * either field beside an existing `levelAi`) just drop. Pure — the net client applies it
 * on load AFTER migrateTdRuns (which hoists a pre-library document's record up to
 * `tdAdoption` first), and the next save persists the migrated shape. */
export function migrateLevelAi(blob: BooksBlob): BooksBlob {
  if (blob.adoptedWeights === undefined && blob.tdAdoption === undefined) return blob;
  const { adoptedWeights, tdAdoption, ...rest } = blob;
  if (rest.levelAi || !numericVec(adoptedWeights)) return rest;
  const adoption = tdAdoption && Array.isArray(tdAdoption.vector) && sameVec(tdAdoption.vector, adoptedWeights)
    ? tdAdoption : undefined;
  return {
    ...rest,
    levelAi: {
      live: MATERIAL_SEARCH,
      approaches: { [MATERIAL_SEARCH]: { vector: adoptedWeights, ...(adoption ? { adoption } : {}) } },
    },
  };
}

/** Default generation settings for a brand-new book (small, so a step lands fast). */
export const DEFAULT_BOOK_SETTINGS: OpeningBookSettings = { size: 4, seedBase: 1, plies: 4, variety: 0.5 };

/** How many trajectory points to KEEP IN STORAGE per book (the live in-memory traj
 * is unbounded; only persistence is capped, keeping the newest points). */
const MAX_STORED_TRAJ = 400;

/** A pristine session: even with the reference, champion = the reference itself. */
export function freshSession(): GymSession {
  const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
  return {
    k: 0,
    theta,
    champion: { step: -1, score: 0.5, theta: theta.slice() },
    established: 0,
    traj: [],
  };
}

/** An empty blob (no books yet). */
export function emptyBlob(): BooksBlob {
  return { nextId: 1, books: [] };
}

/** Trim a session's trajectory for storage (keep the newest MAX_STORED_TRAJ). The
 * net client applies this to each book before persisting the blob. */
export function capSessionForStorage(session: GymSession): GymSession {
  if (session.traj.length <= MAX_STORED_TRAJ) return session;
  return { ...session, traj: session.traj.slice(session.traj.length - MAX_STORED_TRAJ) };
}

/** Create a new book (positions empty until generated) with a fresh session, append
 * it to the blob, and return the grown blob + the new book. */
export function makeNewBook(existingBlob: BooksBlob, settings: OpeningBookSettings): { blob: BooksBlob; book: OpeningBook } {
  const id = existingBlob.nextId;
  const book: OpeningBook = { id, settings: { ...settings }, positions: [], session: freshSession() };
  const blob: BooksBlob = { ...existingBlob, nextId: id + 1, books: [...existingBlob.books, book] };
  return { blob, book };
}

/** Remove a book by id (nextId is never rewound — ids stay stable/unique). The
 * level's adopted weights are book-independent, so they survive a book delete. */
export function deleteBook(blob: BooksBlob, id: number): BooksBlob {
  return { ...blob, books: blob.books.filter((b) => b.id !== id) };
}

/** Replace a book in the blob by id (returns a new blob; unchanged if id absent). */
export function updateBook(blob: BooksBlob, book: OpeningBook): BooksBlob {
  return { ...blob, books: blob.books.map((b) => (b.id === book.id ? book : b)) };
}

const clamp01ob = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Deterministic disjoint train/holdout partition of `positionCount` positions BY
 * INDEX (indices survive re-sorting and are compact to persist). Holdout = the
 * ceil(count × fraction) indices with the smallest seeded hash — stable, exactly the
 * fraction, and disjoint from train by construction. `salt` lets a book re-split
 * reproducibly (e.g. rotation across runs).
 */
export function splitBook(positionCount: number, holdoutFraction = 0.3, salt = 0): { holdout: number[] } {
  const n = Math.max(0, Math.floor(positionCount));
  const k = Math.min(n, Math.ceil(n * clamp01ob(holdoutFraction)));
  if (k <= 0) return { holdout: [] };
  const hash = (i: number): number => {
    let h = (((i + 1) * 2654435761) + (salt * 40503)) >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0;
    return h >>> 0;
  };
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(a) - hash(b) || a - b);
  return { holdout: idx.slice(0, k).sort((a, b) => a - b) };
}

/** Positions SPSA trains on (everything not in the holdout). Absent split ⇒ all. */
export function trainPositions(book: OpeningBook): BookPosition[] {
  const h = new Set(book.split?.holdout ?? []);
  return h.size ? book.positions.filter((_, i) => !h.has(i)) : book.positions;
}

/** Positions the champion is SPRT-validated on (never trained). Absent split ⇒ []. */
export function holdoutPositions(book: OpeningBook): BookPosition[] {
  const h = new Set(book.split?.holdout ?? []);
  return h.size ? book.positions.filter((_, i) => h.has(i)) : [];
}
