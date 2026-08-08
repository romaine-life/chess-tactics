// The owner's keep-or-cut pass over installed animated artwork.
//
// This is deliberately NOT the live-media review record. That path only accepts candidate-status
// versions — installed art is locked — so a verdict on art that is already live has nowhere to go
// in the catalog. These are working notes: they say what the owner thinks of what shipped, and
// their product is a list that can be handed to whoever acts on it.
//
// A verdict is bound to the exact BYTES it was given about. Regenerating a prop's sheet clears its
// verdict rather than silently carrying a judgement of the old art onto the new art.

export type ArtVerdict = 'approved' | 'rejected';

export interface VerdictEntry {
  propId: string;
  sha256: string;
  verdict: ArtVerdict;
  at: string;
}

export type VerdictMap = Record<string, VerdictEntry>;

const STORAGE_KEY = 'chess-tactics.animated-art-verdicts.v1';

/** Verdicts are keyed by prop AND content, so new art starts unjudged. */
export function verdictKey(propId: string, sha256: string): string {
  return `${propId}:${sha256}`;
}

export function readVerdicts(storage: Pick<Storage, 'getItem'>): VerdictMap {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: VerdictMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Partial<VerdictEntry>;
      if (typeof entry.propId !== 'string' || typeof entry.sha256 !== 'string') continue;
      if (entry.verdict !== 'approved' && entry.verdict !== 'rejected') continue;
      out[key] = { propId: entry.propId, sha256: entry.sha256, verdict: entry.verdict, at: String(entry.at ?? '') };
    }
    return out;
  } catch {
    // A corrupt or unreadable store is not worth failing a review surface over.
    return {};
  }
}

export function writeVerdicts(storage: Pick<Storage, 'setItem'>, verdicts: VerdictMap): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
  } catch {
    // Nothing to do — the surface still works, the pass just will not survive a reload.
  }
}

/** Set or CLEAR one verdict. Passing the current verdict again clears it, so a mis-click is
 *  undone with the same button rather than needing a third control. */
export function toggleVerdict(
  verdicts: VerdictMap,
  propId: string,
  sha256: string,
  verdict: ArtVerdict,
  at: string,
): VerdictMap {
  const key = verdictKey(propId, sha256);
  const next = { ...verdicts };
  if (next[key]?.verdict === verdict) delete next[key];
  else next[key] = { propId, sha256, verdict, at };
  return next;
}

export interface VerdictSummary {
  approved: string[];
  rejected: string[];
  undecided: string[];
}

/** Where a pass stands over a known set of props, so the surface can say what is left. */
export function summarizeVerdicts(
  verdicts: VerdictMap,
  props: readonly { propId: string; sha256: string }[],
): VerdictSummary {
  const summary: VerdictSummary = { approved: [], rejected: [], undecided: [] };
  for (const prop of props) {
    const entry = verdicts[verdictKey(prop.propId, prop.sha256)];
    if (entry?.verdict === 'approved') summary.approved.push(prop.propId);
    else if (entry?.verdict === 'rejected') summary.rejected.push(prop.propId);
    else summary.undecided.push(prop.propId);
  }
  return summary;
}

/**
 * The pass as text worth handing to someone. Content hashes are included because a verdict that
 * does not name the bytes it judged cannot be checked later against what is actually installed.
 */
export function formatVerdicts(
  summary: VerdictSummary,
  verdicts: VerdictMap,
  label: string,
): string {
  const line = (propId: string): string => {
    const entry = Object.values(verdicts).find((candidate) => candidate.propId === propId);
    return entry ? `- ${propId} (${entry.sha256.slice(0, 12)})` : `- ${propId}`;
  };
  const section = (title: string, ids: readonly string[]): string[] => (
    ids.length ? [`${title} (${ids.length}):`, ...ids.map(line), ''] : [`${title}: none`, '']
  );
  return [
    `${label} — ${summary.approved.length}/${summary.approved.length + summary.rejected.length + summary.undecided.length} approved`,
    '',
    ...section('APPROVED', summary.approved),
    ...section('REJECTED', summary.rejected),
    ...section('UNDECIDED', summary.undecided),
  ].join('\n').trim();
}
