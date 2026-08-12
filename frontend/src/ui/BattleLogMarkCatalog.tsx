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
import { BATTLE_LOG_MARK_MEDIA_ROLE, BATTLE_LOG_MARK_SLOT, EventLogRow } from './shared/BattleLogMark';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * The Event Log's defeat mark, judged where every candidate is on one page mounted in the
 * real log row — a Studio catalog category reached by clicking its tab (ADR-0058).
 *
 * A mark this small cannot be judged from its 64px art: a headstone that reads beautifully
 * at native size can arrive at the 18px seat as a grey lozenge. So the card draws the ACTUAL
 * rows, at the actual size, on the log's own surface, and the candidate art is the only thing
 * that changes between cards.
 *
 * Install is the whole decision in one act: it records approval of these exact bytes, accepts
 * the version into its semantic slot, and binds the slot to its `app-ui` media role. The
 * public drawable catalog refuses a role bound to an unaccepted slot, so the binding can only
 * ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
export const BATTLE_LOG_MARK_BATCH_ID = 'battle-log-defeat-mark-2026-08-11-v1';

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

/** This batch's candidates plus, when one is already installed, the accepted version so the
 *  two can be compared in the same row. */
export function battleLogMarkOptions(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT)?.activeVersionId ?? null;
  return catalog.versions
    .filter((version) => version.slot === BATTLE_LOG_MARK_SLOT
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && batchId(version) === BATTLE_LOG_MARK_BATCH_ID)))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function battleLogMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

export interface BattleLogMarkState {
  catalog: AdminLiveMediaCatalog | null;
  options: AdminLiveMediaVersion[];
  selected: AdminLiveMediaVersion | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  error: string;
  refresh: () => void;
}

/** One fetch and one selection, shared by the grid and the controls rail. */
export function useBattleLogMark(): BattleLogMarkState {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
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
  const options = useMemo(() => catalog ? battleLogMarkOptions(catalog) : [], [catalog]);
  const selected = options.find((version) => version.id === selectedId) ?? options[0] ?? null;
  return { catalog, options, selected, selectedId, setSelectedId, error, refresh };
}

/** Bind the accepted slot to its application-UI media role. Until this exists the log has no
 *  role to resolve; the catalog rejects the binding before acceptance. */
async function bindApplicationUiRole(): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  if (media[BATTLE_LOG_MARK_MEDIA_ROLE] === BATTLE_LOG_MARK_SLOT) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [BATTLE_LOG_MARK_MEDIA_ROLE]: BATTLE_LOG_MARK_SLOT },
    expectedRevision: appUi.rowRevision,
  });
}

/**
 * The exact lines these marks land on in play, written the way the store writes them.
 *
 * All of them appear on every card, not just the one being decided: the defeat mark has to
 * hold its own beside the clock it shares a row with, the coin two rows down, and a plain
 * move number at the bottom — a candidate judged alone is judged against nothing.
 */
const SAMPLE_ROWS: readonly LogEntry[] = Object.freeze([
  logNote('Defeat — your clock ran out.', 'defeat', 'clock'),
  logNote('Checkmate — defeat.', 'defeat'),
  logNote("Knight's fork — 5 gold claimed.", 'gold'),
  logNote('Check!'),
  { text: 'Nxb5+', side: 'player', ply: 10 },
]);

/** The rows, drawn by the SAME component the Event Log draws them with — the review would be
 *  worthless if it could agree with itself while disagreeing with the log (ADR-0059). */
function MarksInLog({ src }: { src: string }): ReactElement {
  return (
    <span className="skirmish-log-card battle-log-mark-sample">
      <ul>
        {SAMPLE_ROWS.map((entry, index) => (
          <EventLogRow key={`${entry.text}-${index}`} entry={entry} defeatSrc={src} />
        ))}
      </ul>
    </span>
  );
}

export function BattleLogMarkCatalog({ state }: { state: BattleLogMarkState }): ReactElement {
  const { catalog, options, selected, setSelectedId, error } = state;
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  if (!options.length) return <p>No candidates are uploaded for this seat.</p>;
  return (
    <div className="tileset-studio-grid battle-log-mark-grid" data-testid="battle-log-mark-grid">
      {options.map((version) => (
        <StudioCatalogCard
          key={version.id}
          title={battleLogMarkLabel(version)}
          badge={`${version.media!.width}×${version.media!.height}`}
          selected={selected?.id === version.id}
          onSelect={() => setSelectedId(version.id)}
          media={<MarksInLog src={version.media!.url} />}
          imageClassName="battle-log-mark-card-image"
          textExtra={typeof version.metadata.concept === 'string'
            ? <small>{version.metadata.concept}</small>
            : null}
        />
      ))}
    </div>
  );
}

export function BattleLogMarkControls({ state }: { state: BattleLogMarkState }): ReactElement {
  const { catalog, selected, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog?.slots.find((entry) => entry.slot === BATTLE_LOG_MARK_SLOT) ?? null;
  const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;

  const install = async (): Promise<void> => {
    if (busy || !selected?.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: 'Selected the Event Log defeat mark from the log rows it is drawn on.',
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
          slot: BATTLE_LOG_MARK_SLOT,
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
      await bindApplicationUiRole();
      setStatus('Installed. Every defeat line in the Event Log wears this mark now.');
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
        The Event Log marks its prose lines so a finished Battle can be scanned: a defeat, the
        clock that caused one, and gold the board earned. The clock is the title bar&apos;s own
        hourglass and the coin is the Run&apos;s own, so only the defeat mark is being chosen
        here — each option is drawn on the real rows at the real 18px seat. Nothing is installed
        until you install one; the seat stays reserved and empty until then.
      </p>
      <button
        type="button"
        className="tileset-view-action"
        data-testid="install-battle-log-mark"
        disabled={busy || !selected || installed}
        onClick={() => { void install(); }}
      >
        {installed ? 'Installed' : busy ? 'Installing…' : `Use ${selected ? battleLogMarkLabel(selected) : 'selection'} for Defeat`}
      </button>
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
