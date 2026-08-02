import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import type { RunCoreCard } from '../run/model';
import { RunCard } from './RunCard';
import {
  runShopWrapBandMount,
  runShopWrapCandidates,
  runShopWrapRuntimeCandidate,
  runShopWrapScreenMount,
  runShopWrapSeatPadding,
  runShopWrapSeatTrack,
  runShopWrapSlotMount,
  type RunShopWrapCandidate,
} from './runShopWrapCandidates';
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const REVIEW_CARDS: readonly RunCoreCard[] = [
  { id: 'review-two-pawns-bishop', pieces: ['pawn', 'pawn', 'bishop'], value: 5 },
  { id: 'review-pawn-rook', pieces: ['pawn', 'rook'], value: 6 },
  { id: 'review-four-pawns-bishop', pieces: ['pawn', 'pawn', 'pawn', 'pawn', 'bishop'], value: 7 },
];

function WrapCandidateRow({ candidate }: { candidate: RunShopWrapCandidate }): ReactElement {
  return (
    <section className="run-wrap-candidate" aria-label={candidate.label}>
      <h3>
        {candidate.label}
        <small>
          {' — '}{candidate.engine}{' · '}
          {candidate.kind === 'seat' ? 'wraps each card'
            : candidate.kind === 'slots' ? 'one stall, a slot per card'
            : 'wraps the card row'}
        </small>
      </h3>
      {candidate.kind === 'screen' ? (
        (() => {
          // Judge a full-screen scene at real screen proportions, cover-cropped
          // exactly as the Shop would crop it.
          // 16:10, sized to fit the review panel so the whole screen is visible.
          const SCREEN = { w: 992, h: 620 };
          const mount = runShopWrapScreenMount(candidate, 3, SCREEN.w, SCREEN.h);
          return (
            <div
              className="run-wrap-screen-stage"
              style={{ inlineSize: `${SCREEN.w}px`, blockSize: `${SCREEN.h}px` }}
            >
              <img
                className="run-wrap-art"
                src={candidate.src}
                alt=""
                draggable={false}
                style={{
                  insetInlineStart: `${mount.frame.left}px`,
                  insetBlockStart: `${mount.frame.top}px`,
                  inlineSize: `${mount.frame.width}px`,
                  blockSize: `${mount.frame.height}px`,
                }}
              />
              <div
                className="run-wrap-screen-cards"
                style={{
                  insetInlineStart: `${mount.cards.left}px`,
                  insetBlockStart: `${mount.cards.top}px`,
                  inlineSize: `${mount.cards.width}px`,
                  gridTemplateColumns: `repeat(3, ${mount.cardWidth}px)`,
                  gap: `${mount.cards.gap}px`,
                }}
              >
                {REVIEW_CARDS.map((card) => (
                  <RunCard key={`${candidate.id}:${card.id}`} card={card} mode="shop" onSelect={() => undefined} />
                ))}
              </div>
            </div>
          );
        })()
      ) : candidate.kind === 'slots' ? (
        (() => {
          const mount = runShopWrapSlotMount(candidate);
          const slotCards = [...REVIEW_CARDS, ...REVIEW_CARDS].slice(0, mount.cards.length);
          return (
            <div
              className="run-wrap-slot-frame"
              style={{ inlineSize: `${mount.frame.width}px`, blockSize: `${mount.frame.height}px` }}
            >
              <img className="run-wrap-art run-wrap-seat-art" src={candidate.src} alt="" draggable={false} />
              {slotCards.map((card, index) => (
                <span
                  className="run-wrap-slot-card"
                  key={`${candidate.id}:${card.id}:${index}`}
                  style={{
                    insetInlineStart: `${mount.cards[index].left}px`,
                    insetBlockStart: `${mount.cards[index].top}px`,
                    inlineSize: `${mount.cards[index].width}px`,
                  }}
                >
                  <RunCard card={card} mode="shop" onSelect={() => undefined} />
                </span>
              ))}
            </div>
          );
        })()
      ) : candidate.kind === 'seat' ? (
        <div
          className="run-card-grid run-wrap-grid"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(0, ${runShopWrapSeatTrack(candidate)}))` }}
        >
          {REVIEW_CARDS.map((card) => (
            <span
              className="run-wrap-seat"
              key={`${candidate.id}:${card.id}`}
              style={runShopWrapSeatPadding(candidate) as CSSProperties}
            >
              <img className="run-wrap-art run-wrap-seat-art" src={candidate.src} alt="" draggable={false} />
              <RunCard card={card} mode="shop" onSelect={() => undefined} />
            </span>
          ))}
        </div>
      ) : (
        (() => {
          const mount = runShopWrapBandMount(candidate);
          const bandCards = [...REVIEW_CARDS, ...REVIEW_CARDS].slice(0, mount.cards);
          return (
            <div
              className="run-wrap-band-shell"
              style={{
                inlineSize: `${mount.shell.width}px`,
                blockSize: `${mount.shell.height}px`,
                margin: mount.shell.margin,
              }}
            >
              <img
                className="run-wrap-art"
                src={candidate.src}
                alt=""
                draggable={false}
                style={{
                  insetInlineStart: `${mount.art.left}px`,
                  insetBlockStart: `${mount.art.top}px`,
                  inlineSize: `${mount.art.width}px`,
                  blockSize: `${mount.art.height}px`,
                }}
              />
              <div
                className="run-card-grid"
                style={{ gridTemplateColumns: mount.grid.columns, gap: `${mount.grid.gap}px`, justifyContent: 'center' }}
              >
                {bandCards.map((card, index) => (
                  <RunCard key={`${candidate.id}:${card.id}:${index}`} card={card} mode="shop" onSelect={() => undefined} />
                ))}
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}

/**
 * The owner's install decision. Acceptance records his approval of these exact
 * bytes from this exact surface, so the control lives beside the mounted proof
 * rather than in a script.
 */
function WrapInstallControl({
  catalog,
  onInstalled,
}: {
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement | null {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useMemo(() => runShopWrapRuntimeCandidate(catalog), [catalog]);
  // Installing clears the pending candidate, so keep the outcome on screen
  // instead of letting the whole control vanish the moment it succeeds.
  if (!pending) {
    return status ? (
      <section className="run-wrap-install" aria-label="Install wrap in the live Shop">
        <h3>Install in the live Shop</h3>
        <p role="status">{status}</p>
      </section>
    ) : null;
  }
  const { version, candidate } = pending;
  const slot = catalog.slots.find((entry) => entry.slot === version.slot) ?? null;

  const install = async (): Promise<void> => {
    if (busy || !version.media || !version.slot) return;
    setBusy(true);
    setStatus('Recording approval for these exact wrap bytes…');
    try {
      const surfaceUrl = window.location.href;
      const reviewed = await reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: `Approved run shop wrap ${candidate.id} from the mounted card-row proof.`,
        surfaceUrl,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: version.id,
          contentSha256: version.media.sha256,
          slot: version.slot,
          canonicalScale: 1,
          surfaceKind: 'Run shop wrap mounted around live card faces',
        },
      });
      setStatus('Installing the approved wrap…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus(`${candidate.label} is installed. The live Shop now wraps its card row.`);
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="run-wrap-install" aria-label="Install wrap in the live Shop">
      <h3>Install in the live Shop</h3>
      <p>
        {candidate.label} is uploaded to <code>{version.slot}</code> and waiting on your approval.
        Installing records that decision and makes the live Shop wrap its card row with it.
      </p>
      <ChromeButton
        unit="inner-text-button"
        disabled={busy}
        data-testid="install-run-shop-wrap"
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : `Use ${candidate.label} in the Shop`}
      </ChromeButton>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

export function RunShopArtReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [reloadToken]);
  const wraps = useMemo(() => catalog ? runShopWrapCandidates(catalog) : [], [catalog]);
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-relic-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-shop-art-review" titled className="run-relic-review-panel">
        <OuterChromeHeader title="Run Card Review" />
        <p>Accepted frame and illustration pixels mounted in the shared live card face.</p>
        <div className="run-card-grid" aria-label="Trading-card examples">
          {REVIEW_CARDS.map((card) => (
            <RunCard
              key={card.id}
              card={card}
              mode="shop"
              onSelect={() => undefined}
            />
          ))}
        </div>
        {catalog ? (
          <WrapInstallControl catalog={catalog} onInstalled={() => setReloadToken((token) => token + 1)} />
        ) : null}
        {wraps.map((candidate) => (
          <WrapCandidateRow key={candidate.id} candidate={candidate} />
        ))}
      </OuterChromeBox>
    </main>
  );
}
