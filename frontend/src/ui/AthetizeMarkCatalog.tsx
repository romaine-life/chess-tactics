import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { RunActionIcon, RUN_ACTION_ICON_SLOT, RUN_ACTION_MEDIA_ROLE } from './shared/RunActionIcon';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * The Athetize action mark, judged where every candidate is on one page in the real
 * control — a Studio catalog category reachable by clicking its tab (ADR-0058).
 *
 * It is NOT a `?athetizeCandidate=<sha256>` parameter on a Run route. That shape makes a
 * player route carry review state it has no business carrying, and turns a comparison
 * into one page load per candidate, which is not a comparison. The grandfathered params
 * elsewhere in the app are debt, not a pattern to copy.
 *
 * Install is the whole decision in one act: it records approval of these exact bytes,
 * accepts the version into its semantic slot, and binds the slot to its `app-ui` media
 * role. The public drawable catalog refuses a role bound to an unaccepted slot, so the
 * binding can only ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
export const ATHETIZE_MARK_BATCH_ID = 'athetize-action-mark-2026-08-09-v2';

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

/** This batch's candidates plus, when one is already installed, the accepted version so
 *  the two can be compared in the same control. */
export function athetizeMarkOptions(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots.find((entry) => entry.slot === SLOT)?.activeVersionId ?? null;
  return catalog.versions
    .filter((version) => version.slot === SLOT
      && Boolean(version.media)
      && (version.id === activeVersionId
        || (version.status === 'candidate' && batchId(version) === ATHETIZE_MARK_BATCH_ID)))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function athetizeMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

export interface AthetizeMarkState {
  catalog: AdminLiveMediaCatalog | null;
  options: AdminLiveMediaVersion[];
  selected: AdminLiveMediaVersion | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  error: string;
  refresh: () => void;
}

/** One fetch and one selection, shared by the grid and the controls rail. */
export function useAthetizeMark(): AthetizeMarkState {
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
  const options = useMemo(() => catalog ? athetizeMarkOptions(catalog) : [], [catalog]);
  const selected = options.find((version) => version.id === selectedId) ?? options[0] ?? null;
  return { catalog, options, selected, selectedId, setSelectedId, error, refresh };
}

/** Bind the accepted slot to its application-UI media role. Until this exists the button
 *  has no role to resolve; the catalog rejects it before acceptance. */
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

/** The candidate mounted in the exact control the Expunctio row paints, in both states
 *  that control has: the offered action, and the same action refused. */
function MarkInButton({ src }: { src: string }): ReactElement {
  return (
    <span className="athetize-mark-buttons">
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
    </span>
  );
}

export function AthetizeMarkCatalog({ state }: { state: AthetizeMarkState }): ReactElement {
  const { catalog, options, selected, setSelectedId, error } = state;
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  if (!options.length) return <p>No candidates are uploaded for this seat.</p>;
  return (
    <div className="tileset-studio-grid athetize-mark-grid" data-testid="athetize-mark-grid">
      {options.map((version) => (
        <StudioCatalogCard
          key={version.id}
          title={athetizeMarkLabel(version)}
          badge={`${version.media!.width}×${version.media!.height}`}
          selected={selected?.id === version.id}
          onSelect={() => setSelectedId(version.id)}
          media={<MarkInButton src={version.media!.url} />}
          imageClassName="athetize-mark-card-image"
          textExtra={typeof version.metadata.concept === 'string'
            ? <small>{version.metadata.concept}</small>
            : null}
        />
      ))}
    </div>
  );
}

export function AthetizeMarkControls({ state }: { state: AthetizeMarkState }): ReactElement {
  const { catalog, selected, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog?.slots.find((entry) => entry.slot === SLOT) ?? null;
  const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;

  const install = async (): Promise<void> => {
    if (busy || !selected?.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: 'Selected the Athetize action mark from the Expunctio button it rides.',
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
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
      setStatus('Installed. Every Athetize button paints this mark now.');
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
        Athetize strikes one held formation from the Chartulary and takes every unit attached
        to it. Each option is mounted in the real Expunctio button — offered, and refused.
        Nothing is installed until you install one; the seat stays reserved until then.
      </p>
      <button
        type="button"
        className="tileset-view-action"
        data-testid="install-athetize-mark"
        disabled={busy || !selected || installed}
        onClick={() => { void install(); }}
      >
        {installed ? 'Installed' : busy ? 'Installing…' : `Use ${selected ? athetizeMarkLabel(selected) : 'selection'} for Athetize`}
      </button>
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
