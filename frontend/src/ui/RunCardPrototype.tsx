import { useCallback, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import { RUN_CARD_CATALOG } from '../run/model';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import { RunCard } from './RunCard';
import { RunCardFace } from './RunCardFace';
import { runCardFaceContent } from './runCardFaceContent';
import {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
} from './runCardFrameGeometry';
import {
  runCardRarityFrameAcceptanceItem,
  runCardRarityFrameReviewProof,
  runCardRarityFrameSelection,
  type RunCardVisualRarity,
} from './runCardRarityFrameLiveMedia';
import { RunCardBack } from './RunCardBack';
import {
  runCardBackAcceptanceItem,
  runCardBackCandidateGroups,
  runCardBackPublished,
  runCardBackRequestedSha,
  runCardBackReviewAddress,
  runCardBackReviewProof,
  runCardBackSelection,
  type RunCardBackSelection,
} from './runCardBackLiveMedia';
import { replaceAppHistoryState } from './navigation';
import { ChromeButton } from './shared/ChromeButton';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

type RarityStudySpecimen = Readonly<{
  label: 'Common' | 'Uncommon' | 'Rare';
  note: string;
  frameUrl: string | null;
}>;

function RunCardRarityStudy({ header, viewerZoom }: { header: ReactNode; viewerZoom: number }): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setCatalog(await fetchAdminLiveMediaCatalog());
    } catch (reason) {
      setStatus(reason instanceof Error ? `Could not load rarity frames: ${reason.message}` : 'Could not load rarity frames.');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const search = new URLSearchParams(window.location.search);
  const uncommon = catalog ? runCardRarityFrameSelection(catalog, 'uncommon', search) : null;
  const rare = catalog ? runCardRarityFrameSelection(catalog, 'rare', search) : null;
  const card = RUN_CARD_CATALOG.find((candidate) => candidate.id === 'ppk-protected') ?? RUN_CARD_CATALOG[1];
  const face = runCardFaceContent(card);
  const artUrl = resolvedLiveMediaUrl(runCardArtSlot(card));
  const specimens: readonly RarityStudySpecimen[] = [
    { label: 'Common', note: 'Original frame', frameUrl: liveMediaForSlot(RUN_CARD_FRAME_SLOT).media.immutableUrl },
    { label: 'Uncommon', note: 'Light-blue artwork frame', frameUrl: uncommon?.version.media?.immutableUrl ?? uncommon?.version.media?.url ?? null },
    { label: 'Rare', note: 'Gold artwork frame', frameUrl: rare?.version.media?.immutableUrl ?? rare?.version.media?.url ?? null },
  ];
  const selections = { uncommon, rare } as const;
  const canPublish = uncommon?.version.status === 'candidate' && rare?.version.status === 'candidate';

  const publish = async (): Promise<void> => {
    if (
      !catalog || !uncommon || !rare
      || uncommon.version.status !== 'candidate' || rare.version.status !== 'candidate' || busy
    ) return;
    setBusy(true);
    setStatus('Recording approval for the exact light-blue and gold artwork-frame bytes…');
    try {
      const surfaceUrl = window.location.href;
      const reviewed = await Promise.all((['uncommon', 'rare'] as const).map((rarity: RunCardVisualRarity) => {
        const selection = selections[rarity];
        if (!selection) throw new Error(`${rarity} candidate is unavailable`);
        return reviewLiveMediaVersion({
          id: selection.version.id,
          expectedRevision: selection.version.rowRevision,
          notes: `${rarity === 'uncommon' ? 'Light-blue' : 'Gold'} Standard artwork frame selected; outer card, geometry, and live-content openings preserved.`,
          surfaceUrl,
          evidence: runCardRarityFrameReviewProof({ rarity, ...selection, surfaceUrl }),
        });
      }));
      setStatus('Publishing both semantic rarity slots…');
      await acceptLiveMediaVersions(reviewed.map((version, index) => (
        runCardRarityFrameAcceptanceItem(version, index === 0 ? uncommon.slot : rare.slot)
      )));
      setStatus('Published. Common, Uncommon, and Rare now resolve through independent Standard-frame rarity slots.');
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Publish failed: ${reason.message}` : 'Publish failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="run-card-prototype-workspace run-card-rarity-study" aria-label="Standard card rarity-frame review">
      {header}
      <header className="run-card-rarity-study-heading">
        <span>Standard frame family · exact live-media review</span>
        <h2>Rarity colors the artwork frame</h2>
        <p>Every rarity keeps the original outer card. Uncommon makes only the frame around the illustration light blue; Rare makes it gold. The title, artwork, type, ledger, and coin remain the shared live card anatomy.</p>
      </header>
      <div className="run-card-rarity-study-grid" style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}>
        {specimens.map((specimen) => (
          <figure className="run-card-rarity-study-specimen" key={specimen.label}>
            <figcaption><strong>{specimen.label}</strong><span>{specimen.note}</span></figcaption>
            {specimen.frameUrl ? (
              <RunCardFace
                card={face}
                frameUrl={specimen.frameUrl}
                artUrl={artUrl}
                frameGeometry={RUN_CARD_STANDARD_FRAME_GEOMETRY}
                width="calc(210px * var(--run-card-gallery-zoom, 1))"
              />
            ) : <p className="run-card-rarity-study-footnote">No selected or accepted frame</p>}
          </figure>
        ))}
      </div>
      {canPublish ? (
        <ChromeButton unit="inner-text-button" disabled={busy} onClick={() => { void publish(); }}>
          {busy ? 'Publishing…' : 'Approve and publish artwork frames'}
        </ChromeButton>
      ) : null}
      <p className="run-card-rarity-study-footnote" role="status">{status || 'This surface reads candidate or accepted bytes from live storage; no review PNG is packaged with the application.'}</p>
    </section>
  );
}

function RunCardBackSpecimen({
  caption,
  selection,
}: {
  caption: string;
  selection: RunCardBackSelection | null;
}): ReactElement {
  const mediaUrl = selection?.version.media?.immutableUrl ?? selection?.version.media?.url ?? null;
  return (
    <figure>
      <figcaption>{caption}{selection ? ` · ${selection.version.media?.sha256?.slice(0, 12)}` : ''}</figcaption>
      {mediaUrl ? (
        // The registered Studio card-image surface supplies the alpha field, so
        // the card's own silhouette is what the reviewer is looking at.
        <span className="tileset-studio-card-image run-card-back-specimen">
          <RunCardBack mediaUrl={mediaUrl} />
        </span>
      ) : <p className="run-card-rarity-study-footnote">Nothing published for this slot</p>}
    </figure>
  );
}

/**
 * The owner's review surface for the universal face-down card.
 *
 * The backend refuses a card-back acceptance whose proof does not name this
 * exact address, so this surface and that proof are built from one module. The
 * comparison itself is the point: the published back beside the candidate, both
 * on the alpha field, so the difference in silhouette is what the eye lands on.
 */
function RunCardBackStudy({ header, viewerZoom }: { header: ReactNode; viewerZoom: number }): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [addressSha, setAddressSha] = useState(
    () => new URLSearchParams(window.location.search).get('backCandidate') ?? '',
  );
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setCatalog(await fetchAdminLiveMediaCatalog());
    } catch (reason) {
      setStatus(reason instanceof Error ? `Could not load card backs: ${reason.message}` : 'Could not load card backs.');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const search = new URLSearchParams(window.location.search);
  const published = catalog ? runCardBackPublished(catalog) : null;
  const selection = catalog ? runCardBackSelection(catalog, search) : null;
  const groups = catalog ? runCardBackCandidateGroups(catalog) : [];
  const reviewing = selection && selection.version.status === 'candidate' ? selection : null;

  // Selecting a card moves the address onto it, so the proof records the surface
  // actually on screen.
  const select = useCallback((sha256: string): void => {
    replaceAppHistoryState(null, runCardBackReviewAddress(sha256, window.location.search));
    setAddressSha(sha256);
  }, []);

  // Arriving without a named card (from the catalog entry, or a bare address)
  // still has to end up on one: the acceptance gate reads the reviewed bytes out
  // of the URL, so a surface showing a card the address does not name could be
  // approved and then refused.
  const selectedSha = selection?.version.media?.sha256 ?? '';
  useEffect(() => {
    if (!selectedSha || runCardBackRequestedSha(new URLSearchParams(window.location.search))) return;
    select(selectedSha);
  }, [select, selectedSha]);

  const publish = async (): Promise<void> => {
    if (!reviewing || busy) return;
    setBusy(true);
    setStatus('Recording approval for the exact reviewed bytes…');
    try {
      const surfaceUrl = window.location.href;
      const approved = await reviewLiveMediaVersion({
        id: reviewing.version.id,
        expectedRevision: reviewing.version.rowRevision,
        notes: 'Universal face-down card reviewed against the published back at native 1060x1484.',
        surfaceUrl,
        evidence: runCardBackReviewProof({ ...reviewing, surfaceUrl }),
      });
      setStatus('Publishing the universal card-back slot…');
      await acceptLiveMediaVersions([runCardBackAcceptanceItem(approved, reviewing.slot)]);
      setStatus('Published. Every face-down card in the Run now serves these bytes.');
      await refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Publish failed: ${reason.message}` : 'Publish failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="run-card-prototype-workspace" aria-label="Universal card-back review">
      {header}
      <header className="run-card-back-study-heading">
        <span>Universal card back · exact live-media review</span>
        <h2>The card every face-down Run card shows</h2>
        <p>
          Judge the silhouette as much as the art. The back is the same physical card as a face, so
          anything it paints outside the card box shows as an edge wherever it sits beneath one or
          flips into one &mdash; the checkerboard behind each card is where its real edge is. Zoom
          scales both together.
        </p>
      </header>
      {/* Above the cards, not below them: this is what swaps the right-hand
          specimen, and a reviewer should not have to scroll past the thing it
          changes to discover it exists. */}
      <div className="run-card-back-candidate-groups">
        {groups.map((group) => (
          <section key={group.key}>
            <header><strong>{group.label}</strong><span>{group.note}</span></header>
            {/* One wrapping row, not a column. The offered-back family (ADR-0524)
                makes this list long enough that a stack pushes the cards it
                switches off the bottom of the screen. */}
            <div className="run-card-back-candidate-list">
              {group.versions.map((version) => {
                const sha256 = version.media?.sha256 ?? '';
                const shown = sha256 === selectedSha;
                return (
                  <ChromeButton
                    key={version.id}
                    unit="inner-text-button"
                    aria-pressed={shown}
                    disabled={busy}
                    onClick={() => select(sha256)}
                  >
                    {shown ? '● ' : '○ '}{version.label.replace(/\s*—\s*Codex\b.*$/, '')} · {sha256.slice(0, 8)}
                  </ChromeButton>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div
        className="run-card-back-study"
        style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
      >
        <RunCardBackSpecimen caption="Published · serving now" selection={published} />
        {selection && selection.version.id !== published?.version.id ? (
          <RunCardBackSpecimen
            caption={reviewing ? 'Candidate · awaiting your approval' : 'Selected'}
            selection={selection}
          />
        ) : (
          <p className="run-card-rarity-study-footnote">
            No candidate is waiting; the published back is the only card for this slot.
          </p>
        )}
      </div>
      {reviewing ? (
        <ChromeButton unit="inner-text-button" disabled={busy} onClick={() => { void publish(); }}>
          {busy ? 'Publishing…' : 'Approve and publish this card back'}
        </ChromeButton>
      ) : null}
      <p className="run-card-rarity-study-footnote" role="status">
        {status || 'This surface reads candidate or accepted bytes from live storage; no review PNG is packaged with the application.'}
      </p>
    </section>
  );
}

/** The Studio's live formation-card review surface. */
export function RunCardPrototypeViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const studioSearch = new URLSearchParams(window.location.search);
  if (studioSearch.get('cardSide') === 'back') {
    return <RunCardBackStudy header={header} viewerZoom={viewerZoom} />;
  }
  if (studioSearch.get('rarityStudy') === '1') {
    return <RunCardRarityStudy header={header} viewerZoom={viewerZoom} />;
  }
  return (
    <section className="run-card-prototype-workspace" aria-label="Formation card gallery">
      {header}
      <div
        className="run-card-prototype-study-grid"
        style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
      >
        {RUN_CARD_CATALOG.map((card) => (
          <article className="run-card-prototype-study" key={card.id}>
            <RunCard card={card} mode="reference" />
            <small>{runCardName(card)} · {card.pieces.length} unit{card.pieces.length === 1 ? '' : 's'}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RunCardPrototypeCatalog({
  onOpen,
  onOpenCardBack,
}: {
  onOpen: () => void;
  onOpenCardBack: () => void;
}): ReactElement {
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Card layout prototypes">
      <StudioCatalogCard
        title="Formation Cards"
        badge={`${RUN_CARD_CATALOG.length} authored layouts`}
        selected
        onSelect={onOpen}
        titleText="Open the formation card gallery"
        imageClassName="pages-card-image run-card-prototype-catalog-image"
        media={<span>1–3</span>}
      />
      <StudioCatalogCard
        title="Card Back"
        badge="Universal · review"
        onSelect={onOpenCardBack}
        titleText="Review the universal face-down card"
        imageClassName="pages-card-image run-card-prototype-catalog-image"
        media={<span>Back</span>}
      />
    </div>
  );
}
