import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { logNote, type LogEntry } from '../game/store';
import {
  BATTLE_LOG_FORGED_MARKS,
  BATTLE_LOG_MARK_MEDIA_ROLE,
  BATTLE_LOG_MARK_SLOT,
  EventLogRow,
  type BattleLogForgedMark,
} from './shared/BattleLogMark';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * The Event Log's four forged marks, judged where every candidate is on one page mounted in
 * the real log rows — a Studio catalog category reached by clicking its tab (ADR-0058).
 *
 * A mark this small cannot be judged from its 64px art: a headstone that reads beautifully at
 * native size can arrive at the 18px seat as a grey lozenge. So the card draws the ACTUAL
 * rows, at the actual size, through the same `EventLogRow` the player gets, and the candidate
 * art is the only thing that changes between cards.
 *
 * Install is the whole decision in one act: it records approval of these exact bytes, accepts
 * the version into its semantic slot, and binds the slot to its `app-ui` media role. The
 * public drawable catalog refuses a role bound to an unaccepted slot, so the binding can only
 * ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
export const BATTLE_LOG_MARK_BATCH_IDS: readonly string[] = Object.freeze([
  'battle-log-defeat-mark-2026-08-11-v1',
  'battle-log-marks-2026-08-12-v1',
]);

const SEAT_LABEL: Readonly<Record<BattleLogForgedMark, string>> = Object.freeze({
  check: 'Check',
  victory: 'Victory',
  defeat: 'Defeat',
  draw: 'Draw',
});

/**
 * Every kind of prose line the Battle writes, in the wording it now uses.
 *
 * They all appear on every card, not just the one being decided: a mark has to hold its own
 * against the marks it will sit among, and a candidate judged alone is judged against nothing.
 * The move row at the end is the control — it is the only row whose column still holds type.
 */
const SAMPLE_ROWS: readonly LogEntry[] = Object.freeze([
  logNote('Capture the rival King', 'objective'),
  logNote('', 'check'),
  logNote('Your King', 'check'),
  logNote("Knight's fork — 5", 'gold'),
  logNote('Move undone — 10', 'gold-loss'),
  logNote('Checkmate', 'victory'),
  logNote('Checkmate', 'defeat'),
  logNote('Out of time', 'defeat', 'clock'),
  logNote('You resigned', 'defeat'),
  logNote('Stalemate', 'draw'),
  logNote('The same position, three times', 'draw'),
  { text: 'Nxb5+', side: 'player', ply: 10 },
]);

/**
 * What those same rows said before the marks took the classifying word off them, kept here as
 * a fixed record of ONE decision rather than a live reader: the old strings are gone from the
 * store, and this is the comparison that justifies their going.
 */
const REPLACED_PROSE: readonly string[] = Object.freeze([
  'Skirmish begins — capture the rival King.',
  'Check!',
  'Your King is in check!',
  "Knight's fork — 5 gold claimed.",
  'Move undone — 10 gold paid.',
  'Checkmate — victory!',
  'Checkmate — defeat.',
  'Defeat — your clock ran out.',
  'Defeat — you resigned.',
  'Stalemate — the skirmish is a draw.',
  'Draw — the same position has occurred three times.',
  'Nxb5+',
]);

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function batchId(version: AdminLiveMediaVersion): string | null {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : null;
}

/** One seat's candidates plus, when one is already installed, the accepted version so the two
 *  can be compared in the same row. */
export function battleLogMarkOptions(
  catalog: AdminLiveMediaCatalog,
  seat: BattleLogForgedMark,
): AdminLiveMediaVersion[] {
  const slot = BATTLE_LOG_MARK_SLOT[seat];
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId ?? null;
  return catalog.versions
    .filter((version) => version.slot === slot
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && BATTLE_LOG_MARK_BATCH_IDS.includes(batchId(version) ?? ''))))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function battleLogMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

/** The art already installed for the seats NOT being decided, so a candidate is judged beside
 *  what it will actually sit among rather than beside empty boxes. */
function installedElsewhere(
  catalog: AdminLiveMediaCatalog | null,
  seat: BattleLogForgedMark,
): Partial<Record<BattleLogForgedMark, string>> {
  if (!catalog) return {};
  const resolved: Partial<Record<BattleLogForgedMark, string>> = {};
  for (const other of BATTLE_LOG_FORGED_MARKS) {
    if (other === seat) continue;
    const slot = catalog.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT[other]);
    const active = catalog.versions.find((version) => version.id === slot?.activeVersionId);
    if (active?.media) resolved[other] = active.media.url;
  }
  return resolved;
}

export interface BattleLogMarkState {
  catalog: AdminLiveMediaCatalog | null;
  seat: BattleLogForgedMark;
  setSeat: (seat: BattleLogForgedMark) => void;
  options: AdminLiveMediaVersion[];
  selected: AdminLiveMediaVersion | null;
  setSelectedId: (id: string) => void;
  otherSeats: Partial<Record<BattleLogForgedMark, string>>;
  error: string;
  refresh: () => void;
}

/** One fetch, one seat and one selection, shared by the grid and the controls rail. */
export function useBattleLogMark(): BattleLogMarkState {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [seat, setSeatValue] = useState<BattleLogForgedMark>('defeat');
  const [selectedId, setSelectedId] = useState('');
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  // Changing seat drops the selection with it: an id from another slot would silently keep
  // the Install button pointed at the mark you just navigated away from.
  const setSeat = useCallback((next: BattleLogForgedMark) => {
    setSeatValue(next);
    setSelectedId('');
  }, []);
  const options = useMemo(() => catalog ? battleLogMarkOptions(catalog, seat) : [], [catalog, seat]);
  const otherSeats = useMemo(() => installedElsewhere(catalog, seat), [catalog, seat]);
  const selected = options.find((version) => version.id === selectedId) ?? options[0] ?? null;
  return { catalog, seat, setSeat, options, selected, setSelectedId, otherSeats, error, refresh };
}

