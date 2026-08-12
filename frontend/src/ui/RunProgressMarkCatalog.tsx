import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { RunTitleBarMeasures } from './RunTitleBarChips';
import type { RunProgressIconVariant } from './shared/RunProgressIcon';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Owner review for the marks the persistent Run title bar names — the Ataraxia tier, the
 * Conflict and Battle position within the War, and the gold measure beside them — as a Studio
 * CATEGORY.
 *
 * Every candidate is mounted in the SAME chip the live title bar paints and at its native
 * 64×64 pixels; none is installed until the owner installs one. Install is the whole decision
 * in one act: approval of these exact bytes, acceptance into the semantic slot, and binding the
 * slot to its `app-ui` media role — the binding is what makes the title bar resolve it. The
 * public drawable catalog refuses a role bound to an unaccepted slot, so the binding can only
 * ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 *
 * This was its own screen at `/studio?runProgressIconReview=1` until ADR-0588.
 */
/** The candidate batches this category presents. Ataraxia's emblem was forged in its
 *  own pass after the position marks, so it reads a set rather than one id. */
export const RUN_PROGRESS_ICON_BATCH_IDS: readonly string[] = Object.freeze([
  'run-progress-icons-trimmed-2026-08-02-v4',
  'run-ataraxia-mark-2026-08-02-v1',
]);

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
    slot: 'ui/kit/icons/run/ataraxia-mark.png',
    role: 'ui-kit-icons-run-ataraxia-mark-png',
    title: 'Ataraxia',
    idea: 'The emblem that says which ladder the carved rung beside it belongs to. The rung itself is ADR-0363’s installed numeral and is not chosen here.',
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
        || (version.status === 'candidate' && RUN_PROGRESS_ICON_BATCH_IDS.includes(batchId(version) ?? ''))))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function runProgressIconLabel(version: AdminLiveMediaVersion): string {
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

/** The candidate mounted in the exact measure row the live title bar paints. */
function ChipPreview({
  definition,
  src,
}: {
  definition: VariantDefinition;
  src: string;
}): ReactElement {
  return (
    <div className="skirmish-topbar run-progress-mark-chip">
      <div className="skirmish-topbar-status run-topbar-status">
        <RunTitleBarMeasures
          tier={0}
          goldTenths={335}
          conflict={1}
          battle={3}
          battlesInConflict={3}
          goldIconSrc={definition.variant === 'gold' ? src : undefined}
          ataraxiaIconSrc={definition.variant === 'ataraxia' ? src : undefined}
          conflictIconSrc={definition.variant === 'conflict' ? src : undefined}
          battleIconSrc={definition.variant === 'battle' ? src : undefined}
        />
      </div>
    </div>
  );
}

export interface RunProgressMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedIds: Record<string, string>;
  select: (slot: string, id: string) => void;
  error: string;
  refresh: () => void;
}

export function useRunProgressMarks(): RunProgressMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const select = useCallback((slot: string, id: string) => {
    setSelectedIds((previous) => ({ ...previous, [slot]: id }));
  }, []);
  return { catalog, selectedIds, select, error, refresh };
}

export function RunProgressMarkCatalog({ state }: { state: RunProgressMarkState }): ReactElement {
  const { catalog, selectedIds, select, error } = state;
  const seats = useMemo(() => RUN_PROGRESS_ICON_VARIANTS.map((definition) => ({
    definition,
    options: catalog ? runProgressIconOptions(catalog, definition.slot) : [],
  })), [catalog]);
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="run-progress-mark-catalog">
      {seats.map(({ definition, options }) => (
        <section className="run-progress-mark-seat" key={definition.variant}>
          <h3>{definition.title}</h3>
          <p className="tileset-catalog-note">{definition.idea}</p>
          {options.length ? (
            <div className="tileset-studio-grid studio-seat-grid" data-testid={`run-progress-${definition.variant}-grid`}>
              {options.map((version) => (
                <StudioCatalogCard
                  key={version.id}
                  className="studio-seat-card"
                  title={runProgressIconLabel(version)}
                  badge={`${version.media!.width}×${version.media!.height}`}
                  textExtra={<small>{conceptLabel(version)}</small>}
                  selected={(selectedIds[definition.slot] ?? options[0]?.id) === version.id}
                  onSelect={() => select(definition.slot, version.id)}
                  media={<ChipPreview definition={definition} src={version.media!.url} />}
                />
              ))}
            </div>
          ) : <p>No candidates are uploaded for this seat.</p>}
        </section>
      ))}
    </div>
  );
}

export function RunProgressMarkControls({ state }: { state: RunProgressMarkState }): ReactElement {
  const { catalog, selectedIds, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const install = async (definition: VariantDefinition): Promise<void> => {
    if (busy || !catalog) return;
    const options = runProgressIconOptions(catalog, definition.slot);
    const selected = options.find((version) => version.id === selectedIds[definition.slot]) ?? options[0] ?? null;
    if (!selected?.media) return;
    const slot = catalog.slots.find((entry) => entry.slot === definition.slot) ?? null;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: `Selected the ${definition.title} Run-position icon from the title-bar chip it paints.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
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
        Each option is mounted in the real title-bar measure row and at its own native pixels —
        every mark is trimmed to its occupied pixels, so its raster IS its art. Nothing is
        installed until you install it; each seat installs on its own.
      </p>
      {RUN_PROGRESS_ICON_VARIANTS.map((definition) => {
        const slot = catalog?.slots.find((entry) => entry.slot === definition.slot) ?? null;
        const options = catalog ? runProgressIconOptions(catalog, definition.slot) : [];
        const selected = options.find((version) => version.id === selectedIds[definition.slot]) ?? options[0] ?? null;
        const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;
        return (
          <button
            key={definition.variant}
            type="button"
            className="tileset-view-action"
            data-testid={`install-run-progress-${definition.variant}`}
            disabled={busy || !selected || installed}
            onClick={() => { void install(definition); }}
          >
            {installed ? `${definition.title} installed` : busy ? 'Installing…' : `Use selection for ${definition.title}`}
          </button>
        );
      })}
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
