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

/** The Studio's live formation-card review surface. */
export function RunCardPrototypeViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  if (new URLSearchParams(window.location.search).get('rarityStudy') === '1') {
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

export function RunCardPrototypeCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
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
    </div>
  );
}
