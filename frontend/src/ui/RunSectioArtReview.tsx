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
  runSectioWrapBandMount,
  runSectioWrapCandidates,
  runSectioWrapRuntimeCandidate,
  runSectioWrapSeatPadding,
  runSectioWrapSeatTrack,
  runSectioWrapSlotMount,
  type RunSectioWrapCandidate,
} from './runSectioWrapCandidates';
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const REVIEW_CARDS: readonly RunCoreCard[] = [
  { id: 'review-two-pawns-bishop', pieces: ['pawn', 'pawn', 'bishop'], value: 5 },
  { id: 'review-pawn-rook', pieces: ['pawn', 'rook'], value: 6 },
  { id: 'review-four-pawns-bishop', pieces: ['pawn', 'pawn', 'pawn', 'pawn', 'bishop'], value: 7 },
];

function WrapCandidateRow({ candidate }: { candidate: RunSectioWrapCandidate }): ReactElement {
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
        // Shown exactly as the Sectio renders it: the scene is a cover-cropped
        // background and the card row lays out normally on top of it. The
        // review must not seat cards more precisely than the real screen does.
        <div className="run-wrap-screen-stage">
          <img className="run-wrap-screen-art" src={candidate.src} alt="" draggable={false} />
          <div className="run-wrap-screen-cards">
            {REVIEW_CARDS.map((card) => (
              <RunCard key={`${candidate.id}:${card.id}`} card={card} mode="sectio" onSelect={() => undefined} />
            ))}
          </div>
        </div>
      ) : candidate.kind === 'slots' ? (
        (() => {
          const mount = runSectioWrapSlotMount(candidate);
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
                  <RunCard card={card} mode="sectio" onSelect={() => undefined} />
                </span>
              ))}
            </div>
          );
        })()
      ) : candidate.kind === 'seat' ? (
        <div
          className="run-card-grid run-wrap-grid"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(0, ${runSectioWrapSeatTrack(candidate)}))` }}
        >
          {REVIEW_CARDS.map((card) => (
            <span
              className="run-wrap-seat"
              key={`${candidate.id}:${card.id}`}
              style={runSectioWrapSeatPadding(candidate) as CSSProperties}
            >
              <img className="run-wrap-art run-wrap-seat-art" src={candidate.src} alt="" draggable={false} />
              <RunCard card={card} mode="sectio" onSelect={() => undefined} />
            </span>
          ))}
        </div>
      ) : (
        (() => {
          const mount = runSectioWrapBandMount(candidate);
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
                  <RunCard key={`${candidate.id}:${card.id}:${index}`} card={card} mode="sectio" onSelect={() => undefined} />
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
  const pending = useMemo(() => runSectioWrapRuntimeCandidate(catalog), [catalog]);
  // Installing clears the pending candidate, so keep the outcome on screen
  // instead of letting the whole control vanish the moment it succeeds.
  if (!pending) {
    return status ? (
      <section className="run-wrap-install" aria-label="Install wrap in the live Sectio">
        <h3>Install in the live Sectio</h3>
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
        notes: `Approved Run Sectio wrap ${candidate.id} from the mounted card-row proof.`,
        surfaceUrl,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          versionId: version.id,
          contentSha256: version.media.sha256,
          slot: version.slot,
          canonicalScale: 1,
          surfaceKind: 'Run Sectio wrap mounted around live card faces',
        },
      });
      setStatus('Installing the approved wrap…');
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus(`${candidate.label} is installed. The live Sectio now wraps its card row.`);
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="run-wrap-install" aria-label="Install wrap in the live Sectio">
      <h3>Install in the live Sectio</h3>
      <p>
        {candidate.label} is uploaded to <code>{version.slot}</code> and waiting on your approval.
        Installing records that decision and makes the live Sectio wrap its card row with it.
      </p>
      <ChromeButton
        unit="inner-text-button"
        disabled={busy}
        data-testid="install-run-sectio-wrap"
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : `Use ${candidate.label} in the Sectio`}
      </ChromeButton>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

export function RunSectioArtReview(): ReactElement {
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
  const wraps = useMemo(() => catalog ? runSectioWrapCandidates(catalog) : [], [catalog]);
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-lipsanon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-sectio-art-review" titled className="run-lipsanon-review-panel">
        <OuterChromeHeader title="Run Card Review" />
        <p>Accepted frame and illustration pixels mounted in the shared live card face.</p>
        <div className="run-card-grid" aria-label="Trading-card examples">
          {REVIEW_CARDS.map((card) => (
            <RunCard
              key={card.id}
              card={card}
              mode="sectio"
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
