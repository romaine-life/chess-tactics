import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { ChromeVerbRow, verbColumns, type ChromeVerb } from './shared/ChromeVerbRow';
import { CHROME_STRUCTURAL_FILL_ROLE } from './shared/chromeSurfacePolicy';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Owner review for the mark a COMMITTING verb wears — the press that takes you into the Run,
 * whether you are resuming one or beginning one (ADR-0638).
 *
 * It is ONE mark for the whole app rather than one per screen: "this is the press the screen
 * exists for" is a single fact, and a second drawing of it is the drift ADR-0059 names. So this
 * surface offers one seat, and installing binds every confirm band at once.
 *
 * Judged in the seat it ships in. Each candidate is mounted through the real `ChromeVerbRow`
 * inside a real `DividedInnerChromeBox` — the same 61px band, the same 40px slot, the same 44px
 * draw of the 64px canvas, the same oak under it and the same menu lettering beside it. A contact
 * sheet would be judging a glyph; what is being decided here is whether the glyph reads at the
 * size and against the material it will actually be seen at.
 *
 * Both labels are shown, because the mark has to carry a short word and a long one: "BEGIN" leaves
 * the band nearly empty and "ABANDON AND START" crowds it, and a mark that only works beside one
 * of them is not installed here.
 *
 * Install is the whole decision in one act: it records approval of these exact bytes, accepts the
 * version into its semantic slot, and binds the slot to its `app-ui` media role. The public
 * drawable catalog refuses a role bound to an unaccepted slot, so the binding can only ever
 * follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
export const CONFIRM_MARK_SLOT = 'ui/kit/icons/confirm.png';
export const CONFIRM_MARK_ROLE = 'ui-kit-icons-confirm-png';

/** The runtime component tag a candidate must carry to be offered here — the same guard the Run
 *  rail marks use, so a candidate authored for another seat cannot be installed into this one. */
export const CONFIRM_MARK_COMPONENT = 'chrome-confirm-verb';

/** The two bands a candidate is read in: the shortest label the app gives a commitment and the
 *  longest. Disabled deliberately nowhere — an unavailable band dims the mark with it. */
const PREVIEW_BANDS: readonly { key: string; verbs: readonly ChromeVerb[] }[] = Object.freeze([
  { key: 'play', verbs: [{ id: 'play', label: 'Begin', confirm: true }] },
  { key: 'abandon', verbs: [{ id: 'abandon', label: 'Abandon and Start', confirm: true }] },
]);

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * Every reviewable option for the seat: its candidates plus, when one is already installed, the
 * accepted version so the two can be compared in the same band.
 *
 * A candidate that cannot be accepted is not an option. Acceptance requires non-empty provenance
 * and native-1x evidence, and offering a version that lacks either produces a card that looks
 * installable and fails at the last step with a server code.
 */
export function confirmMarkOptions(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots
    .find((entry) => entry.slot === CONFIRM_MARK_SLOT)?.activeVersionId ?? null;
  const installable = (version: AdminLiveMediaVersion): boolean =>
    Object.keys(version.provenance ?? {}).length > 0
    && (version.nativeEvidence as { native1x?: unknown } | undefined)?.native1x === true
    && Boolean((version.nativeEvidence as { inkBox?: unknown } | undefined)?.inkBox)
    && (version.metadata as { runtime?: { component?: unknown } } | undefined)?.runtime?.component === CONFIRM_MARK_COMPONENT;
  return catalog.versions
    .filter((version) => version.slot === CONFIRM_MARK_SLOT
      && Boolean(version.media)
      && (version.id === activeVersionId || (version.status === 'candidate' && installable(version))))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function confirmMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const named = typeof version.metadata.candidateLabel === 'string' ? version.metadata.candidateLabel : '';
  const index = candidateIndex(version);
  const option = index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
  return named ? `${option} — ${named}` : option;
}

export interface ConfirmMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedId: string;
  select: (id: string) => void;
  error: string;
  refresh: () => void;
}

