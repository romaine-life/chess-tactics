import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { ADLECTIO_MARK_MEDIA_ROLE, ADLECTIO_MARK_SLOT, RunAdlectioMarkLine } from './RunAdlectioMark';

/**
 * Owner review for the Adlectio mark: the glyph Expunctio prints beside a formation this Sectio
 * visit admitted (ADR-0549). Every uploaded candidate is mounted in the SAME line the live tile
 * paints — `RunAdlectioMarkLine`, the component the workspace renders, never a lookalike — and
 * they all sit on one page, so the decision is one comparison rather than a walk through one
 * address per candidate.
 *
 * It is a Studio catalog category because that is what a review surface is (ADR-0058): reachable
 * by its tab, by construction. The player route carries no review parameter — a candidate reaches
 * the seat through the component's `src` override, which only this surface passes.
 *
 * Nothing is installed by browsing. Install is the whole decision in one act: it records approval
 * of these exact bytes, accepts the version into the slot, and binds the slot to its `app-ui`
 * media role, which is what makes the runtime resolve it (ADR-0316 review shape, ADR-0318 roles).
 */
export interface AdlectioMarkCandidate {
  id: string;
  label: string;
  sha256: string;
  version: AdminLiveMediaVersion;
  installed: boolean;
}

/**
 * Every candidate uploaded against the mark's slot, ONE CARD PER IMAGE; whatever is installed
 * leads.
 *
 * Re-uploading the same bytes is ordinary — a candidate is re-sent when it gains the runtime
 * metadata or evidence acceptance requires — and each attempt is its own version row. Showing all
 * of them would put three identical marks on the page and leave the owner picking between rows
 * that differ only in what the backend will accept, so the newest row for a given image wins.
 */
export function adlectioMarkCandidates(catalog: AdminLiveMediaCatalog): AdlectioMarkCandidate[] {
  const slot = catalog.slots.find((entry) => entry.slot === ADLECTIO_MARK_SLOT) ?? null;
  const newestByImage = new Map<string, AdlectioMarkCandidate>();
  for (const version of catalog.versions) {
    if (version.slot !== ADLECTIO_MARK_SLOT || !version.media) continue;
    const candidate: AdlectioMarkCandidate = {
      id: version.id,
      label: version.label || 'Candidate',
      sha256: version.media.sha256,
      version,
      installed: version.status === 'accepted' && slot?.activeVersionId === version.id,
    };
    const seen = newestByImage.get(candidate.sha256);
    const newer = !seen
      || candidate.installed
      || (!seen.installed && candidate.version.createdAt > seen.version.createdAt);
    if (newer) newestByImage.set(candidate.sha256, candidate);
  }
  return [...newestByImage.values()].sort((left, right) => (
    Number(right.installed) - Number(left.installed)
    || left.label.localeCompare(right.label)
  ));
}

export function useAdlectioMarkCatalog(): {
  items: AdlectioMarkCandidate[];
  catalog: AdminLiveMediaCatalog | null;
  loading: boolean;
  error: string;
  refresh: () => void;
} {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  const items = useMemo(() => catalog ? adlectioMarkCandidates(catalog) : [], [catalog]);
  return { items, catalog, loading: !catalog && !error, error, refresh: () => setNonce((value) => value + 1) };
}

/** Bind the accepted slot to its application-UI media role, or the seat has nothing to resolve. */
async function bindApplicationUiRole(): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const appUi = catalog.assets.find((asset) => asset.id === 'app-ui');
  if (!appUi) throw new Error('the application UI drawable is unavailable');
  const media = Object.fromEntries(
    Object.entries(appUi.media).map(([name, binding]) => [name, binding.slot]),
  );
  if (media[ADLECTIO_MARK_MEDIA_ROLE] === ADLECTIO_MARK_SLOT) return;
  await saveDrawableAsset({
    id: appUi.id,
    kind: appUi.kind,
    label: appUi.label,
    sortOrder: appUi.sortOrder,
    lifecycleState: appUi.lifecycleState,
    behavior: appUi.behavior,
    metadata: appUi.metadata,
    media: { ...media, [ADLECTIO_MARK_MEDIA_ROLE]: ADLECTIO_MARK_SLOT },
    expectedRevision: appUi.rowRevision,
  });
}

