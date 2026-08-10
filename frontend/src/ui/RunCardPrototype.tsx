import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import {
  DEFAULT_RUN_RULES,
  GOLD_SCALE,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  createRunCardOffer,
  runCardCost,
  type RunCardOffer,
} from '../run/model';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import { RunCard } from './RunCard';
import { RUN_CARD_APPROVED_TUNING, RunCardFace } from './RunCardFace';
import { runCardFaceContent } from './runCardFaceContent';
import {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  runCardCostFaceShare,
  runCardCostSizeCqw,
} from './runCardFrameGeometry';
import { SliderRow } from './dressing/SliderRow';
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
            <header>
              <strong>{group.label}</strong>
              <span>{group.note}</span>
              {/* The approval belongs beside the candidate it acts on, and stays
                  reachable there: below the cards it sat under the fold on any
                  window short enough to need the cards scaled down. */}
              {group.key === 'candidate' && reviewing ? (
                <ChromeButton unit="inner-text-button" disabled={busy} onClick={() => { void publish(); }}>
                  {busy ? 'Publishing…' : `Approve and publish ${reviewing.version.media?.sha256?.slice(0, 8)}`}
                </ChromeButton>
              ) : null}
            </header>
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
      <p className="run-card-rarity-study-footnote" role="status">
        {status || 'This surface reads candidate or accepted bytes from live storage; no review PNG is packaged with the application.'}
      </p>
    </section>
  );
}

/**
 * How far the cost numeral may be pushed from the Studio, in whole percent of the coin's face.
 *
 * The ceiling is the face itself: past 100 the reading is wider than the flat striking surface it
 * is struck on and starts climbing the rim, which is the thing the fit exists to prevent. The
 * floor is low enough to see the shrink actually bite.
 */
const COIN_FACE_FILL_LIMITS = Object.freeze({ min: 40, max: 100, step: 1, nudge: 1 });

/**
 * The readings the fill is judged against — the cheapest card the market deals, the dearest, and
 * one in between, priced the way the Run itself prices them.
 *
 * Real prices rather than round hypotheticals, because the fill is decided by what is actually
 * printed: no card costs a single digit (the cheapest is ten gold), and the dearest is a lone
 * Queen, whose three digits are the reading the coin is tightest on.
 */
function coinFillSpecimens(): readonly RunCardOffer[] {
  const priced = RUN_CARD_DECK
    .map((card) => ({ card, gold: runCardCost(card, DEFAULT_RUN_RULES) * GOLD_SCALE }))
    .sort((left, right) => left.gold - right.gold);
  const cheapest = priced[0];
  const dearest = priced[priced.length - 1];
  // The widest TWO-digit reading between them, which is the length the size cap binds first.
  const middle = [...priced].reverse().find((entry) => String(entry.gold).length === 2) ?? cheapest;
  return [cheapest, middle, dearest].map((entry, index) => (
    createRunCardOffer({ seed: 0 }, entry.card, 0, index, DEFAULT_RUN_RULES)
  ));
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
  const [faceFillPercent, setFaceFillPercent] = useState(
    () => Math.round(RUN_CARD_APPROVED_TUNING.costFaceFill * 100),
  );
  const [status, setStatus] = useState(
    'The cost numeral is sized to fit the coin. Reset returns the fill the cards ship at.',
  );
  const faceFill = faceFillPercent / 100;
  const tuning = { ...RUN_CARD_APPROVED_TUNING, costFaceFill: faceFill };
  const specimens = useMemo(() => coinFillSpecimens(), []);
  const shipped = Math.round(RUN_CARD_APPROVED_TUNING.costFaceFill * 100);
  const copyFill = async (): Promise<void> => {
    await navigator.clipboard.writeText(
      `export const RUN_CARD_COIN_FACE_FILL = ${String(faceFill)};`,
    );
    setStatus('Copied. Commit the number in runCardFrameGeometry.ts to make it what the Run deals.');
  };

  if (studioSearch.get('cardSide') === 'back') {
    return <RunCardBackStudy header={header} viewerZoom={viewerZoom} />;
  }
  if (studioSearch.get('rarityStudy') === '1') {
    return <RunCardRarityStudy header={header} viewerZoom={viewerZoom} />;
  }
  return (
    <>
      <section className="run-card-prototype-workspace" aria-label="Formation card gallery">
        <div
          className="run-card-prototype-study-grid run-card-prototype-readings"
          aria-label="The readings the coin fill is judged on"
          style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
        >
          {specimens.map((offer) => (
            <article className="run-card-prototype-study" key={offer.offerId}>
              <RunCard card={offer} mode="reference" tuning={tuning} />
              <small>
                {offer.cost * GOLD_SCALE} gold ·{' '}
                {runCardCostSizeCqw(offer.cost * GOLD_SCALE, tuning.costSize, faceFill).toFixed(2)}cqw ·
                {' inks '}{Math.round(runCardCostFaceShare(offer.cost * GOLD_SCALE, tuning.costSize, faceFill) * 100)}%
              </small>
            </article>
          ))}
        </div>
        <div
          className="run-card-prototype-study-grid"
          style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
        >
          {RUN_CARD_CATALOG.map((card) => (
            <article className="run-card-prototype-study" key={card.id}>
              <RunCard card={card} mode="reference" tuning={tuning} />
              <small>{runCardName(card)} · {card.pieces.length} unit{card.pieces.length === 1 ? '' : 's'}</small>
            </article>
          ))}
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Card face controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <div className="tileset-control-stack">
            <div data-testid="run-card-coin-fill-control">
              <SliderRow
                label={<>Cost numeral fills the coin <strong data-testid="run-card-coin-fill-value">{faceFillPercent}%</strong></>}
                value={faceFillPercent}
                set={(next) => {
                  setFaceFillPercent(next);
                  setStatus(next === shipped
                    ? 'Back at the shipped fill.'
                    : 'Fill changed. Copy it and commit the number to make it what the Run deals.');
                }}
                {...COIN_FACE_FILL_LIMITS}
                dflt={shipped}
              />
            </div>
            <p className="tileset-catalog-note">
              This is the knob a multi-digit price answers to. A one-digit reading is held by the
              approved size long before it reaches the coin, so it does not move until the fill is
              pushed well past where the longer readings are already touching the rim.
            </p>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-coin-fill-reset"
              disabled={faceFillPercent === shipped}
              onClick={() => {
                setFaceFillPercent(shipped);
                setStatus('Fill reset to what the Run ships.');
              }}
            >
              Reset fill
            </button>
            <button type="button" className="tileset-view-action" onClick={() => { void copyFill(); }}>
              Copy fill
            </button>
          </div>
          <dl data-testid="run-card-coin-fill-readout">
            {specimens.map((offer) => {
              const gold = offer.cost * GOLD_SCALE;
              const size = runCardCostSizeCqw(gold, tuning.costSize, faceFill);
              return (
                <div key={offer.offerId}>
                  <dt>{gold} gold</dt>
                  <dd>
                    {size.toFixed(2)}cqw · inks{' '}
                    {Math.round(runCardCostFaceShare(gold, tuning.costSize, faceFill) * 100)}%
                    {size === tuning.costSize ? ' · at the size cap' : ''}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
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