export function useConfirmMark(): ConfirmMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [selectedId, setSelectedId] = useState('');
  const select = useCallback((id: string) => setSelectedId(id), []);
  return { catalog, selectedId, select, error, refresh };
}

/** Bind the accepted slot to its application-UI media role. Until this exists the band has no
 *  role to resolve; the catalog rejects the binding before acceptance. */
async function bindApplicationUiRole(): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  if (media[CONFIRM_MARK_ROLE] === CONFIRM_MARK_SLOT) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [CONFIRM_MARK_ROLE]: CONFIRM_MARK_SLOT },
    expectedRevision: appUi.rowRevision,
  });
}

/** The candidate mounted in the real control: a divided box whose single row is the real verb
 *  row, so the mark is drawn by the same seat, at the same size, over the same material as it
 *  ships. The verbs carry no target — pressing a review card must not leave the Studio. */
function MarkInConfirmBand({ src }: { src: string }): ReactElement {
  return (
    <div className="confirm-mark-preview">
      {PREVIEW_BANDS.map((band) => (
        <DividedInnerChromeBox
          key={band.key}
          className="play-detail-card"
          columns={verbColumns(band.verbs)}
          fillRole={CHROME_STRUCTURAL_FILL_ROLE}
        >
          <ChromeVerbRow
            verbs={band.verbs}
            className="play-detail-verbs"
            cellClassName="play-detail-verb"
            confirmMarkSrc={src}
          />
        </DividedInnerChromeBox>
      ))}
    </div>
  );
}

export function ConfirmMarkCatalog({ state }: { state: ConfirmMarkState }): ReactElement {
  const { catalog, selectedId, select, error } = state;
  const options = useMemo(() => (catalog ? confirmMarkOptions(catalog) : []), [catalog]);
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="confirm-mark-catalog">
      <p className="tileset-catalog-note">
        The mark every committing verb wears — the press that takes you into the Run, whether you
        are resuming one or beginning one. One mark for the act, so installing binds all of them.
      </p>
      {options.length ? (
        <div className="tileset-studio-grid studio-seat-grid">
          {options.map((version) => (
            <StudioCatalogCard
              key={version.id}
              className="studio-seat-card confirm-mark-card"
              title={confirmMarkLabel(version)}
              badge={`${version.media!.width}×${version.media!.height}`}
              selected={(selectedId || options[0]?.id) === version.id}
              onSelect={() => select(version.id)}
              media={<MarkInConfirmBand src={version.media!.url} />}
            />
          ))}
        </div>
      ) : <p>No candidates are uploaded for this seat.</p>}
    </div>
  );
}

export function ConfirmMarkControls({ state }: { state: ConfirmMarkState }): ReactElement {
  const { catalog, selectedId, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const options = catalog ? confirmMarkOptions(catalog) : [];
  const selected = options.find((version) => version.id === selectedId) ?? options[0] ?? null;
  const slot = catalog?.slots.find((entry) => entry.slot === CONFIRM_MARK_SLOT) ?? null;
  const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;

  const install = async (): Promise<void> => {
    if (busy || !catalog || !selected?.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: 'Selected the confirm mark from the verb band it rides.',
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
          slot: CONFIRM_MARK_SLOT,
          canonicalScale: 1,
          surfaceKind: 'Committing verb band at native size, short and long label',
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus('Binding the confirm mark role…');
      await bindApplicationUiRole();
      setStatus('Installed. Every committing verb paints this mark now.');
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
        Each candidate is mounted in the real band at native size, beside the shortest label a
        commitment takes and the longest. Nothing is installed until you install it.
      </p>
      <button
        type="button"
        className="tileset-view-action"
        data-testid="install-confirm-mark"
        disabled={busy || !selected || installed}
        onClick={() => { void install(); }}
      >
        {installed ? 'Confirm mark installed' : busy ? 'Installing…' : 'Use selection for every confirm verb'}
      </button>
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
