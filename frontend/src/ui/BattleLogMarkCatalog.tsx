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
/**
 * Which batch each seat offers, PER SEAT rather than one flat list.
 *
 * A ruled-out family comes off the page rather than staying up beside its replacement, because
 * a review that keeps showing a rejected family asks the same question twice. Per-seat is what
 * makes that possible: several seats were generated together into one batch, so a flat list
 * could only retire a family by taking its unrelated siblings with it. The bytes stay uploaded
 * and unaccepted either way; nothing here deletes anything.
 *
 * ONE BATCH IS ONE CONCEPT. Two concepts sharing a batch cannot be told apart here, so ruling
 * one out means re-uploading the survivor under its own id — which is exactly what the resign
 * seat cost. Generate a second concept into a second batch.
 *
 * Four families have been ruled out so far, and each is recorded rather than merely dropped:
 * - `battle-log-defeat-mark-2026-08-11-v1` — every headstone carried a cross on its face.
 * - the laurel wreaths in `battle-log-marks-2026-08-12-v1` — a wreath is already the Ataraxia
 *   mark, so the Battle's victory would have worn the Run's ladder emblem.
 * - the white flags in `battle-log-cause-marks-2026-08-12-v1` — a white flag is a surrender
 *   symbol borrowed from warfare rather than anything chess does, and it collides with the
 *   objective flag a few rows up. Lichess draws resign as a flag and carries a standing
 *   complaint that players read it as a peace offer and click it meaning to offer a draw
 *   (lichess-org/lila#12306, whose suggested replacement is the toppled king).
 * - the handshakes in `battle-log-resign-mark-2026-08-12-v2` — drawn in blue steel gauntlets
 *   because a kit icon "should" be blue and gold, which is an observation about what the set
 *   happens to depict, not a rule. Skin is what makes a hand read as a hand, and armouring it
 *   threw that away, leaving one blue mass where two hands should separate. The set already
 *   carries red, green and white wherever colour means something — ADR-0014 owns a palette
 *   BUDGET, not a hue. Redrawn in `…-handshake-2026-08-12-v3` with real skin, two tones so the
 *   grip reads, and cuffs in `--skirmish-blue` and `--skirmish-red`: the two sides' own colours,
 *   the same pair the log's side rails use one column to the left.
 */
export const BATTLE_LOG_MARK_BATCH_IDS: Readonly<Record<BattleLogForgedMark, readonly string[]>> =
  Object.freeze({
    victory: ['battle-log-victory-mark-2026-08-12-v2'],
    defeat: ['battle-log-defeat-mark-2026-08-12-v2'],
    draw: ['battle-log-marks-2026-08-12-v1'],
    checkmate: ['battle-log-cause-marks-2026-08-12-v1'],
    resign: [
      'battle-log-resign-tipped-king-2026-08-12-v3',
      'battle-log-resign-handshake-2026-08-12-v3',
    ],
    check: ['battle-log-marks-2026-08-12-v1'],
    gold: ['battle-log-gold-mark-2026-08-12-v1'],
    'gold-loss': ['battle-log-gold-loss-mark-2026-08-12-v1'],
  });

