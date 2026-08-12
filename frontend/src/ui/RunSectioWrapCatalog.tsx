import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
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

/**
 * Run Sectio card and wrap candidates, as a Studio CATEGORY.
 *
 * Each wrap is mounted around LIVE card faces, at the geometry the Sectio would give it, so the
 * thing on screen is the arrangement rather than a picture of the artwork. It was its own screen
 * at `/studio?runSectioReview=1` until ADR-0587, which is why it had no category rail and no way
 * in but a hand-passed URL.
 */
const REVIEW_CARDS: readonly RunCoreCard[] = [
  { id: 'review-three-pawns', artId: 'ppp', pieces: ['pawn', 'pawn', 'pawn'], value: 3, rarity: 'common' },
  { id: 'review-pawn-rook', artId: 'pr', pieces: ['pawn', 'rook'], value: 6, rarity: 'uncommon' },
  {
    id: 'review-opposite-bishops',
    artId: 'bb',
    pieces: ['bishop', 'bishop'],
    formation: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    value: 6,
    rarity: 'rare',
  },
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

export interface RunSectioWrapState {
  catalog: AdminLiveMediaCatalog | null;
  error: string;
  refresh: () => void;
}

export function useRunSectioWraps(): RunSectioWrapState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  return { catalog, error, refresh };
}

export function RunSectioWrapCatalog({ state }: { state: RunSectioWrapState }): ReactElement {
  const { catalog, error } = state;
  const wraps = useMemo(() => catalog ? runSectioWrapCandidates(catalog) : [], [catalog]);
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="run-sectio-wrap-catalog">
      <section aria-label="Trading-card examples">
        <h3>Live card face</h3>
        <p className="tileset-catalog-note">Accepted frame and illustration pixels mounted in the shared live card face.</p>
        <div className="run-card-grid">
          {REVIEW_CARDS.map((card) => (
            <RunCard key={card.id} card={card} mode="sectio" onSelect={() => undefined} />
          ))}
        </div>
      </section>
      {wraps.map((candidate) => (
        <WrapCandidateRow key={candidate.id} candidate={candidate} />
      ))}
      {!wraps.length ? <p>No wrap candidates are uploaded.</p> : null}
    </div>
  );
}

export function RunSectioWrapControls({ state }: { state: RunSectioWrapState }): ReactElement {
  const { catalog, refresh } = state;
  return (
    <>
      <p className="tileset-catalog-note">
        Each wrap is mounted around live card faces at the geometry the Sectio would give it, so
        what is on screen is the arrangement and not a picture of the artwork.
      </p>
      {catalog ? <WrapInstallControl catalog={catalog} onInstalled={refresh} /> : null}
    </>
  );
}
