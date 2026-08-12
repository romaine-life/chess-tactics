import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

// The Studio category for UI-kit icon candidates.
//
// A kit icon uploaded by tooling lands in a STAGING slot the running app cannot see, and
// promoting it needs an owner review record naming the surface the owner judged it on. Until
// this page existed there was no such surface for the ui-kit domain, so an uploaded mark could
// only be promoted by writing a review record for a surface nobody had looked at.
//
// So this page IS the surface, and the address it records is its own. Every candidate is
// mounted at the size it actually draws at — a mark is judged in its seat, not at its source
// resolution, and the two disagree: a 64px source with generous margin looks fine here and
// vanishes in a 22px seat.

interface Candidate {
  slot: AdminLiveMediaSlot;
  version: AdminLiveMediaVersion;
}

/** The kit's own icon shelf. The ui-kit DOMAIN is much wider than this — it also carries the
 * chrome-exploration batches under `ui/chrome-candidates/`, which are ChromeLab's business and
 * number in the hundreds. Scoping to the icon shelf is what keeps this page a review surface
 * rather than a dump of every staged byte in the domain. */
export const KIT_ICON_SLOT_PREFIX = 'ui/kit/icons/';

/** Icon slots still staged: uploaded, not yet approved, invisible to the running app. */
export function kitIconCandidates(catalog: AdminLiveMediaCatalog): Candidate[] {
  const out: Candidate[] = [];
  for (const slot of catalog.slots) {
    if (slot.domain !== 'ui-kit') continue;
    if (!slot.slot.startsWith(KIT_ICON_SLOT_PREFIX)) continue;
    if (slot.lifecycleState !== 'staging' || slot.activeVersionId) continue;
    const versions = catalog.versions
      .filter((version) => version.slot === slot.slot && version.status === 'candidate')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const version = versions[0];
    if (version) out.push({ slot, version });
  }
  return out.sort((a, b) => a.slot.slot.localeCompare(b.slot.slot));
}

/** The seat sizes a kit mark has to survive, smallest last so the hardest case reads first. */
const SEATS = [64, 32, 22] as const;

/** A staged candidate has no immutable URL — it is not in the public catalog yet, which is the
 * whole point of staging. Its bytes are content-addressed and served to admins by hash. */
function candidateSrc(version: AdminLiveMediaVersion): string | null {
  if (version.media?.immutableUrl) return version.media.immutableUrl;
  return version.media?.sha256 ? `/api/admin/media/${version.media.sha256}` : null;
}

export function KitIconCandidates(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setCatalog(await fetchAdminLiveMediaCatalog());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const install = async (candidate: Candidate): Promise<void> => {
    setBusy(candidate.version.id);
    try {
      // The recorded surface is this page, because this page is where it was looked at.
      const reviewed = await reviewLiveMediaVersion({
        id: candidate.version.id,
        expectedRevision: candidate.version.rowRevision,
        notes: `Owner approved ${candidate.slot.slot} from the Studio kit-icon candidates page.`,
        surfaceUrl: window.location.href,
        evidence: { surface: 'studio/kiticons', seatsShown: [...SEATS] },
      });
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: candidate.slot.rowRevision,
        expectedActiveVersionId: candidate.slot.activeVersionId,
      }]);
      await reload();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  if (error && !catalog) return <p className="tileset-catalog-note" role="alert">{error}</p>;
  if (!catalog) return <p className="tileset-catalog-note">Reading the live media catalog…</p>;

  const candidates = kitIconCandidates(catalog);

  return (
    <div className="kit-icon-candidates">
      {error ? <p className="tileset-catalog-note" role="alert">{error}</p> : null}
      {candidates.length === 0 ? (
        <p className="tileset-catalog-note">
          No kit icon is waiting on review. Upload one with
          {' '}<code>live-media-admin-client.mjs upload-candidate</code>{' '} and it appears here.
        </p>
      ) : null}
      <ul className="kit-icon-candidate-list">
        {candidates.map(({ slot, version }) => (
          <li key={version.id} className="kit-icon-candidate">
            <div className="kit-icon-candidate-identity">
              <span className="kit-icon-candidate-slot">{slot.slot}</span>
              <span className="kit-icon-candidate-label">{version.label}</span>
              <span className="kit-icon-candidate-meta">
                {version.media ? `${version.media.width}×${version.media.height}` : 'no bytes'}
                {' · '}{slot.availabilityPolicy}
              </span>
            </div>
            <div className="kit-icon-candidate-seats">
              {SEATS.map((size) => (
                <span key={size} className="kit-icon-candidate-seat">
                  <span className="kit-icon-candidate-seat-box" style={{ inlineSize: size, blockSize: size }}>
                    {candidateSrc(version) ? <img src={candidateSrc(version) as string} alt="" /> : null}
                  </span>
                  <span className="kit-icon-candidate-seat-size">{size}px</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="tileset-view-action"
              disabled={busy !== null}
              onClick={() => void install({ slot, version })}
            >
              {busy === version.id ? 'Installing…' : 'Approve and install'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