const SEAT_LABEL: Readonly<Record<BattleLogForgedMark, string>> = Object.freeze({
  victory: 'Victory (outcome)',
  defeat: 'Defeat (outcome)',
  draw: 'Draw (outcome)',
  checkmate: 'Checkmate (cause)',
  resign: 'Resigned (cause)',
  check: 'Check',
  gold: 'Gold claimed',
  'gold-loss': 'Gold paid',
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
  logNote("Knight's fork — +5", 'gold'),
  logNote('Move undone — −10', 'gold-loss'),
  logNote('', 'victory', 'checkmate'),
  logNote('', 'defeat', 'checkmate'),
  logNote('', 'defeat', 'clock'),
  logNote('', 'defeat', 'resign'),
  logNote('', 'victory', 'resign'),
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
  'Victory — your opponent resigned.',
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

/**
 * One seat's candidates plus, when one is already installed, the accepted version so the two
 * can be compared in the same row.
 *
 * ONE card per candidate index. The same bytes can be uploaded more than once — this batch was,
 * to attach the `nativeEvidence` that acceptance requires and the first pass omitted — and each
 * upload is its own version row. Showing both puts every option on the page twice, half of them
 * un-installable, which turns a decision into a guess about which duplicate is the live one. So
 * a repeated index collapses to the version carrying native evidence, and to the newest
 * otherwise: that is the one Install can actually accept.
 */
export function battleLogMarkOptions(
  catalog: AdminLiveMediaCatalog,
  seat: BattleLogForgedMark,
): AdminLiveMediaVersion[] {
  const slot = BATTLE_LOG_MARK_SLOT[seat];
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId ?? null;
  const matching = catalog.versions
    .filter((version) => version.slot === slot
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && BATTLE_LOG_MARK_BATCH_IDS[seat].includes(batchId(version) ?? ''))));
  const installable = (version: AdminLiveMediaVersion): boolean =>
    version.id === activeVersionId || Object.keys(version.nativeEvidence).length > 0;
  const byIndex = new Map<number, AdminLiveMediaVersion>();
  for (const version of matching) {
    const index = candidateIndex(version);
    const held = byIndex.get(index);
    if (!held) { byIndex.set(index, version); continue; }
    if (installable(version) && !installable(held)) { byIndex.set(index, version); continue; }
    if (installable(version) === installable(held) && version.createdAt > held.createdAt) {
      byIndex.set(index, version);
    }
  }
  return [...byIndex.values()].sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function battleLogMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

/**
 * Art for every seat: what is installed, or failing that this seat's FIRST candidate.
 *
 * The seats are reserved until the owner installs one, which means a page built only from
 * installed art shows a column of empty boxes and demonstrates nothing — and since a marked
 * row's whole text can be the marks, several rows would be blank end to end. So the review
 * previews the first candidate wherever nothing is installed. It is a preview and the page
 * says so: nothing here is runtime art until Install says it is.
 */
function seatArt(catalog: AdminLiveMediaCatalog | null): Partial<Record<BattleLogForgedMark, string>> {
  if (!catalog) return {};
  const resolved: Partial<Record<BattleLogForgedMark, string>> = {};
  for (const seat of BATTLE_LOG_FORGED_MARKS) {
    const slot = catalog.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT[seat]);
    const active = catalog.versions.find((version) => version.id === slot?.activeVersionId);
    const fallback = battleLogMarkOptions(catalog, seat)[0];
    const media = active?.media ?? fallback?.media;
    if (media) resolved[seat] = media.url;
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
  seatArt: Partial<Record<BattleLogForgedMark, string>>;
  error: string;
  refresh: () => void;
}

/**
 * The seat a fresh visit opens on: the one an address names, or failing that the first seat
 * with nothing installed.
 *
 * Landing on a decided seat makes the owner find the undecided ones himself, which is exactly
 * the click a link is supposed to save. `?seat=` makes each decision its own address, so six
 * open seats can be handed over as six links rather than one link and instructions.
 */
export function battleLogSeatFromRoute(search: string): BattleLogForgedMark | null {
  const value = new URLSearchParams(search).get('seat');
  return BATTLE_LOG_FORGED_MARKS.find((seat) => seat === value) ?? null;
}

export function firstUndecidedSeat(
  catalog: AdminLiveMediaCatalog | null,
): BattleLogForgedMark | null {
  if (!catalog) return null;
  return BATTLE_LOG_FORGED_MARKS.find((seat) => {
    const slot = catalog.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT[seat]);
    return !slot?.activeVersionId;
  }) ?? null;
}

