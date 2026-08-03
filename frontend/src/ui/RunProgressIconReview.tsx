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
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { RunTitleBarMeasures } from './RunTitleBarChips';
import type { RunProgressIconVariant } from './shared/RunProgressIcon';
import { useSceneParticipant } from './shell/SceneBoundary';

/**
 * Owner review for the three repeatable Run ideas the persistent title bar names:
 * the Ataraxia tier, and the Conflict / Battle position within the War. Every
 * candidate is mounted in the SAME chip the live title bar paints and at its
 * native 64×64 pixels; none of them is installed until the owner installs one.
 *
 * Install is the whole decision in one act: it records approval of these exact
 * bytes, accepts the version into its semantic slot, and binds the slot to its
 * `app-ui` media role — the role binding is what makes the title bar resolve it.
 * The public drawable catalog refuses a role bound to an unaccepted slot, so the
 * binding can only ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
export const RUN_PROGRESS_ICON_BATCH_ID = 'run-progress-icons-trimmed-2026-08-02-v4';

/** One mark in the title bar's measure row. `role` is the application-UI media
 *  role the slot must be bound to once accepted, or null when the slot already
 *  reaches the runtime through its own installed drawable (gold). */
interface VariantDefinition {
  variant: RunProgressIconVariant | 'gold';
  slot: string;
  role: string | null;
  title: string;
  idea: string;
}

export const RUN_PROGRESS_ICON_VARIANTS: readonly VariantDefinition[] = Object.freeze([
  {
    variant: 'ataraxia',
    slot: 'ui/kit/icons/run/ataraxia.png',
    role: 'ui-kit-icons-run-ataraxia-png',
    title: 'Ataraxia',
    idea: 'The Run difficulty tier. The symbol names it; only the tier is written.',
  },
  {
    variant: 'conflict',
    slot: 'ui/kit/icons/run/conflict.png',
    role: 'ui-kit-icons-run-conflict-png',
    title: 'Conflict',
    idea: 'Which chapter of the War the Run is in.',
  },
  {
    variant: 'battle',
    slot: 'ui/kit/icons/run/battle.png',
    role: 'ui-kit-icons-run-battle-png',
    title: 'Battle',
    idea: 'Which Battle of that Conflict the Run is on.',
  },
  {
    variant: 'gold',
    slot: 'ui/run/resources/gold.png',
    role: null,
    title: 'Gold',
    idea: 'The fourth mark in the same row. Its installed drawable already binds this slot, so installing here only swaps the bytes — and swaps them everywhere gold is drawn.',
  },
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

/** Every reviewable option for one variant: this batch's candidates plus, when one
 *  is already installed, the accepted version so the two can be compared. */
export function runProgressIconOptions(
  catalog: AdminLiveMediaCatalog,
  slot: string,
): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId ?? null;
  return catalog.versions
    .filter((version) => version.slot === slot
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && batchId(version) === RUN_PROGRESS_ICON_BATCH_ID)))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

function optionLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

function conceptLabel(version: AdminLiveMediaVersion): string {
  return typeof version.metadata.concept === 'string' ? version.metadata.concept : version.label;
}

/** Bind the accepted slot to its application-UI media role. Until this exists the
 *  title bar has no role to resolve; the catalog rejects it before acceptance. */
async function bindApplicationUiRole(role: string, slot: string): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  if (media[role] === slot) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [role]: slot },
    expectedRevision: appUi.rowRevision,
  });
}

function InstallControl({
  definition,
  version,
  catalog,
  onInstalled,
}: {
  definition: VariantDefinition;
  version: AdminLiveMediaVersion;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog.slots.find((entry) => entry.slot === definition.slot) ?? null;
  const installed = version.status === 'accepted' && slot?.activeVersionId === version.id;

  const install = async (): Promise<void> => {
    if (busy || !version.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: `Selected the ${definition.title} Run-position icon from the title-bar chip it paints.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: version.id,
          contentSha256: version.media.sha256,
          slot: definition.slot,
          canonicalScale: 1,
          surfaceKind: `Run title-bar ${definition.title} chip seat at native 64x64`,
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      if (definition.role) {
        setStatus('Binding the title-bar media role…');
        await bindApplicationUiRole(definition.role, definition.slot);
      }
      setStatus(`Installed. The title bar paints this ${definition.title} icon now — reload a Run screen to see it.`);
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
        <p role="status">Installed — the title bar paints this one.</p>
      ) : (
        <ChromeButton
          unit="inner-text-button"
          disabled={busy}
          data-testid={`install-${definition.variant}-${candidateIndex(version)}`}
          onClick={() => { void install(); }}
        >
          {busy ? 'Installing…' : `Use for ${definition.title}`}
        </ChromeButton>
      )}
      {status ? <p role="status">{status}</p> : null}
    </>
  );
}

/** The candidate mounted in the exact measure row the live title bar paints. */
function ChipPreview({
  definition,
  src,
}: {
  definition: VariantDefinition;
  src: string;
}): ReactElement {
  return (
    <div className="skirmish-topbar run-progress-icon-review-chip">
      <div className="skirmish-topbar-status run-topbar-status">
        <RunTitleBarMeasures
          tier={0}
          goldTenths={335}
          conflict={1}
          battle={3}
          battlesInConflict={3}
          ataraxiaIconSrc={definition.variant === 'ataraxia' ? src : undefined}
          goldIconSrc={definition.variant === 'gold' ? src : undefined}
          conflictIconSrc={definition.variant === 'conflict' ? src : undefined}
          battleIconSrc={definition.variant === 'battle' ? src : undefined}
        />
      </div>
    </div>
  );
}

export function RunProgressIconReview(): ReactElement {
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
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-relic-review-screen run-progress-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-progress-icon-review" titled className="run-relic-review-panel">
        <OuterChromeHeader title="Run Title-Bar Icon Review" />
        <p>
          Each option is mounted in the real title-bar measure row and at its own native
          pixels — every mark is trimmed to its occupied pixels, so its raster IS its art.
          Nothing is installed until you install one; the seat stays reserved until then.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? RUN_PROGRESS_ICON_VARIANTS.map((definition) => {
          const options = runProgressIconOptions(catalog, definition.slot);
          return (
            <section
              className="run-progress-icon-review-section"
              aria-labelledby={`run-progress-${definition.variant}-title`}
              key={definition.variant}
            >
              <h2 id={`run-progress-${definition.variant}-title`}>{definition.title}</h2>
              <p>{definition.idea}</p>
              {options.length ? (
                <div
                  className="run-progress-icon-review-grid"
                  data-testid={`run-progress-${definition.variant}-grid`}
                >
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
                          <small>{conceptLabel(version)}</small>
                        </figcaption>
                        <ChipPreview definition={definition} src={version.media!.url} />
                        <InstallControl
                          definition={definition}
                          version={version}
                          catalog={catalog}
                          onInstalled={refresh}
                        />
                      </span>
                    </figure>
                  ))}
                </div>
              ) : <p>No candidates are uploaded for this seat.</p>}
            </section>
          );
        }) : null}
      </OuterChromeBox>
    </main>
  );
}
