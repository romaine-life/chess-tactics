import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { WALL_FRAME_GEOMETRY, type BoardDrawOp } from '@chess-tactics/board-render';
import { tileAssets, tileFamilies } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { ViewPane } from './shared/ViewPane';
import { BoardCanvasLayer, boundsForOps } from '../render/BoardCanvasLayer';
import { wallOverlayZIndex } from '../render/sceneDepth';
import { defaultWallMaterial } from '../core/featureAutotile';
import { defaultTerrainFamily } from '../core/tileSockets';
import { loadLiveMediaCatalog } from '../net/liveMedia';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  updateLiveMediaVersion,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import {
  isWallReviewCurrent,
  wallAcceptanceItems,
  wallNativeEvidence,
  wallReviewBatch,
  wallReviewProofEvidence,
  type WallReviewCandidate,
} from './wallMaterialReview';
import { useSceneParticipant } from './shell/SceneBoundary';

/** Seat the corner frame on the board apex, then one face pair per remaining material. */
function mountedFrames(candidates: readonly WallReviewCandidate[]): {
  ops: BoardDrawOp[];
  mountedSlots: string[];
} {
  const frameBySlot = new Map(candidates.filter((c) => !c.identity.thumb).map((c) => [c.slot, c]));
  const fallback = defaultWallMaterial();
  const materials = [...new Set(candidates.map((c) => c.identity.material))].sort((a, b) => {
    if (a === fallback) return -1;
    if (b === fallback) return 1;
    return a.localeCompare(b);
  });
  const ops: BoardDrawOp[] = [];
  const mountedSlots: string[] = [];
  const mount = (material: string, mask: number, x: number, y: number): void => {
    const candidate = frameBySlot.get(`tiles/feature/wall-${material}-${mask}.png`);
    const src = candidate?.version.media?.url;
    if (!candidate || !src) return;
    const seat = boardLabCellPosition({ x, y });
    ops.push({
      layer: 'scene',
      src,
      dx: seat.left - WALL_FRAME_GEOMETRY.anchorX,
      dy: seat.top - WALL_FRAME_GEOMETRY.anchorY,
      dw: WALL_FRAME_GEOMETRY.width,
      dh: WALL_FRAME_GEOMETRY.height,
      z: wallOverlayZIndex({ x, y }),
    });
    mountedSlots.push(candidate.slot);
  };
  const [corner, ...rest] = materials;
  if (corner) mount(corner, 9, 0, 0);
  rest.forEach((material, index) => {
    mount(material, 1, index + 1, 0);
    mount(material, 8, 0, index + 1);
  });
  return { ops, mountedSlots };
}

type Mutation = 'reviewing' | 'accepting' | null;

const PROOF_PAN = { x: 140, y: 220 } as const;

// Layout only — every painted surface stays on the registered Studio chrome classes.
const WCR_CSS = `
.wcr-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.wcr-thumbs { display: flex; flex-wrap: wrap; gap: 14px; }
.wcr-thumb { display: grid; justify-items: center; gap: 4px; }
.wcr-thumb img { image-rendering: pixelated; }
.wcr-slot-list { display: grid; gap: 2px; }
`;

/**
 * The game-owned wall instrument. Candidates are judged mounted on the real board renderer at
 * canonical 1x — never as loose sprites — and acceptance rides that same mounted proof.
 */