/** Bind the accepted slot to its application-UI media role. Until this exists the log has no
 *  role to resolve; the catalog rejects the binding before acceptance. */
async function bindApplicationUiRole(seat: BattleLogForgedMark): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  const role = BATTLE_LOG_MARK_MEDIA_ROLE[seat];
  if (media[role] === BATTLE_LOG_MARK_SLOT[seat]) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [role]: BATTLE_LOG_MARK_SLOT[seat] },
    expectedRevision: appUi.rowRevision,
  });
}

/** The rows, drawn by the SAME component the Event Log draws them with — the review would be
 *  worthless if it could agree with itself while disagreeing with the log (ADR-0059). */
function MarksInLog({
  seat,
  src,
  otherSeats,
}: {
  seat: BattleLogForgedMark;
  src: string;
  otherSeats: Partial<Record<BattleLogForgedMark, string>>;
}): ReactElement {
  const forgedSrc = { ...otherSeats, [seat]: src };
  return (
    <span className="skirmish-log-card battle-log-mark-sample">
      <ul>
        {SAMPLE_ROWS.map((entry, index) => (
          <EventLogRow key={`${entry.text}-${index}`} entry={entry} forgedSrc={forgedSrc} />
        ))}
      </ul>
    </span>
  );
}

/**
 * The words these marks took over, line for line.
 *
 * The art decision and the copy decision are separate, and this is the second one: every row
 * lost the word that classified it because the glyph now carries that word faster than reading
 * it does. Shown once, at the top, rather than repeated on every candidate card.
 */
export function BattleLogProseComparison(): ReactElement {
  return (
    <div className="battle-log-mark-prose">
      <div className="battle-log-mark-prose-column">
        <span className="skirmish-eyebrow">Before</span>
        <ul>
          {REPLACED_PROSE.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
      <div className="battle-log-mark-prose-column">
        <span className="skirmish-eyebrow">Now</span>
        <span className="skirmish-log-card battle-log-mark-sample">
          <ul>
            {SAMPLE_ROWS.map((entry, index) => (
              <EventLogRow key={`${entry.text}-${index}`} entry={entry} />
            ))}
          </ul>
        </span>
      </div>
    </div>
  );
}

export function BattleLogMarkCatalog({ state }: { state: BattleLogMarkState }): ReactElement {
  const { catalog, seat, options, selected, setSelectedId, otherSeats, error } = state;
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    // ONE element, not a fragment: the Studio shell is a two-column grid (content, controls
    // rail), so a category that hands back two children puts its second one in the rail.
    <div className="battle-log-mark-page">
      <BattleLogProseComparison />
      {options.length ? (
        <div className="tileset-studio-grid battle-log-mark-grid" data-testid="battle-log-mark-grid">
          {options.map((version) => (
            <StudioCatalogCard
              key={version.id}
              title={battleLogMarkLabel(version)}
              badge={`${version.media!.width}×${version.media!.height}`}
              selected={selected?.id === version.id}
              onSelect={() => setSelectedId(version.id)}
              media={<MarksInLog seat={seat} src={version.media!.url} otherSeats={otherSeats} />}
              imageClassName="battle-log-mark-card-image"
              textExtra={typeof version.metadata.concept === 'string'
                ? <small>{version.metadata.concept}</small>
                : null}
            />
          ))}
        </div>
      ) : <p>No candidates are uploaded for the {SEAT_LABEL[seat]} seat.</p>}
    </div>
  );
}

export function BattleLogMarkControls({ state }: { state: BattleLogMarkState }): ReactElement {
  const { catalog, seat, setSeat, selected, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog?.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT[seat]) ?? null;
  const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;

  const install = async (): Promise<void> => {
    if (busy || !selected?.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: `Selected the Event Log ${seat} mark from the log rows it is drawn on.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
          slot: BATTLE_LOG_MARK_SLOT[seat],
          canonicalScale: 1,
          surfaceKind: 'Battle Event Log prose row mark seat at native size',
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus('Binding the log mark media role…');
      await bindApplicationUiRole(seat);
      setStatus(`Installed. Every ${seat} line in the Event Log wears this mark now.`);
      refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="tileset-catalog-note">
        A mark REPLACES the word that classified its line, because a glyph is read faster than a
        word. Four seats need art; the clock, the objective flag and the two coins are already
        installed elsewhere and the log borrows those. Each option is drawn on the real rows at
        the real 18px seat. Nothing is installed until you install one.
      </p>
      {/* The same labelled select the Studio picks its category with — four seats need
          deciding and this page shows one at a time, which is a choice, not a toggle. */}
      <label className="tileset-category-select" title="Which Event Log mark this page is choosing">
        <span>Seat</span>
        <select
          value={seat}
          data-testid="battle-log-seat"
          aria-label="Event Log mark seat"
          onChange={(event) => setSeat(event.target.value as BattleLogForgedMark)}
        >
          {BATTLE_LOG_FORGED_MARKS.map((option) => (
            <option key={option} value={option}>{SEAT_LABEL[option]}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tileset-view-action"
        data-testid="install-battle-log-mark"
        disabled={busy || !selected || installed}
        onClick={() => { void install(); }}
      >
        {installed ? 'Installed' : busy ? 'Installing…' : `Use ${selected ? battleLogMarkLabel(selected) : 'selection'} for ${SEAT_LABEL[seat]}`}
      </button>
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
