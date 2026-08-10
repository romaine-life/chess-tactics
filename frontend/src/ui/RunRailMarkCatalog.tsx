import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Owner review for the two marks Run preparation's rail tabs wear — Current Run and Start
 * New Run (ADR-0558 made those tabs the shared primitive, and a rail tab carries a mark).
 *
 * Judged in the seat it ships in: every candidate is mounted on a real `ApparatusRailTab`
 * at its native 44px, not in a contact sheet and not in the title bar's tight measure chip,
 * which is a different canvas spec. The Run's title-bar marks are authored edge-to-edge and
 * mount with `markCanvas="bleed"`; these are authored to the kit's inset canvas, so a review
 * that showed them in the chip would be reviewing a size they are never drawn at.
 *
 * Install is the whole decision in one act: it records approval of these exact bytes, accepts
 * the version into its semantic slot, and binds the slot to its `app-ui` media role. The
 * public drawable catalog refuses a role bound to an unaccepted slot, so the binding can only
 * ever follow acceptance (ADR-0316 review shape, ADR-0318 roles).
 */
interface RailMarkSeat {
  key: 'current' | 'new';
  slot: string;
  role: string;
  label: string;
  idea: string;
}

export const RUN_RAIL_MARK_SEATS: readonly RailMarkSeat[] = Object.freeze([
  {
    key: 'current',
    slot: 'ui/kit/icons/run/current.png',
    role: 'ui-kit-icons-run-current-png',
    label: 'Current Run',
    idea: 'The tab that resumes the Run already in progress.',
  },
  {
    key: 'new',
    slot: 'ui/kit/icons/run/new.png',
    role: 'ui-kit-icons-run-new-png',
    label: 'Start New Run',
    idea: 'The tab that abandons whatever is held and begins again.',
  },
]);

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * Every reviewable option for one seat: its candidates plus, when one is already installed,
 * the accepted version so the two can be compared in the same tab.
 *
 * A candidate that cannot be accepted is not an option. Acceptance requires non-empty
 * provenance and native-1x evidence, and offering a version that lacks either produces a
 * card that looks installable and fails at the last step with a server code — so the seat
 * filters them out rather than letting the owner discover it by clicking.
 */
export function runRailMarkOptions(
  catalog: AdminLiveMediaCatalog,
  slot: string,
): AdminLiveMediaVersion[] {
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId ?? null;
  const installable = (version: AdminLiveMediaVersion): boolean =>
    Object.keys(version.provenance ?? {}).length > 0
    && (version.nativeEvidence as { native1x?: unknown; inkBox?: unknown } | undefined)?.native1x === true
    && Boolean((version.nativeEvidence as { inkBox?: unknown } | undefined)?.inkBox)
    && (version.metadata as { runtime?: { component?: unknown } } | undefined)?.runtime?.component === 'run-rail-mark';
  return catalog.versions
    .filter((version) => version.slot === slot
      && Boolean(version.media)
      && (version.id === activeVersionId || (version.status === 'candidate' && installable(version))))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function runRailMarkLabel(version: AdminLiveMediaVersion): string {
  if (version.status === 'accepted') return 'Installed';
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${String(index).padStart(2, '0')}`;
}

export interface RunRailMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedIds: Record<string, string>;
  select: (slot: string, id: string) => void;
  error: string;
  refresh: () => void;
}

export function useRunRailMarks(): RunRailMarkState {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  const select = useCallback((slot: string, id: string) => {
    setSelectedIds((previous) => ({ ...previous, [slot]: id }));
  }, []);
  return { catalog, selectedIds, select, error, refresh };
}

/** Bind an accepted slot to its application-UI media role. Until this exists the tab has no
 *  role to resolve; the catalog rejects the binding before acceptance. */
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

/** The candidate mounted in the real control: one rail tab in a real rail column, so the
 *  mark is drawn by the same seat, at the same size, over the same material as it ships. */
function MarkInRailTab({ src, label }: { src: string; label: string }): ReactElement {
  return (
    <ApparatusRailColumn className="run-rail-mark-preview" aria-label={`${label} tab preview`}>
      <ApparatusRailTab label={label} index={0} iconSrc={src} onSelect={() => undefined} />
    </ApparatusRailColumn>
  );
}

export function RunRailMarkCatalog({ state }: { state: RunRailMarkState }): ReactElement {
  const { catalog, selectedIds, select, error } = state;
  const seats = useMemo(() => RUN_RAIL_MARK_SEATS.map((seat) => ({
    seat,
    options: catalog ? runRailMarkOptions(catalog, seat.slot) : [],
  })), [catalog]);
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="run-rail-mark-catalog">
      {seats.map(({ seat, options }) => (
        <section key={seat.key} className="run-rail-mark-seat">
          <h3>{seat.label}</h3>
          <p className="tileset-catalog-note">{seat.idea}</p>
          {options.length ? (
            <div className="tileset-studio-grid">
              {options.map((version) => (
                <StudioCatalogCard
                  key={version.id}
                  title={runRailMarkLabel(version)}
                  badge={`${version.media!.width}×${version.media!.height}`}
                  selected={(selectedIds[seat.slot] ?? options[0]?.id) === version.id}
                  onSelect={() => select(seat.slot, version.id)}
                  media={<MarkInRailTab src={version.media!.url} label={seat.label} />}
                />
              ))}
            </div>
          ) : <p>No candidates are uploaded for this seat.</p>}
        </section>
      ))}
    </div>
  );
}

export function RunRailMarkControls({ state }: { state: RunRailMarkState }): ReactElement {
  const { catalog, selectedIds, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const install = async (seat: RailMarkSeat): Promise<void> => {
    if (busy || !catalog) return;
    const options = runRailMarkOptions(catalog, seat.slot);
    const selected = options.find((version) => version.id === selectedIds[seat.slot]) ?? options[0] ?? null;
    if (!selected?.media) return;
    const slot = catalog.slots.find((entry) => entry.slot === seat.slot) ?? null;
    setBusy(true);
    setStatus(`Recording approval for the ${seat.label} bytes…`);
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: `Selected the ${seat.label} rail-tab mark from the tab it rides.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: selected.id,
          contentSha256: selected.media.sha256,
          slot: seat.slot,
          canonicalScale: 1,
          surfaceKind: `Run preparation ${seat.label} rail tab seat at native size`,
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus('Binding the rail mark role…');
      await bindApplicationUiRole(seat.role, seat.slot);
      setStatus(`Installed. The ${seat.label} tab paints this mark now.`);
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
        Each candidate is mounted on a real Run rail tab at its native size — the seat it
        ships in, not the title bar's tight measure chip, which is a different canvas spec.
        Nothing is installed until you install it; each seat installs on its own.
      </p>
      {RUN_RAIL_MARK_SEATS.map((seat) => {
        const slot = catalog?.slots.find((entry) => entry.slot === seat.slot) ?? null;
        const options = catalog ? runRailMarkOptions(catalog, seat.slot) : [];
        const selected = options.find((version) => version.id === selectedIds[seat.slot]) ?? options[0] ?? null;
        const installed = selected?.status === 'accepted' && slot?.activeVersionId === selected.id;
        return (
          <button
            key={seat.key}
            type="button"
            className="tileset-view-action"
            data-testid={`install-run-rail-mark-${seat.key}`}
            disabled={busy || !selected || installed}
            onClick={() => { void install(seat); }}
          >
            {installed ? `${seat.label} installed` : busy ? 'Installing…' : `Use selection for ${seat.label}`}
          </button>
        );
      })}
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