export function WallCandidateReview({ header }: { header?: ReactNode } = {}): ReactElement {
  const [adminCatalog, setAdminCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [framePainted, setFramePainted] = useState(false);
  const [frameError, setFrameError] = useState<Error | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [mutation, setMutation] = useState<Mutation>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const board = useMemo(() => solveSocketBoard({
    assets: tileAssets,
    terrainMap: Array.from({ length: 36 }, () => defaultTerrainFamily().id),
    seed: 14,
    columns: 6,
    rows: 6,
    familyAssets: tileFamilies,
  }), []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      setAdminCatalog(await fetchAdminLiveMediaCatalog());
      setError('');
      return true;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'candidate catalog failed');
      return false;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const batch = useMemo(() => wallReviewBatch(adminCatalog), [adminCatalog]);
  const { ops, mountedSlots } = useMemo(() => mountedFrames(batch.candidates), [batch.candidates]);
  const bounds = useMemo(
    () => boundsForOps(ops, {
      minX: -WALL_FRAME_GEOMETRY.anchorX,
      minY: -WALL_FRAME_GEOMETRY.anchorY,
      width: WALL_FRAME_GEOMETRY.width,
      height: WALL_FRAME_GEOMETRY.height,
    }),
    [ops],
  );

  const thumbs = batch.candidates.filter((candidate) => candidate.identity.thumb);
  const proofMounted = ops.length > 0 && framePainted;
  const reviewed = batch.candidates.filter(isWallReviewCurrent);
  const batchReviewed = batch.candidates.length > 0 && reviewed.length === batch.candidates.length;
  const routeError = useMemo(() => frameError ?? (error ? new Error(error) : null), [error, frameError]);
  useSceneParticipant(
    'studio',
    routeError ? 'error' : batch.candidates.length === 0 || proofMounted ? 'painted' : 'loading',
    routeError,
  );

  const handleReview = async (): Promise<void> => {
    if (!proofMounted || !batch.candidates.length || !reviewNotes.trim() || mutation) return;
    setMutation('reviewing');
    setNotice(null);
    const surfaceUrl = window.location.href;
    try {
      // Complete native-1x evidence from each candidate's own bytes first: patching bumps a
      // row revision, which would otherwise stale the proof taken against it.
      let repaired = 0;
      const pinned: WallReviewCandidate[] = [];
      for (const candidate of batch.candidates) {
        const native = wallNativeEvidence(candidate.version);
        if (!native) { pinned.push(candidate); continue; }
        const version = await updateLiveMediaVersion({
          id: candidate.version.id,
          expectedRevision: candidate.version.rowRevision,
          nativeEvidence: native,
        });
        pinned.push({ ...candidate, version });
        repaired += 1;
      }
      // Wall slots accept standalone, so each candidate records its own review against the one
      // batch proof. review-batch is reserved for slots that share a group acceptance contract
      // and refuses a multi-version batch without one.
      const evidence = wallReviewProofEvidence({ surfaceUrl, candidates: pinned, mountedSlots });
      for (const candidate of pinned) {
        await reviewLiveMediaVersion({
          id: candidate.version.id,
          expectedRevision: candidate.version.rowRevision,
          notes: reviewNotes.trim(),
          surfaceUrl,
          evidence,
        });
      }
      const fresh = await refresh();
      setNotice(
        `Recorded owner review for ${pinned.length} wall candidate${pinned.length === 1 ? '' : 's'}`
        + `${repaired ? ` (completed native evidence on ${repaired})` : ''}.`
        + `${fresh ? '' : ' Catalog refresh failed; refresh before acceptance.'}`,
      );
    } catch (reason) {
      setNotice(`Review failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      await refresh();
    } finally {
      setMutation(null);
    }
  };

  const handleAccept = async (): Promise<void> => {
    if (!proofMounted || !batchReviewed || batch.missingProvenance.length || mutation) return;
    setMutation('accepting');
    setNotice(null);
    try {
      const result = await acceptLiveMediaVersions(wallAcceptanceItems(batch.candidates));
      let publicCatalogFresh = true;
      try { await loadLiveMediaCatalog(); } catch { publicCatalogFresh = false; }
      const fresh = await refresh();
      const warnings = [
        fresh ? '' : 'admin catalog refresh failed',
        publicCatalogFresh ? '' : 'public catalog refresh failed',
      ].filter(Boolean);
      setNotice(
        `Accepted ${result.versions.length} wall slots as batch ${result.batchId.slice(0, 8)} `
        + `at catalog revision ${result.catalogRevision}.${warnings.length ? ` ${warnings.join('; ')}.` : ''}`,
      );
    } catch (reason) {
      setNotice(`Acceptance failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      await refresh();
    } finally {
      setMutation(null);
    }
  };

  const status = error ? error
    : !adminCatalog ? 'Loading candidate frames…'
    : batch.candidates.length === 0 ? 'No wall candidates are waiting. Every wall slot is serving its accepted art.'
    : `${batch.candidates.length} candidates · ${reviewed.length} reviewed · canonical 1× on the live board renderer`;

  return (
    <>
      <style>{WCR_CSS}</style>
      <section className="al-lab-main wcr-board-main" aria-label="Wall candidate preview">
        {/* Zoom is pinned: an owner proof is only valid at canonical 1x. */}
        <ViewPane
          kind="board"
          ariaLabel="Wall candidate viewport"
          zoom={1}
          pan={PROOF_PAN}
          minZoom={1}
          maxZoom={1}
          onZoomChange={() => {}}
          onPanChange={() => {}}
        >
          <BoardLabBoard
            board={board}
            assetFrameSrc={(asset) => asset.src}
            boardZoom={1}
            boardPan={PROOF_PAN}
            ariaLabel="Wall candidate board preview"
            showGrid
            sceneLayer={(
              <BoardCanvasLayer
                ops={ops}
                bounds={bounds}
                onFirstFrame={() => setFramePainted(true)}
                onFrameError={(reason) => setFrameError(
                  reason instanceof Error ? reason : new Error(String(reason)),
                )}
              />
            )}
          />
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Wall candidate controls">
        <section className="tileset-inspector-section">
          <h2>Wall candidates</h2>
          <div className="tileset-control-stack">
            {header}
            <p>{status}</p>
          </div>
        </section>

        {thumbs.length > 0 && (
          <section className="tileset-inspector-section" aria-label="Wall picker thumbnails">
            <h2>Picker thumbnails</h2>
            <div className="tileset-control-stack">
              <div className="wcr-thumbs">
                {thumbs.map((candidate) => (
                  <span className="wcr-thumb" key={candidate.slot}>
                    {/* Judged at native size: a scaled picker card proves nothing about its pixels. */}
                    <img
                      src={candidate.version.media?.url}
                      alt={`${candidate.identity.material} wall thumbnail candidate`}
                      width={candidate.version.media?.width ?? undefined}
                      height={candidate.version.media?.height ?? undefined}
                    />
                    <span>{candidate.identity.material}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="tileset-inspector-section" aria-label="Wall candidate decision">
          <h2>Review and accept</h2>
          <div className="tileset-control-stack">
            <div className="wcr-slot-list">
              {batch.candidates.map((candidate) => (
                <span key={candidate.slot}>
                  {candidate.slot.slice('tiles/feature/'.length)} · {candidate.version.media?.sha256.slice(0, 12)}
                  {isWallReviewCurrent(candidate) ? ' · reviewed' : ''}
                </span>
              ))}
            </div>
            <label className="tileset-category-select" title="What you judged on this board.">
              <span>Review notes</span>
              <input
                type="text"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="What you judged on this board"
              />
            </label>
            <div className="tileset-button-row">
              <button
                type="button"
                onClick={() => void handleReview()}
                disabled={!proofMounted || !batch.candidates.length || !reviewNotes.trim() || mutation !== null}
              >
                {mutation === 'reviewing' ? 'Recording review…' : 'Record owner review'}
              </button>
              <button
                type="button"
                onClick={() => void handleAccept()}
                disabled={!proofMounted || !batchReviewed || batch.missingProvenance.length > 0 || mutation !== null}
              >
                {mutation === 'accepting' ? 'Accepting…' : `Accept ${batch.candidates.length} slots`}
              </button>
            </div>
            <div className="tileset-button-row">
              <button type="button" disabled={mutation !== null} onClick={() => void refresh()}>Refresh</button>
            </div>
            {batch.missingProvenance.length > 0 && (
              <p>
                Cannot accept until an uploader records provenance:{' '}
                {batch.missingProvenance.map((candidate) => candidate.slot.slice('tiles/feature/'.length)).join(', ')}
              </p>
            )}
            {notice && <p>{notice}</p>}
          </div>
        </section>
      </aside>
    </>
  );
}