/** One fetch, one seat and one selection, shared by the grid and the controls rail. */
export function useBattleLogMark(): BattleLogMarkState {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const routeSeat = useMemo(
    () => (typeof window === 'undefined' ? null : battleLogSeatFromRoute(window.location.search)),
    [],
  );
  const [seat, setSeatValue] = useState<BattleLogForgedMark>(routeSeat ?? 'victory');
  // Without an address naming one, open on the first seat still needing a decision — but only
  // once, and never over a seat the owner has since chosen himself.
  const [seatSettled, setSeatSettled] = useState(routeSeat !== null);
  const [selectedId, setSelectedId] = useState('');
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    // Ask for THIS page's slots only. Unfiltered, the response is the catalog's whole version
    // history — the page spent about five seconds on "Loading candidates…" downloading and
    // parsing 15 MB to show sixteen cards, which reads as a broken page rather than a slow one.
    void fetchAdminLiveMediaCatalog(BATTLE_LOG_FORGED_MARKS.map((mark) => BATTLE_LOG_MARK_SLOT[mark]))
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  // Changing seat drops the selection with it: an id from another slot would silently keep
  // the Install button pointed at the mark you just navigated away from.
  const setSeat = useCallback((next: BattleLogForgedMark) => {
    setSeatValue(next);
    setSelectedId('');
    setSeatSettled(true);
  }, []);
  useEffect(() => {
    if (seatSettled || !catalog) return;
    const undecided = firstUndecidedSeat(catalog);
    setSeatSettled(true);
    if (undecided) setSeatValue(undecided);
  }, [catalog, seatSettled]);
  const options = useMemo(() => catalog ? battleLogMarkOptions(catalog, seat) : [], [catalog, seat]);
  const art = useMemo(() => seatArt(catalog), [catalog]);
  const selected = options.find((version) => version.id === selectedId) ?? options[0] ?? null;
  return { catalog, seat, setSeat, options, selected, setSelectedId, seatArt: art, error, refresh };
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

/**
 * One candidate: the art itself, then ONLY the rows that wear it.
 *
 * The first version of this card drew the whole twelve-row log on every candidate. Eleven of
 * those rows are identical from card to card and the twelfth changes by 18 pixels, so sixteen
 * candidates looked like sixteen copies of the same picture — the page made the decision
 * harder than no page at all.
 *
 * So the difference gets the top of the card at a size where the art is actually legible, and
 * what follows is only the lines this seat appears on. Context for the whole vocabulary is
 * shown ONCE, in the before/after above the grid, rather than repeated sixteen times.
 *
 * The rows are drawn by the SAME `EventLogRow` the player gets — a review that re-types the
 * markup can agree with itself while disagreeing with the log (ADR-0059).
 */
function MarksInLog({
  seat,
  src,
  seatArt,
}: {
  seat: BattleLogForgedMark;
  src: string;
  seatArt: Partial<Record<BattleLogForgedMark, string>>;
}): ReactElement {
  const forgedSrc = { ...seatArt, [seat]: src };
  const rows = SAMPLE_ROWS.filter((entry) => entry.marks?.includes(seat));
  return (
    <span className="battle-log-mark-candidate">
      <img className="battle-log-mark-art" src={src} alt="" draggable={false} />
      <span className="skirmish-log-card battle-log-mark-sample">
        <ul>
          {rows.map((entry, index) => (
            <EventLogRow key={`${entry.text}-${index}`} entry={entry} forgedSrc={forgedSrc} />
          ))}
        </ul>
      </span>
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
export function BattleLogProseComparison({
  seatArt: art,
}: {
  seatArt: Partial<Record<BattleLogForgedMark, string>>;
}): ReactElement {
  return (
    <div className="battle-log-mark-prose">
      <div className="battle-log-mark-prose-column">
        <span className="skirmish-eyebrow">Before</span>
        <ul>
          {REPLACED_PROSE.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
      <div className="battle-log-mark-prose-column">
        <span className="skirmish-eyebrow">Now — previewing option 01 wherever nothing is installed</span>
        <span className="skirmish-log-card battle-log-mark-sample">
          <ul>
            {SAMPLE_ROWS.map((entry, index) => (
              <EventLogRow key={`${entry.text}-${index}`} entry={entry} forgedSrc={art} />
            ))}
          </ul>
        </span>
      </div>
    </div>
  );
}

export function BattleLogMarkCatalog({ state }: { state: BattleLogMarkState }): ReactElement {
  const { catalog, seat, options, selected, setSelectedId, seatArt, error } = state;
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    // ONE element, not a fragment: the Studio shell is a two-column grid (content, controls
    // rail), so a category that hands back two children puts its second one in the rail.
    <div className="battle-log-mark-page">
      <BattleLogProseComparison seatArt={seatArt} />
      {options.length ? (
        <div className="tileset-studio-grid battle-log-mark-grid" data-testid="battle-log-mark-grid">
          {options.map((version) => (
            <StudioCatalogCard
              key={version.id}
              title={battleLogMarkLabel(version)}
              badge={`${version.media!.width}×${version.media!.height}`}
              selected={selected?.id === version.id}
              onSelect={() => setSelectedId(version.id)}
              media={<MarksInLog seat={seat} src={version.media!.url} seatArt={seatArt} />}
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
        A mark REPLACES the words that classified its line, because a glyph is read faster than a
        word. An ending takes an outcome and a cause, and between them the row needs no words at
        all. Seven seats need art; the clock, the objective flag and the two coins are already
        installed elsewhere and the log borrows those. Each option is drawn on the real rows at
        the real 18px seat. Nothing is installed until you install one — until then the rows
        above preview option 01.
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
