import { useCallback, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import { RUN_CARD_BACKS, type RunCardBack as RunCardBackId } from '../settings/appSettings';
import { RUN_CARD_BACK_LABELS, runCardBackSlot } from '../settings/runCardBack';
import { RunCardBack } from './RunCardBack';
import { ChromeButton } from './shared/ChromeButton';

/**
 * The Studio's card-back review surface — `/studio?mode=viewer&vk=cardlayout&backStudy=1`.
 *
 * It exists because a card back had nowhere to be reviewed. Card Layout mounts the card FACE, and
 * every other allowlisted review surface is a board or a unit; the back was promoted once from a
 * URL whose parameters the Studio never read. So this mounts each offered back through the real
 * RunCardBack component against its own live-media slot, at canonical 1x, which is the only claim
 * a promotion is allowed to make: these are the exact bytes, at their exact size, in the object
 * that draws them in the Run.
 *
 * Its address is the proof URL recorded on every back it publishes, so the evidence points at a
 * surface that genuinely renders what was approved.
 */
const PROOF_SCHEMA = 'run-card-back-selectable-set-proof-v1';

type Specimen = Readonly<{
  id: RunCardBackId;
  slot: string;
  title: string;
  detail: string;
  status: string;
  sha256: string | null;
  url: string | null;
  rowRevision: number;
}>;

function specimensFrom(catalog: AdminLiveMediaCatalog | null): readonly Specimen[] {
  const slots = new Map((catalog?.slots ?? []).map((slot) => [slot.slot, slot]));
  return RUN_CARD_BACKS.map((id) => {
    const slot = runCardBackSlot(id);
    // Prefer the pending candidate: this surface exists to look at what is about to be published,
    // and once published the same row is simply the accepted one.
    const versions = (catalog?.versions ?? []).filter((version) => version.slot === slot);
    const active = slots.get(slot)?.activeVersionId ?? null;
    const version = versions.find((candidate) => candidate.status === 'candidate')
      ?? versions.find((candidate) => candidate.id === active)
      ?? null;
    return {
      id,
      slot,
      title: RUN_CARD_BACK_LABELS[id].label,
      detail: RUN_CARD_BACK_LABELS[id].detail,
      status: version?.status ?? 'missing',
      sha256: version?.media?.sha256 ?? null,
      url: version?.media?.immutableUrl ?? version?.media?.url ?? null,
      rowRevision: version?.rowRevision ?? 0,
    };
  });
}

export function RunCardBackStudy({ header, viewerZoom }: { header: ReactNode; viewerZoom: number }): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setCatalog(await fetchAdminLiveMediaCatalog());
    } catch (reason) {
      setStatus(reason instanceof Error ? `Could not load card backs: ${reason.message}` : 'Could not load card backs.');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const specimens = specimensFrom(catalog);
  // Strictly this decision's own candidates. A slot can carry someone else's in-flight candidate —
  // the shared media catalog is production, and other work lands in it continuously — and a
  // publish button that swept up every candidate sitting on a slot it recognises would accept
  // changes nobody reviewed here. Membership is the provenance stamp, never slot occupancy.
  const pending = (catalog?.versions ?? []).filter((version) => (
    version.status === 'candidate'
    && specimens.some((specimen) => specimen.slot === version.slot)
    && (version.provenance as { decision?: unknown } | null)?.decision === 'ADR-0521'
  ));
  const canPublish = pending.length > 0 && pending.every((version) => Boolean(version.media));

  const publish = async (): Promise<void> => {
    if (!catalog || !canPublish || busy) return;
    setBusy(true);
    setStatus(`Recording approval for ${pending.length} card back${pending.length === 1 ? '' : 's'}…`);
    try {
      const surfaceUrl = window.location.href;
      // One review per back, not a batch. Batch review is for an atomic acceptance group, and
      // these are deliberately independent: a back is complete by itself, and binding six of them
      // into one group would make replacing a single design a six-slot ceremony.
      const reviewed = await Promise.all(pending.map((version) => reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: 'Owner reviewed the complete opaque card-back candidates side by side and selected six for the '
          + 'player-selectable set, excluding The Sovereign Seal. The King’s Position is the shipped default. '
          + 'This raster is the byte-identical reviewed candidate at canonical 1x.',
        surfaceUrl,
        evidence: {
          schema: PROOF_SCHEMA,
          decision: 'ADR-0521',
          renderer: 'RunCardBack/CardBackStudy',
          surfaceUrl,
          canonicalScale: 1,
          spatialResampling: false,
          slot: version.slot,
          sha256: version.media?.sha256 ?? null,
          offeredSet: specimens.map((specimen) => ({ slot: specimen.slot, back: specimen.id, sha256: specimen.sha256 })),
        },
      })));
      const slots = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
      const byId = new Map(pending.map((version) => [version.id, version]));
      await acceptLiveMediaVersions(reviewed.map((version) => {
        // Read the slot off the candidate we sent rather than off the reviewed row: a version can
        // be identified by source path instead of slot, and only the ones we chose are slot-backed.
        const slotName = byId.get(version.id)?.slot ?? version.slot;
        const slot = slotName ? slots.get(slotName) : undefined;
        return {
          id: version.id,
          expectedRevision: version.rowRevision,
          expectedSlotRevision: slot?.rowRevision ?? 0,
          expectedActiveVersionId: slot?.activeVersionId ?? null,
        };
      }));
      setStatus('Published. Every offered back is now accepted on its own runtime slot.');
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Could not publish: ${reason.message}` : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="run-card-back-study" aria-label="Run card backs">
      {header}
      <div
        className="run-card-back-study-grid"
        style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
      >
        {specimens.map((specimen) => (
          <figure className="run-card-back-study-specimen" key={specimen.id}>
            {specimen.url
              ? <RunCardBack mediaUrl={specimen.url} width="calc(210px * var(--run-card-gallery-zoom, 1))" />
              : <p className="run-card-back-study-footnote">No candidate or accepted media on {specimen.slot}</p>}
            <figcaption>
              <strong>{specimen.title}</strong>
              <small>{specimen.detail}</small>
              <small data-card-back-status={specimen.status}>{specimen.status}</small>
            </figcaption>
          </figure>
        ))}
      </div>
      {canPublish ? (
        <ChromeButton unit="inner-text-button" disabled={busy} onClick={() => { void publish(); }}>
          {busy ? 'Publishing…' : `Approve and publish ${pending.length} card back${pending.length === 1 ? '' : 's'}`}
        </ChromeButton>
      ) : null}
      <p className="run-card-back-study-footnote" role="status">
        {status || 'This surface reads candidate or accepted bytes from live storage; no review PNG is packaged with the application.'}
      </p>
    </section>
  );
}
