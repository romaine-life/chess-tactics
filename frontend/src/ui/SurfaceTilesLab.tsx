import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { drawableAsset, drawableAssets } from '@chess-tactics/board-render';
import { defaultTerrainFamily } from '../core/tileSockets';
import { tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard } from '../render/BoardLabBoard';
import { isUnauthorized } from '../net/auth';
import { loadLiveMediaCatalog } from '../net/liveMedia';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersions,
  type AdminLiveMediaCatalog,
} from '../net/liveMediaAdmin';
import { ViewPane } from './shared/ViewPane';
import {
  candidateVersionsForSlot,
  isReviewedForCurrentContent,
  isReviewedForCurrentSurfaceSnapshot,
  selectedSurfaceOverrides,
  surfaceAcceptanceGroups,
  surfaceAcceptanceItems,
  surfaceFamilySlots,
  surfaceReviewBatch,
  surfaceReviewProofEvidence,
  surfaceSlotPrefix,
} from './surfaceLiveMediaReview';

// Inspector for database-owned horizontal terrain surfaces. Subterrain is reviewed and
// installed through its own drawable domain; this surface never mounts vertical material.
// The embedded Studio viewer previews authenticated candidate bytes and records review and
// acceptance through the live-media backend.

export const SURFACE_TILE_FAMILIES: readonly string[] = new Proxy([] as string[], {
  get: (_target, property) => { const values = Object.keys(tileFamilies); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
type Family = keyof typeof tileFamilies;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const surfaceTileCap = cap;
const isFamily = (f: string): f is Family => (SURFACE_TILE_FAMILIES as readonly string[]).includes(f);

function Card({ asset, n }: { asset: TileAsset; n: number }): ReactElement | null {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  const source = drawableAsset(asset.id)?.media.source?.media.immutableUrl;
  if (!source) throw new Error(`terrain surface ${asset.id} has no source media`);
  return (
    <div className="stl-card">
      <div className="stl-card-head">{asset.label}</div>
      <div className="stl-stage stl-stage--tile">
        <img className="stl-px" src={asset.src} alt={asset.label}
          draggable={false} onError={() => setOk(false)} />
      </div>
      <div className="stl-stage stl-stage--flat">
        <img className="stl-px" src={source} alt={`${asset.label} source`} draggable={false} />
      </div>
      <div className="stl-card-foot">surface ↑ · tile ↑↑</div>
    </div>
  );
}

export function SurfaceTilesLab({ family, onFamily, header }: {
  family: string; onFamily: (f: string) => void; header?: ReactNode;
}): ReactElement {
  const requestedFamily = family || defaultTerrainFamily().id;
  if (!isFamily(requestedFamily)) throw new Error(`terrain surface family ${requestedFamily} is unavailable`);
  const fam: Family = requestedFamily;
  const [view, setView] = useState<'board' | 'tiles'>('board');
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [crisp, setCrisp] = useState(true);
  // Story features are PARKED (ADR-0041) — default OFF so the board shows the continuity mural.
  const [story, setStory] = useState(false);
  const [adminCatalog, setAdminCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [adminState, setAdminState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [selectedVersionBySlot, setSelectedVersionBySlot] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState('');
  const [mutation, setMutation] = useState<'reviewing' | 'accepting' | null>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    key: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error?: string;
  }>({ key: '', status: 'idle' });

  const refreshAdminCatalog = useCallback(async (): Promise<AdminLiveMediaCatalog | null> => {
    setAdminState((state) => (state === 'ready' ? state : 'loading'));
    try {
      const catalog = await fetchAdminLiveMediaCatalog();
      setAdminCatalog(catalog);
      setAdminState('ready');
      setAdminError(null);
      return catalog;
    } catch (error) {
      if (isUnauthorized(error)) {
        setAdminCatalog(null);
        setAdminState('unauthorized');
        setAdminError(null);
      } else {
        setAdminState('error');
        setAdminError(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshAdminCatalog();
  }, [refreshAdminCatalog]);

  const familySlots = useMemo(
    () => adminCatalog ? surfaceFamilySlots(adminCatalog, fam) : [],
    [adminCatalog, fam],
  );
  const acceptanceGroups = useMemo(
    () => adminCatalog ? surfaceAcceptanceGroups(adminCatalog, fam) : [],
    [adminCatalog, fam],
  );
  const groupRequiredSlots = useMemo(
    () => new Set(acceptanceGroups.flatMap((group) => group.requiredSlots)),
    [acceptanceGroups],
  );

  // A grouped acceptance surface is useful only if every member is visible.
  // Pick the newest candidate for each required slot, while preserving an
  // explicit owner selection (including a just-accepted version after CAS).
  useEffect(() => {
    if (!adminCatalog || acceptanceGroups.length === 0) return;
    const versions = new Map(adminCatalog.versions.map((version) => [version.id, version]));
    const slots = new Map(adminCatalog.slots.map((slot) => [slot.slot, slot]));
    setSelectedVersionBySlot((current) => {
      const next = { ...current };
      let changed = false;
      for (const slot of groupRequiredSlots) {
        const selected = versions.get(next[slot]);
        if (selected?.slot === slot && selected.media && (selected.status === 'candidate' || selected.status === 'accepted')) continue;
        const candidate = candidateVersionsForSlot(adminCatalog, slot)[0];
        const active = versions.get(slots.get(slot)?.activeVersionId ?? '');
        const nextId = candidate?.id ?? (active?.slot === slot && active.media ? active.id : '');
        if (next[slot] !== nextId) {
          if (nextId) next[slot] = nextId;
          else delete next[slot];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [acceptanceGroups, adminCatalog, groupRequiredSlots]);

  const familySelection = useMemo(() => Object.fromEntries(
    Object.entries(selectedVersionBySlot).filter(([slot]) => slot.startsWith(surfaceSlotPrefix(fam))),
  ), [fam, selectedVersionBySlot]);
  const selectedOverrides = useMemo(
    () => selectedSurfaceOverrides(adminCatalog, familySelection),
    [adminCatalog, familySelection],
  );
  const reviewBatch = useMemo(
    () => adminCatalog ? surfaceReviewBatch(adminCatalog, familySelection) : { versions: [], groups: [], missingSlots: [] },
    [adminCatalog, familySelection],
  );
  const candidateRows = useMemo(() => {
    if (!adminCatalog) return [];
    const versionById = new Map(adminCatalog.versions.map((version) => [version.id, version]));
    return familySlots.filter((slot) => (
      groupRequiredSlots.has(slot.slot)
      || candidateVersionsForSlot(adminCatalog, slot.slot).length > 0
      || Boolean(versionById.get(familySelection[slot.slot]))
    ));
  }, [adminCatalog, familySelection, familySlots, groupRequiredSlots]);
  const slotById = useMemo(
    () => new Map((adminCatalog?.slots ?? []).map((slot) => [slot.slot, slot])),
    [adminCatalog],
  );
  const reviewedCount = reviewBatch.versions.filter((version) => (
    isReviewedForCurrentSurfaceSnapshot(version, version.slot ? slotById.get(version.slot) : undefined)
  )).length;
  const batchComplete = reviewBatch.versions.length > 0 && reviewBatch.missingSlots.length === 0;
  const batchReviewed = batchComplete && reviewedCount === reviewBatch.versions.length;
  const busy = mutation !== null;

  const COLS = 11;
  const ROWS = 9;
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: COLS * ROWS }, () => fam),
      seed,
      columns: COLS,
      rows: ROWS,
      familyAssets: tileFamilies,
    }),
    [fam, seed, story],
  );
  const mountedStableSlots = useMemo(() => {
    const occupied = new Set(board.cells.filter((cell) => cell.asset).map((cell) => `${cell.x}-${cell.y}`));
    const slots = new Set<string>();
    for (const cell of board.cells) {
      if (!cell.asset) continue;
      const source = drawableAssets('terrain-surface').find((asset) => asset.media.top?.media.immutableUrl === cell.asset?.src);
      if (source?.media.top?.slot) slots.add(source.media.top.slot);
    }
    return slots;
  }, [board]);
  const unmountedSelectedSlots = reviewBatch.versions
    .map((version) => version.slot)
    .filter((slot): slot is string => typeof slot === 'string' && !mountedStableSlots.has(slot));
  const previewKey = reviewBatch.versions
    .map((version) => `${version.id}:${version.media?.sha256 ?? ''}:${version.media?.url ?? ''}`)
    .join('|');

  // The canvas renderer intentionally fails soft while loading an image. The
  // acceptance surface cannot: decode every authenticated candidate URL and
  // wait two frames so the real terrain canvas has painted those same bytes.
  useEffect(() => {
    if (!previewKey || reviewBatch.versions.length === 0) {
      setPreviewState({ key: '', status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setPreviewState({ key: previewKey, status: 'loading' });
    const decode = (version: typeof reviewBatch.versions[number]): Promise<void> => new Promise((resolve, reject) => {
      if (!version.media?.url || !version.media.mediaType.startsWith('image/')) {
        reject(new Error(`${version.slot ?? version.id} is not a previewable image.`));
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve()
        : reject(new Error(`${version.slot ?? version.id} decoded without dimensions.`));
      image.onerror = () => reject(new Error(`${version.slot ?? version.id} could not load its authenticated media URL.`));
      image.src = version.media.url;
    });
    void Promise.all(reviewBatch.versions.map(decode)).then(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      if (!cancelled) setPreviewState({ key: previewKey, status: 'ready' });
    }).catch((error: unknown) => {
      if (!cancelled) setPreviewState({
        key: previewKey,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [previewKey, reviewBatch.versions]);

  const candidateBytesReady = previewState.key === previewKey && previewState.status === 'ready';
  const proofScaleLocked = reviewBatch.versions.length > 0;
  const proofMounted = view === 'board' && proofScaleLocked && unmountedSelectedSlots.length === 0 && candidateBytesReady;

  const selectCandidate = (slot: string, id: string): void => {
    setSelectedVersionBySlot((current) => {
      if (!id) {
        const next = { ...current };
        delete next[slot];
        return next;
      }
      return { ...current, [slot]: id };
    });
    setMutationNotice(null);
  };

  const handleReview = async (): Promise<void> => {
    if (!adminCatalog || !proofMounted || !batchComplete || !reviewNotes.trim()) return;
    setMutation('reviewing');
    setMutationNotice(null);
    const surfaceUrl = window.location.href;
    const stale = new Set(reviewBatch.versions.filter((version) => (
      !isReviewedForCurrentSurfaceSnapshot(version, version.slot ? slotById.get(version.slot) : undefined)
    )).map((version) => version.id));
    const assigned = new Set<string>();
    const reviewBatches = reviewBatch.groups.flatMap((group) => {
      const versions = reviewBatch.versions.filter((version) => version.slot && group.requiredSlots.includes(version.slot));
      if (!versions.some((version) => stale.has(version.id))) return [];
      versions.forEach((version) => assigned.add(version.id));
      return [{ versions, groups: [group] }];
    });
    for (const version of reviewBatch.versions) {
      if (stale.has(version.id) && !assigned.has(version.id)) reviewBatches.push({ versions: [version], groups: [] });
    }
    try {
      let reviewedCount = 0;
      for (const batch of reviewBatches) {
        const slots = batch.versions.flatMap((version) => {
          const slot = version.slot ? slotById.get(version.slot) : undefined;
          return slot ? [slot] : [];
        });
        await reviewLiveMediaVersions({
          versions: batch.versions,
          notes: reviewNotes.trim(),
          surfaceUrl,
          evidence: surfaceReviewProofEvidence({
            family: fam,
            surfaceUrl,
            versions: batch.versions,
            slots,
            groups: batch.groups,
          }),
        });
        reviewedCount += batch.versions.length;
      }
      const refreshed = await refreshAdminCatalog();
      const success = reviewedCount
        ? `Recorded hash-pinned owner review for ${reviewedCount} candidate${reviewedCount === 1 ? '' : 's'}.`
        : 'Every selected candidate already has review evidence for its current hash.';
      setMutationNotice(refreshed ? success : `${success} Admin catalog refresh failed; refresh before acceptance.`);
    } catch (error) {
      setMutationNotice(`Review failed: ${error instanceof Error ? error.message : String(error)}`);
      await refreshAdminCatalog();
    } finally {
      setMutation(null);
    }
  };

  const handleAccept = async (): Promise<void> => {
    if (!adminCatalog || !proofMounted || !batchReviewed) return;
    setMutation('accepting');
    setMutationNotice(null);
    try {
      const result = await acceptLiveMediaVersions(surfaceAcceptanceItems(adminCatalog, reviewBatch.versions));
      let publicCatalogFresh = true;
      try {
        await loadLiveMediaCatalog();
      } catch {
        publicCatalogFresh = false;
      }
      const refreshed = await refreshAdminCatalog();
      const warnings = [
        refreshed ? '' : 'admin catalog refresh failed',
        publicCatalogFresh ? '' : 'public catalog refresh failed',
      ].filter(Boolean);
      setMutationNotice(
        `Accepted atomic batch ${result.batchId.slice(0, 8)} at catalog revision ${result.catalogRevision}.${warnings.length ? ` ${warnings.join('; ')}.` : ''}`,
      );
    } catch (error) {
      setMutationNotice(`Acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
      await refreshAdminCatalog();
    } finally {
      setMutation(null);
    }
  };

  const effectiveZoom = proofScaleLocked ? 1 : zoom;
  const effectivePan = pan;

  return (
    <>
      <style>{STL_CSS}</style>
      <section className={`al-lab-main ${view === 'board' ? 'stl-board-main' : ''}`.trim()} aria-label="Surface tileset preview">
        {view === 'board' ? (
          <ViewPane kind="board" ariaLabel="Surface tileset viewport" zoom={effectiveZoom} pan={effectivePan} minZoom={0.5} maxZoom={3}
            onZoomChange={proofScaleLocked ? () => {} : setZoom} onPanChange={setPan}>
            <BoardLabBoard
              board={board}
              assetFrameSrc={(a) => a.src}
              terrainSrcOverride={(stableSrc) => selectedOverrides.get(stableSrc)}
              boardZoom={effectiveZoom}
              boardPan={effectivePan}
              className={`stl-board-surface ${crisp ? 'is-crisp' : ''}`}
              ariaLabel="Surface tileset board preview"
            />
          </ViewPane>
        ) : (
          <div className="stl-grid" key={fam}>
            {tileFamilies[fam].map((asset, n) => <Card key={asset.id} asset={asset} n={n} />)}
          </div>
        )}
      </section>

      <aside className="tileset-view-controls" aria-label="Surface tileset controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which terrain family's tiles you're inspecting.">
              <span>Family</span>
              <select value={fam} onChange={(e) => onFamily(e.target.value)} aria-label="Family">
                {SURFACE_TILE_FAMILIES.map((f) => <option key={f} value={f}>{cap(f)}</option>)}
              </select>
            </label>
            <div className="stl-seg" role="group" aria-label="View">
              <button type="button" className={`stl-toggle ${view === 'board' ? 'is-on' : ''}`} onClick={() => setView('board')}>Board</button>
              <button type="button" className={`stl-toggle ${view === 'tiles' ? 'is-on' : ''}`} onClick={() => setView('tiles')}>Tiles</button>
            </div>
            {view === 'board' ? (
              <>
                <label className="tileset-catalog-zoom">
                  <span>Zoom{proofScaleLocked ? ' · canonical 1×' : ''}</span>
                  <input type="range" min={0.5} max={3} step={0.05} value={effectiveZoom} disabled={proofScaleLocked} onChange={(e) => setZoom(Number(e.target.value))} />
                </label>
                <div className="stl-toggles">
                  <button type="button" className="stl-toggle" onClick={() => setSeed((s) => (s % 9999) + 1)} title="Re-roll the board tiles">↻ Re-roll</button>
                  <button type="button" className={`stl-toggle ${crisp ? 'is-on' : ''}`} onClick={() => setCrisp((v) => !v)} title="Nearest-neighbour (pixelated) vs smooth">Crisp</button>
                  <button type="button" className={`stl-toggle ${story ? 'is-on' : ''}`} onClick={() => setStory((v) => !v)} title="Parked story edge-features (ADR-0041)">Story</button>
                </div>
              </>
            ) : (
              <p className="stl-note">Each card pairs a baked production tile with the flat top-down surface it was projected from.</p>
            )}
          </div>
        </section>

        <section className="tileset-inspector-section stl-live-review" aria-label="Live terrain candidate review">
          <div className="stl-live-review-head">
            <h2>Live candidates</h2>
            <button type="button" className="stl-refresh" disabled={busy || adminState === 'loading'} onClick={() => void refreshAdminCatalog()}>Refresh</button>
          </div>
          {adminState === 'loading' ? <p className="stl-note">Loading backend lifecycle…</p> : null}
          {adminState === 'unauthorized' ? <p className="stl-note">The board remains public. Sign in as an admin to inspect, review, or accept private candidates.</p> : null}
          {adminState === 'error' ? <p className="stl-live-error">Admin catalog unavailable: {adminError}</p> : null}
          {adminState === 'ready' && adminCatalog ? (
            <div className="stl-live-stack">
              <p className="stl-live-revision">
                Catalog r{adminCatalog.revision} · {adminCatalog.updatedAt ? new Date(adminCatalog.updatedAt).toLocaleString() : 'not activated'}
              </p>
              {acceptanceGroups.map((group) => (
                <p className="stl-live-group" key={group.groupId}>
                  Atomic group <strong>{group.groupId}</strong> · {group.requiredSlots.length} required slots
                </p>
              ))}
              {candidateRows.length === 0 ? (
                <p className="stl-note">No private {cap(fam)} surface candidates are waiting in the backend.</p>
              ) : candidateRows.map((slot) => {
                const candidates = candidateVersionsForSlot(adminCatalog, slot.slot);
                const selectedId = familySelection[slot.slot] ?? '';
                const selected = adminCatalog.versions.find((version) => version.id === selectedId && version.slot === slot.slot);
                const options = selected && !candidates.some((version) => version.id === selected.id)
                  ? [selected, ...candidates]
                  : candidates;
                return (
                  <label className={`stl-candidate-row ${groupRequiredSlots.has(slot.slot) ? 'is-required' : ''}`} key={slot.slot}>
                    <span className="stl-candidate-slot">{slot.slot.slice('tiles/surface/'.length)}</span>
                    <span className="stl-slot-life">
                      {slot.lifecycleState} · slot r{slot.rowRevision} · {slot.versionStatus ?? 'no active'}
                    </span>
                    <select value={selectedId} disabled={busy} onChange={(event) => selectCandidate(slot.slot, event.target.value)} aria-label={`Candidate for ${slot.slot}`}>
                      <option value="">Select candidate…</option>
                      {options.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.status} · {version.label} · {version.media?.sha256.slice(0, 8)} · r{version.rowRevision}
                        </option>
                      ))}
                    </select>
                    {selected ? (
                      <span className={`stl-candidate-state ${isReviewedForCurrentSurfaceSnapshot(selected, slot) ? 'is-reviewed' : ''}`}>
                        {selected.status} · {selected.media?.sha256.slice(0, 12)} · version r{selected.rowRevision}
                        {isReviewedForCurrentSurfaceSnapshot(selected, slot)
                          ? ' · reviewed for current hash + slot'
                          : isReviewedForCurrentContent(selected) ? ' · review stale after slot change' : ''}
                      </span>
                    ) : groupRequiredSlots.has(slot.slot) ? <span className="stl-candidate-missing">Required candidate missing</span> : null}
                  </label>
                );
              })}

              {reviewBatch.missingSlots.length ? (
                <p className="stl-candidate-missing">Atomic group incomplete: {reviewBatch.missingSlots.map((slot) => slot.split('/').at(-1)).join(', ')}</p>
              ) : null}
              {unmountedSelectedSlots.length ? (
                <p className="stl-candidate-missing">Not mounted by this board proof: {unmountedSelectedSlots.map((slot) => slot.split('/').at(-1)).join(', ')}</p>
              ) : null}
              {previewState.key === previewKey && previewState.status === 'loading' ? (
                <p className="stl-note">Decoding authenticated candidate bytes in the board renderer…</p>
              ) : null}
              {previewState.key === previewKey && previewState.status === 'error' ? (
                <p className="stl-live-error">Candidate preview failed: {previewState.error}</p>
              ) : null}
              <label className="stl-review-notes">
                <span>Owner review notes</span>
                <textarea value={reviewNotes} disabled={busy} rows={3} maxLength={4000}
                  placeholder="What was inspected on the canonical board proof?" onChange={(event) => setReviewNotes(event.target.value)} />
              </label>
              <p className="stl-live-summary">
                {reviewBatch.versions.length} selected · {reviewedCount} hash + slot-current reviews · candidate bytes {candidateBytesReady ? 'decoded' : 'pending'} · canonical proof {proofMounted ? 'mounted' : 'required'}
              </p>
              <div className="stl-live-actions">
                <button type="button" className="stl-toggle" disabled={busy || !proofMounted || !batchComplete || !reviewNotes.trim()} onClick={() => void handleReview()}>
                  {mutation === 'reviewing' ? 'Recording…' : `Record review${reviewBatch.versions.length ? ` (${reviewBatch.versions.length})` : ''}`}
                </button>
                <button type="button" className="stl-toggle stl-accept" disabled={busy || !proofMounted || !batchReviewed} onClick={() => void handleAccept()}>
                  {mutation === 'accepting' ? 'Accepting…' : `Accept atomically${reviewBatch.versions.length ? ` (${reviewBatch.versions.length})` : ''}`}
                </button>
              </div>
              {mutationNotice ? <p className={/^(Review|Acceptance) failed:/.test(mutationNotice) ? 'stl-live-error' : 'stl-live-success'}>{mutationNotice}</p> : null}
            </div>
          ) : null}
        </section>
      </aside>
    </>
  );
}

const STL_CSS = `
/* Board view fills the pane and uses the shared ViewPane (pan/zoom/fit) — same as the skirmish
   board, so it pans and never clips. */
.stl-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.stl-board-surface.is-crisp .tileset-generated-board-tile img { image-rendering: pixelated; }
.stl-grid { align-self: stretch; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; align-content: start; }
.stl-card { display: flex; flex-direction: column; gap: 8px; background: #0c1322; border: 1px solid #1b2740; border-radius: 8px; padding: 10px; }
.stl-card-head { text-align: center; font-size: 13px; font-weight: 600; color: #9fd8ff; letter-spacing: .03em; }
.stl-card-foot { text-align: center; font-size: 10px; color: #5f769b; }
.stl-stage { display: flex; align-items: center; justify-content: center; border-radius: 6px;
  background-color: #14181f;
  background-image: linear-gradient(45deg, #1b212b 25%, transparent 25%), linear-gradient(-45deg, #1b212b 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1b212b 75%), linear-gradient(-45deg, transparent 75%, #1b212b 75%);
  background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
.stl-stage--tile { padding: 6px; height: 190px; }
.stl-stage--tile .stl-px { height: 100%; }
.stl-stage--flat { padding: 6px; height: 92px; }
.stl-stage--flat .stl-px { height: 100%; }
.stl-px { width: auto; object-fit: contain; display: block; image-rendering: pixelated; }
.stl-seg { display: flex; gap: 6px; }
.stl-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
.stl-toggle { box-sizing: border-box; height: 30px; padding: 0 12px; font: inherit; font-size: 13px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.stl-toggle:hover { background: #17223a; }
.stl-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.stl-toggle:disabled { cursor: default; opacity: .48; }
.stl-note { margin: 0; font-size: 12px; color: #8197ad; line-height: 1.45; }
.stl-proof-note { color: #9fc7e8; }
.stl-proof-index { display: grid; place-items: center; width: 18px; height: 18px; transform: translate(-9px, 51px);
  border: 1px solid rgba(115, 209, 255, .8); border-radius: 50%; background: rgba(3, 15, 24, .86);
  color: #dff6ff; font: 800 10px/1 var(--ds-font-sans, system-ui, sans-serif); }
.stl-live-review { border-top: 1px solid rgba(67, 127, 179, .3); }
.stl-live-review-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stl-live-review-head h2 { margin: 0; }
.stl-refresh { min-height: 26px; padding: 4px 8px; border: 1px solid #2a3c5e; border-radius: 4px;
  background: #111a2c; color: #cfe3ff; cursor: pointer; font: inherit; font-size: 11px; }
.stl-refresh:disabled { cursor: default; opacity: .48; }
.stl-live-stack { display: grid; gap: 9px; }
.stl-live-revision, .stl-live-summary { margin: 0; color: #8ba8c2; font-size: 10px; line-height: 1.4; }
.stl-live-group { margin: 0; padding: 7px; border: 1px solid rgba(68, 155, 202, .38); border-radius: 4px;
  background: rgba(20, 57, 78, .35); color: #acd8ef; font-size: 10px; line-height: 1.35; overflow-wrap: anywhere; }
.stl-candidate-row { display: grid; gap: 3px; padding: 7px; border: 1px solid rgba(60, 82, 112, .54); border-radius: 4px;
  background: rgba(8, 17, 30, .72); }
.stl-candidate-row.is-required { border-left: 3px solid #4da4cf; }
.stl-candidate-slot { color: #d8eaff; font: 700 10px/1.25 var(--ds-font-mono, monospace); overflow-wrap: anywhere; }
.stl-slot-life, .stl-candidate-state { color: #7890aa; font-size: 9px; line-height: 1.35; overflow-wrap: anywhere; }
.stl-candidate-state.is-reviewed { color: #8ed6b2; }
.stl-candidate-row select { width: 100%; min-width: 0; height: 28px; border: 1px solid #2a3c5e; border-radius: 4px;
  background: #0d1728; color: #d8eaff; font: inherit; font-size: 10px; }
.stl-candidate-missing, .stl-live-error, .stl-live-success { margin: 0; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.stl-candidate-missing, .stl-live-error { color: #ffaaa3; }
.stl-live-success { color: #8ed6b2; }
.stl-review-notes { display: grid; gap: 4px; color: #9fb3ca; font-size: 10px; }
.stl-review-notes textarea { box-sizing: border-box; width: 100%; resize: vertical; min-height: 58px; padding: 7px;
  border: 1px solid #2a3c5e; border-radius: 4px; background: #0a1321; color: #e4eef9; font: 11px/1.35 var(--ds-font-sans, system-ui, sans-serif); }
.stl-live-actions { display: grid; grid-template-columns: 1fr; gap: 6px; }
.stl-live-actions .stl-toggle { width: 100%; height: auto; min-height: 30px; white-space: normal; line-height: 1.2; }
.stl-live-actions .stl-accept:not(:disabled) { border-color: #4a9f79; background: #163a2b; color: #dff9ec; }
`;