/**
 * The rail's half of the decision. It lives in the controls rather than on the card because a
 * catalog card IS a button — a second one nested inside it is invalid, which is why every other
 * catalog puts its actions here (ADR-0342's focused Viewer/controls split).
 */
export function AdlectioMarkInstallControl({
  candidate,
  catalog,
  onInstalled,
}: {
  candidate: AdlectioMarkCandidate | null;
  catalog: AdminLiveMediaCatalog | null;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const slot = catalog?.slots.find((entry) => entry.slot === ADLECTIO_MARK_SLOT) ?? null;

  const install = async (): Promise<void> => {
    if (busy || !candidate?.version.media) return;
    setBusy(true);
    setStatus('Recording approval for these exact bytes…');
    try {
      const reviewed = await reviewLiveMediaVersion({
        id: candidate.version.id,
        expectedRevision: candidate.version.rowRevision,
        notes: 'Selected the Adlectio mark from the Expunctio line it paints.',
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: candidate.version.id,
          contentSha256: candidate.version.media.sha256,
          slot: ADLECTIO_MARK_SLOT,
          canonicalScale: 1,
          surfaceKind: 'Expunctio “Adlected this visit” mark seat at its live 30px size',
        },
      });
      setStatus('Installing…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus('Binding the media role…');
      await bindApplicationUiRole();
      setStatus('Installed. Expunctio prints this mark now — reload a Run screen to see it.');
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!candidate) return <p className="tileset-catalog-note">Pick a candidate to install it.</p>;
  return (
    <>
      {candidate.installed ? (
        <p className="tileset-catalog-note" role="status">Installed — Expunctio prints this one.</p>
      ) : (
        <button
          type="button"
          className="tileset-view-action"
          disabled={busy}
          data-testid="install-adlectio-mark"
          onClick={() => { void install(); }}
        >
          {busy ? 'Installing…' : `Use ${candidate.label}`}
        </button>
      )}
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}

export function AdlectioMarkReviewCatalog({
  items,
  loading,
  error,
  selected,
  onSelect,
}: {
  items: readonly AdlectioMarkCandidate[];
  loading: boolean;
  error: string;
  selected: string;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections">
          {error ? <p className="tileset-catalog-note" role="alert">{error}</p> : null}
          {loading ? <p className="tileset-catalog-note" role="status">Loading Adlectio mark candidates…</p> : null}
          {!loading && !error && !items.length ? (
            <p className="tileset-catalog-note">No candidates are uploaded against {ADLECTIO_MARK_SLOT} yet.</p>
          ) : null}
          {items.length ? (
            <div className="tileset-studio-grid" data-testid="adlectio-mark-grid">
              {/* What the line prints right now, on the page beside every candidate rather than
                  remembered — with nothing installed that is the coin alone. */}
              <StudioCatalogCard
                title="Live"
                badge="installed today"
                imageClassName="pages-card-image"
                media={<RunAdlectioMarkLine />}
                selected={false}
                onSelect={() => onSelect('')}
                ariaLabel="The Adlectio mark line as it prints today"
              />
              {items.map((item) => (
                <StudioCatalogCard
                  key={item.id}
                  title={item.label}
                  badge={item.installed ? 'installed' : item.sha256.slice(0, 12)}
                  imageClassName="pages-card-image"
                  media={<RunAdlectioMarkLine src={`/api/admin/media/${item.sha256}`} />}
                  selected={selected === item.id}
                  onSelect={() => onSelect(item.id)}
                  ariaLabel={`${item.label} in the Expunctio mark line`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
