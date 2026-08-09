import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { RunActionIcon, RUN_ACTION_ICON_SLOT, RUN_ACTION_MEDIA_ROLE } from './shared/RunActionIcon';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { useSceneParticipant } from './shell/SceneBoundary';

/**
 * Owner review for the Athetize action's mark. Every candidate is mounted in the
 * SAME control the Expunctio workspace paints — the wide danger button on a held
 * formation's row — and beside it at its own native pixels; none is installed
 * until the owner installs one.
 *
 * Install is the whole decision in one act: it records approval of these exact
 * bytes, accepts the version into its semantic slot, and binds the slot to its
 * `app-ui` media role — the role binding is what makes the button resolve it.
 * The public drawable catalog refuses a role bound to an unaccepted slot, so the
 * binding can only ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
/**
 * v2 draws the card the game actually deals: the ornate gold-on-black back, not an
 * invented pale one. The Chartulary's mark is the player's LIVE card back, so a mark
 * that strikes a different-looking card contradicts the register it removes from. v1's
 * candidates remain uploaded and unaccepted; they are not offered here.
 */
export const ATHETIZE_ICON_BATCH_ID = 'athetize-action-mark-2026-08-09-v2';

const SLOT = RUN_ACTION_ICON_SLOT.athetize;
const ROLE = RUN_ACTION_MEDIA_ROLE.athetize;

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

/** This batch's candidates plus, when one is already installed, the accepted
 *  version so the two can be compared in the same control. */
export function athetizeIconOptions(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots.find((entry) => entry.slot === SLOT)?.activeVersionId ?? null;
  return catalog.versions
    .filter((version) => version.slot === SLOT
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && batchId(version) === ATHETIZE_ICON_BATCH_ID)))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

function optionLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

/** Bind the accepted slot to its application-UI media role. Until this exists the
 *  button has no role to resolve; the catalog rejects it before acceptance. */
async function bindApplicationUiRole(): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  if (media[ROLE] === SLOT) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [ROLE]: SLOT },
    expectedRevision: appUi.rowRevision,
  });
}

function InstallControl({
  version,
  catalog,
  onInstalled,
}: {
  version: AdminLiveMediaVersion;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog.slots.find((entry) => entry.slot === SLOT) ?? null;
  const installed = version.status === 'accepted' && slot?.activeVersionId === version.id;

  const install = async (): Promise<void> => {
    if (busy || !version.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: 'Selected the Athetize action mark from the Expunctio button it rides.',
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: version.id,
          contentSha256: version.media.sha256,
          slot: SLOT,
          canonicalScale: 1,
          surfaceKind: 'Run Expunctio Athetize button seat at native size',
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus('Binding the action media role…');
      await bindApplicationUiRole();
      setStatus('Installed. Every Athetize button paints this mark now — reload Expunctio to see it.');
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {installed ? (
        <p role="status">Installed — every Athetize button paints this one.</p>
      ) : (
        <ChromeButton
          unit="inner-text-button"
          disabled={busy}
          data-testid={`install-athetize-${candidateIndex(version)}`}
          onClick={() => { void install(); }}
        >
          {busy ? 'Installing…' : 'Use for Athetize'}
        </ChromeButton>
      )}
      {status ? <p role="status">{status}</p> : null}
    </>
  );
}

/** The candidate mounted in the exact control the Expunctio row paints, in both
 *  states that control has: the offered action, and the same action refused. */
function ButtonPreview({ src }: { src: string }): ReactElement {
  return (
    <div className="athetize-icon-review-buttons">
      <ChromeButton
        unit="inner-text-button"
        data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
        tabIndex={-1}
      >
        <RunActionIcon variant="athetize" src={src} />
        <span>Athetize</span>
      </ChromeButton>
      <ChromeButton
        unit="inner-text-button"
        data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
        className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
        disabled
      >
        <RunActionIcon variant="athetize" src={src} />
        <span>Athetized this visit</span>
      </ChromeButton>
    </div>
  );
}

export function AthetizeIconReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  const options = useMemo(() => catalog ? athetizeIconOptions(catalog) : [], [catalog]);
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-lipsanon-review-screen athetize-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="athetize-icon-review" titled className="run-lipsanon-review-panel">
        <OuterChromeHeader title="Athetize Action Mark" />
        <p>
          Athetize strikes one held formation from the Chartulary and takes every unit
          attached to it. Each option below is mounted in the real Expunctio button —
          offered, and refused — and shown at its own native pixels beside it. Nothing is
          installed until you install one; the seat stays reserved until then.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog && !options.length ? <p>No candidates are uploaded for this seat.</p> : null}
        {catalog && options.length ? (
          <div className="athetize-icon-review-grid" data-testid="athetize-icon-grid">
            {options.map((version) => (
              <figure data-version-id={version.id} key={version.id}>
                <img
                  className="run-progress-icon-review-native"
                  src={version.media!.url}
                  alt=""
                  draggable={false}
                />
                <span className="run-progress-icon-review-detail">
                  <figcaption>
                    <strong>{optionLabel(version)}</strong>
                    <small>{version.media!.width}×{version.media!.height}</small>
                  </figcaption>
                  <ButtonPreview src={version.media!.url} />
                  <InstallControl version={version} catalog={catalog} onInstalled={refresh} />
                </span>
              </figure>
            ))}
          </div>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
