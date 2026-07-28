import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies } from '../art/tileset';
import { defaultPropDef } from '../core/props';
import { requiredTerrainFamilyForRole } from '../core/tileSockets';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { isUnauthorized } from '../net/auth';
import { loadDrawableCatalog } from '../net/drawableCatalog';
import {
  fetchAdminDrawableCatalog,
  saveDrawableAsset,
  type AdminDrawableCatalog,
} from '../net/drawableCatalogAdmin';
import { loadLiveMediaCatalog } from '../net/liveMedia';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersions,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { BoardLabBoard } from '../render/BoardLabBoard';
import { BoardSceneLayer } from '../render/BoardSceneLayer';
import type { EditorBoard } from './boardCode';
import { currentDoodadAssets } from './doodadCatalog';
import { ViewPane } from './shared/ViewPane';
import { FacingCompass } from './studioBoard';
import {
  candidateVersionsForSlot,
  surfaceAcceptanceItems,
} from './surfaceLiveMediaReview';
import {
  SOURCE_ART_DIRECTIONS,
  isSourceArtBoardReviewed,
  readSourceArtApprovalIds,
  sourceArtApprovalListText,
  sourceArtDirectionForSlot,
  sourceArtDrawableInstallInput,
  sourceArtGroupAvailableInEditor,
  sourceArtGroupAccepted,
  sourceArtGroupInstalled,
  sourceArtOwnerGroupProof,
  sourceArtSelectedVersions,
  sourceArtTurntableGroups,
  writeSourceArtApprovalIds,
  type SourceArtBoardProofPlacement,
  type SourceArtTurntableDirection,
  type SourceArtTurntableGroup,
} from './sourceArtTurntableReview';

function useSourceArtAdminCatalog(): {
  catalog: AdminLiveMediaCatalog | null;
  drawables: AdminDrawableCatalog | null;
  state: 'loading' | 'ready' | 'unauthorized' | 'error';
  error: string | null;
  refresh: () => Promise<{ catalog: AdminLiveMediaCatalog; drawables: AdminDrawableCatalog } | null>;
} {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [drawables, setDrawables] = useState<AdminDrawableCatalog | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setState((current) => current === 'ready' ? current : 'loading');
    try {
      const [nextCatalog, nextDrawables] = await Promise.all([
        fetchAdminLiveMediaCatalog(),
        fetchAdminDrawableCatalog(),
      ]);
      setCatalog(nextCatalog);
      setDrawables(nextDrawables);
      setState('ready');
      setError(null);
      return { catalog: nextCatalog, drawables: nextDrawables };
    } catch (reason) {
      setCatalog(null);
      setDrawables(null);
      if (isUnauthorized(reason)) {
        setState('unauthorized');
        setError(null);
      } else {
        setState('error');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return null;
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { catalog, drawables, state, error, refresh };
}

function groupPreview(catalog: AdminLiveMediaCatalog, group: SourceArtTurntableGroup): AdminLiveMediaVersion | null {
  const south = `source-art/${group.assetId}/south.png`;
  const candidate = candidateVersionsForSlot(catalog, south)[0];
  if (candidate) return candidate;
  const slot = catalog.slots.find((entry) => entry.slot === south);
  return catalog.versions.find((version) => version.id === slot?.activeVersionId && version.media) ?? null;
}

export function SourceArtTurntableCatalog({
  search,
  zoom,
  selected,
  onSelect,
  onView,
}: {
  search: string;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
  onView: (id: string) => void;
}): ReactElement {
  const { catalog, drawables, state, error } = useSourceArtAdminCatalog();
  const query = search.trim().toLowerCase();
  const groups = useMemo(() => catalog ? sourceArtTurntableGroups(catalog).filter((group) => (
    !query || [group.label, group.assetId, group.structureKind ?? '', group.license].join(' ').toLowerCase().includes(query)
  )) : [], [catalog, query]);
  return (
    <section className="tileset-studio-main is-headless source-art-catalog" aria-label="Source art turntable catalog">
      <style>{SOURCE_ART_CSS}</style>
      <section className="tileset-studio-tab-panel">
        {state === 'loading' ? <p className="tileset-catalog-note">Loading private source-art batches…</p> : null}
        {state === 'unauthorized' ? <p className="tileset-catalog-note">Admin sign-in is required to inspect private source-art candidates.</p> : null}
        {state === 'error' ? <p className="tileset-catalog-note" role="alert">Source-art catalog unavailable: {error}</p> : null}
        {state === 'ready' && catalog ? (
          <div className="tileset-studio-grid" style={{ '--tile-zoom': zoom } as CSSProperties}>
            {groups.map((group) => {
              const preview = groupPreview(catalog, group);
              const candidateCount = group.requiredSlots.filter((slot) => candidateVersionsForSlot(catalog, slot).length > 0).length;
              const installed = sourceArtGroupInstalled(drawables, group);
              return (
                <button
                  type="button"
                  key={group.groupId}
                  className={`tileset-studio-card is-artwork ${selected === group.assetId ? 'is-selected' : ''}`}
                  onClick={() => onSelect(group.assetId)}
                  onDoubleClick={() => onView(group.assetId)}
                  aria-pressed={selected === group.assetId}
                  title={`Select ${group.label}`}
                >
                  <span className="tileset-studio-card-image source-art-card-image">
                    {preview?.media?.url ? <img src={preview.media.url} alt="" loading="lazy" draggable={false} /> : <span>No preview</span>}
                  </span>
                  <span className="tileset-studio-card-meta">
                    <span className="tileset-studio-card-text">
                      <strong>{group.label}</strong>
                      <em>{candidateCount}/8 candidates · {installed ? 'installed' : group.sourceOnly ? 'new landmark' : 'upgrade'}</em>
                    </span>
                    <span className="tileset-card-actions">
                      <span className={`asset-prov ${installed ? 'is-forged' : 'is-original'}`}>{installed ? '8-way live' : 'review'}</span>
                      <span className="tileset-card-action" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onView(group.assetId); }}>View</span>
                    </span>
                  </span>
                </button>
              );
            })}
            {!groups.length ? <p className="tileset-catalog-note">No source-art turntables match the current search.</p> : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function activeDisplayVersion(catalog: AdminLiveMediaCatalog, slotName: string): AdminLiveMediaVersion | null {
  const slot = catalog.slots.find((candidate) => candidate.slot === slotName);
  return catalog.versions.find((version) => version.id === slot?.activeVersionId && version.media) ?? null;
}

const SOURCE_ART_PROOF_COLUMNS = 8;
const SOURCE_ART_PROOF_ROWS = 7;
const SOURCE_ART_PROOF_INITIAL_PLACEMENT: SourceArtBoardProofPlacement = {
  pixelX: 24,
  pixelY: 156,
  scale: 1,
  direction: 'south',
};

function clampProofCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-512, Math.min(512, Math.round(value)));
}

function SourceArtBoardProof({
  group,
  placement,
  version,
  zoom,
  pan,
  onPlacement,
  onZoom,
  onPan,
  onMounted,
}: {
  group: SourceArtTurntableGroup;
  placement: SourceArtBoardProofPlacement;
  version: AdminLiveMediaVersion | undefined;
  zoom: number;
  pan: { x: number; y: number };
  onPlacement: (placement: SourceArtBoardProofPlacement) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  onMounted: (direction: SourceArtTurntableDirection) => void;
}): ReactElement {
  const ground = requiredTerrainFamilyForRole('unit-art-preview-default').id;
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets,
      terrainMap: Array.from({ length: SOURCE_ART_PROOF_COLUMNS * SOURCE_ART_PROOF_ROWS }, () => ground),
      seed: 4217,
      columns: SOURCE_ART_PROOF_COLUMNS,
      rows: SOURCE_ART_PROOF_ROWS,
      familyAssets: tileFamilies,
    }),
    [ground],
  );
  const sceneBoard = useMemo<EditorBoard>(() => {
    const cells = Object.fromEntries(board.cells.flatMap((cell) => (
      cell.asset ? [[`${cell.x},${cell.y}`, cell.asset.id]] : []
    )));
    const doodad = currentDoodadAssets()[0];
    const prop = defaultPropDef();
    const doodads: EditorBoard['doodads'] = {};
    if (doodad) doodads['6,4'] = { doodadId: doodad.id };
    return {
      cols: SOURCE_ART_PROOF_COLUMNS,
      rows: SOURCE_ART_PROOF_ROWS,
      cells,
      units: {},
      doodads,
      props: { '1,2': { propId: prop.id } },
      cover: {},
      features: {},
      fences: {},
      fencePosts: {},
      walls: {},
      wallArt: {},
      subterrain: {},
      featureCuts: {},
      featureExits: {},
      zones: {},
    };
  }, [board]);
  const [drag, setDrag] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const sourceScale = group.placementScale * placement.scale;
  const width = 512 * sourceScale;
  const height = 512 * sourceScale;

  return (
    <ViewPane
      kind="board"
      ariaLabel={`${group.label} interactive board placement proof`}
      zoom={zoom}
      pan={pan}
      minZoom={0.5}
      maxZoom={2}
      onZoomChange={onZoom}
      onPanChange={onPan}
    >
      <BoardLabBoard
        board={board}
        assetFrameSrc={(asset) => asset.src}
        boardZoom={zoom}
        boardPan={pan}
        className="source-art-board-surface"
        ariaLabel={`${group.label} candidate placement board`}
        sceneLayer={<BoardSceneLayer board={sceneBoard} omitTerrain />}
      >
        {version?.media?.url ? (
          <span
            className="source-art-board-candidate"
            data-source-art={group.assetId}
            data-direction={placement.direction}
            style={{
              left: placement.pixelX,
              top: placement.pixelY,
              width,
              height,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrag({
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                originX: placement.pixelX,
                originY: placement.pixelY,
              });
            }}
            onPointerMove={(event) => {
              if (!drag || event.pointerId !== drag.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              onPlacement({
                ...placement,
                pixelX: clampProofCoordinate(drag.originX + (event.clientX - drag.startClientX) / zoom),
                pixelY: clampProofCoordinate(drag.originY + (event.clientY - drag.startClientY) / zoom),
              });
            }}
            onPointerUp={(event) => {
              if (!drag || event.pointerId !== drag.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.releasePointerCapture(event.pointerId);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <img
              src={version.media.url}
              alt={`${group.label} facing ${placement.direction}`}
              draggable={false}
              onLoad={() => onMounted(placement.direction)}
            />
          </span>
        ) : null}
      </BoardLabBoard>
    </ViewPane>
  );
}

export function SourceArtTurntableLab({
  assetId,
  onAssetId,
  header,
}: {
  assetId: string;
  onAssetId: (id: string) => void;
  header?: ReactNode;
}): ReactElement {
  const { catalog, drawables, state, error, refresh } = useSourceArtAdminCatalog();
  const groups = useMemo(() => catalog ? sourceArtTurntableGroups(catalog) : [], [catalog]);
  const acceptedGroups = useMemo(
    () => groups.filter((candidate) => sourceArtGroupAvailableInEditor(drawables, candidate)),
    [drawables, groups],
  );
  const needsReviewGroups = useMemo(
    () => groups.filter((candidate) => !sourceArtGroupAvailableInEditor(drawables, candidate)),
    [drawables, groups],
  );
  const group = groups.find((candidate) => candidate.assetId === assetId) ?? groups[0] ?? null;
  const [selectedVersionBySlot, setSelectedVersionBySlot] = useState<Record<string, string>>({});
  const [approvedAssetIds, setApprovedAssetIds] = useState<Set<string>>(
    () => new Set(readSourceArtApprovalIds()),
  );
  const [approvalCopyState, setApprovalCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [manualRefreshState, setManualRefreshState] = useState<'idle' | 'refreshing' | 'refreshed'>('idle');
  const [notes, setNotes] = useState('');
  const [mutation, setMutation] = useState<'review' | 'accept' | 'install' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decodedKey, setDecodedKey] = useState('');
  const [proofPlacement, setProofPlacement] = useState<SourceArtBoardProofPlacement>(SOURCE_ART_PROOF_INITIAL_PLACEMENT);
  const [proofZoom, setProofZoom] = useState(0.9);
  const [proofPan, setProofPan] = useState({ x: 0, y: 0 });
  const [mountedProof, setMountedProof] = useState<{
    key: string;
    directions: Set<SourceArtTurntableDirection>;
  }>({ key: '', directions: new Set() });

  useEffect(() => {
    if (group && group.assetId !== assetId) onAssetId(group.assetId);
  }, [assetId, group, onAssetId]);

  useEffect(() => {
    setProofPlacement(SOURCE_ART_PROOF_INITIAL_PLACEMENT);
    setProofPan({ x: 0, y: 0 });
  }, [group?.assetId]);

  useEffect(() => {
    if (!catalog || !group) return;
    setSelectedVersionBySlot((current) => {
      const next = { ...current };
      for (const slot of group.requiredSlots) {
        const currentVersion = catalog.versions.find((version) => version.id === next[slot]);
        if (currentVersion?.slot === slot && currentVersion.status === 'candidate' && currentVersion.media) continue;
        const newest = candidateVersionsForSlot(catalog, slot)[0];
        if (newest) next[slot] = newest.id;
        else delete next[slot];
      }
      return next;
    });
  }, [catalog, group]);

  const batch = useMemo(() => (
    catalog && group
      ? sourceArtSelectedVersions(catalog, group, selectedVersionBySlot)
      : { versions: [], slots: [], missingSlots: [] }
  ), [catalog, group, selectedVersionBySlot]);
  const slotByName = useMemo(() => new Map((catalog?.slots ?? []).map((slot) => [slot.slot, slot])), [catalog]);
  const versionBySlot = useMemo(() => new Map(batch.versions.map((version) => [version.slot, version])), [batch.versions]);
  const displayVersions = useMemo(() => {
    if (!catalog || !group) return new Map<string, AdminLiveMediaVersion>();
    return new Map(group.requiredSlots.flatMap((slot) => {
      const version = versionBySlot.get(slot) ?? activeDisplayVersion(catalog, slot);
      return version ? [[slot, version] as const] : [];
    }));
  }, [catalog, group, versionBySlot]);
  const displayKey = group ? group.requiredSlots.map((slot) => {
    const version = displayVersions.get(slot);
    return `${slot}:${version?.id ?? ''}:${version?.media?.sha256 ?? ''}`;
  }).join('|') : '';
  const proofVersion = group
    ? displayVersions.get(`source-art/${group.assetId}/${proofPlacement.direction}.png`)
    : undefined;

  useEffect(() => {
    if (!group || displayVersions.size !== 8) {
      setDecodedKey('');
      return undefined;
    }
    let cancelled = false;
    const decode = [...displayVersions.values()].map((version) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth === 512 && image.naturalHeight === 512
        ? resolve()
        : reject(new Error(`${version.slot} is not the canonical 512×512 source frame`));
      image.onerror = () => reject(new Error(`${version.slot} could not be decoded`));
      image.src = version.media?.url ?? '';
    }));
    void Promise.all(decode).then(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!cancelled) setDecodedKey(displayKey);
      }));
    }).catch((reason: unknown) => {
      if (!cancelled) setNotice(`Preview failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    });
    return () => { cancelled = true; };
  }, [displayKey, displayVersions, group]);

  useEffect(() => {
    setMountedProof({ key: displayKey, directions: new Set() });
  }, [displayKey]);

  const reviewed = batch.versions.filter((version) => (
    isSourceArtBoardReviewed(version, version.slot ? slotByName.get(version.slot) : undefined)
  )).length;
  const completeCandidates = batch.versions.length === 8 && batch.missingSlots.length === 0;
  const nativeRastersReady = displayVersions.size === 8 && decodedKey === displayKey;
  const mountedDirectionCount = mountedProof.key === displayKey ? mountedProof.directions.size : 0;
  const proofReady = nativeRastersReady && mountedDirectionCount === SOURCE_ART_DIRECTIONS.length;
  const availableInEditor = group ? sourceArtGroupAvailableInEditor(drawables, group) : false;
  const eightWayInstalled = group ? sourceArtGroupInstalled(drawables, group) : false;
  const allSlotsActive = Boolean(group && sourceArtGroupAccepted(catalog, group));
  const busy = mutation !== null;
  const approvedGroups = needsReviewGroups.filter((candidate) => approvedAssetIds.has(candidate.assetId));
  const groupApproved = Boolean(group && approvedAssetIds.has(group.assetId));
  const sourceNavigationGroups = [...acceptedGroups, ...needsReviewGroups];
  const sourceNavigationIndex = group
    ? sourceNavigationGroups.findIndex((candidate) => candidate.assetId === group.assetId)
    : -1;

  const setGroupApproved = (approved: boolean): void => {
    if (!group) return;
    setApprovedAssetIds((current) => {
      const next = new Set(current);
      if (approved) next.add(group.assetId);
      else next.delete(group.assetId);
      writeSourceArtApprovalIds(next);
      return next;
    });
    setApprovalCopyState('idle');
  };

  const copyApprovalList = async (): Promise<void> => {
    if (!approvedGroups.length) return;
    try {
      await navigator.clipboard.writeText(sourceArtApprovalListText(needsReviewGroups, approvedAssetIds));
      setApprovalCopyState('copied');
    } catch {
      setApprovalCopyState('failed');
    }
  };

  const refreshSourceArt = async (): Promise<void> => {
    setManualRefreshState('refreshing');
    const refreshed = await refresh();
    setManualRefreshState(refreshed ? 'refreshed' : 'idle');
  };

  const recordReview = async (): Promise<void> => {
    if (!group || !completeCandidates || !proofReady || !notes.trim()) return;
    setMutation('review');
    setNotice(null);
    try {
      await reviewLiveMediaVersions({
        versions: batch.versions,
        notes: notes.trim(),
        surfaceUrl: window.location.href,
        evidence: sourceArtOwnerGroupProof(
          group,
          batch.versions,
          batch.slots,
          proofPlacement,
          mountedProof.directions,
        ),
      });
      await refresh();
      setNotice(`Recorded the board-placement owner review for all eight ${group.label} directions.`);
    } catch (reason) {
      setNotice(`Review failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      await refresh();
    } finally {
      setMutation(null);
    }
  };

  const install = async (nextGroup: SourceArtTurntableGroup): Promise<void> => {
    const nextDrawables = await fetchAdminDrawableCatalog();
    await saveDrawableAsset(sourceArtDrawableInstallInput(nextDrawables, nextGroup));
    await Promise.all([loadLiveMediaCatalog(), loadDrawableCatalog()]);
  };

  const acceptAndInstall = async (): Promise<void> => {
    if (!catalog || !group || !completeCandidates || reviewed !== 8 || !proofReady) return;
    setMutation('accept');
    setNotice(null);
    try {
      const result = await acceptLiveMediaVersions(surfaceAcceptanceItems(catalog, batch.versions));
      const refreshed = await refresh();
      if (!refreshed) throw new Error('accepted media, but could not refresh the catalogs for drawable installation');
      const nextGroup = sourceArtTurntableGroups(refreshed.catalog).find((candidate) => candidate.assetId === group.assetId);
      if (!nextGroup) throw new Error('accepted media, but its source-art group disappeared before drawable installation');
      setMutation('install');
      await install(nextGroup);
      await refresh();
      setNotice(`Accepted atomic batch ${result.batchId.slice(0, 8)} and installed ${group.label} as complete eight-way Source Artwork.`);
    } catch (reason) {
      setNotice(`Acceptance/install failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      await refresh();
    } finally {
      setMutation(null);
    }
  };

  const installAccepted = async (): Promise<void> => {
    if (!catalog || !group || !allSlotsActive) return;
    setMutation('install');
    setNotice(null);
    try {
      await install(group);
      await refresh();
      setNotice(`Installed the already-accepted ${group.label} turntable in the Source Artwork shelf.`);
    } catch (reason) {
      setNotice(`Install failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      await refresh();
    } finally {
      setMutation(null);
    }
  };

  const nextPending = (): void => {
    if (!group || !groups.length) return;
    const start = groups.indexOf(group);
    const next = [...groups.slice(start + 1), ...groups.slice(0, start + 1)]
      .find((candidate) => !sourceArtGroupInstalled(drawables, candidate));
    if (next) onAssetId(next.assetId);
  };
  const stepSource = (offset: -1 | 1): void => {
    if (sourceNavigationIndex < 0 || sourceNavigationGroups.length < 2) return;
    const nextIndex = (
      sourceNavigationIndex + offset + sourceNavigationGroups.length
    ) % sourceNavigationGroups.length;
    onAssetId(sourceNavigationGroups[nextIndex].assetId);
  };
  const rotateProof = (): void => {
    const index = SOURCE_ART_DIRECTIONS.indexOf(proofPlacement.direction);
    setProofPlacement({
      ...proofPlacement,
      direction: SOURCE_ART_DIRECTIONS[(index + 1) % SOURCE_ART_DIRECTIONS.length],
    });
  };
  const setProofScale = (value: number): void => {
    setProofPlacement({
      ...proofPlacement,
      scale: Number.isFinite(value) ? Math.max(0.1, Math.min(8, value)) : proofPlacement.scale,
    });
  };

  return (
    <>
      <style>{SOURCE_ART_CSS}</style>
      <section className="al-lab-main source-art-review-main" aria-label="Source art eight-way review">
        {state === 'loading' ? <p className="al-lab-empty">Loading private source-art candidates…</p> : null}
        {state === 'unauthorized' ? <p className="al-lab-empty">Admin sign-in is required to review and install source art.</p> : null}
        {state === 'error' ? <p className="al-lab-empty" role="alert">Source-art review unavailable: {error}</p> : null}
        {state === 'ready' && !group ? <p className="al-lab-empty">No source-art turntable batches are available.</p> : null}
        {group ? (
          <div className="source-art-board-proof">
            <SourceArtBoardProof
              group={group}
              placement={proofPlacement}
              version={proofVersion}
              zoom={proofZoom}
              pan={proofPan}
              onPlacement={setProofPlacement}
              onZoom={setProofZoom}
              onPan={setProofPan}
              onMounted={(direction) => {
                setMountedProof((current) => {
                  const directions = new Set(current.key === displayKey ? current.directions : []);
                  directions.add(direction);
                  return { key: displayKey, directions };
                });
              }}
            />
            <p className="source-art-board-proof-status" role="status">
              Drag the selected artwork to place it · rotate through every facing · board-mounted {mountedDirectionCount}/8
            </p>
          </div>
        ) : null}
      </section>
      <aside className="tileset-view-controls" aria-label="Source art review controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {group ? (
              <>
                <div className="source-art-approval-copy">
                  <div className="source-art-meta-actions">
                    <button
                      type="button"
                      className="tileset-view-action"
                      disabled={!approvedGroups.length}
                      onClick={() => void copyApprovalList()}
                    >
                      {approvalCopyState === 'copied' ? 'Copied approval list' : 'Copy approval list'}
                    </button>
                    <button
                      type="button"
                      className="tileset-view-action"
                      disabled={busy || manualRefreshState === 'refreshing'}
                      aria-label="Refresh source artwork without reloading the page"
                      title="Reload source artwork and approval state without reloading the page"
                      onClick={() => void refreshSourceArt()}
                    >
                      {manualRefreshState === 'refreshing'
                        ? 'Refreshing…'
                        : manualRefreshState === 'refreshed'
                          ? 'Refreshed'
                          : 'Refresh'}
                    </button>
                  </div>
                  <span className={`source-art-approval-count ${approvalCopyState === 'failed' ? 'is-error' : ''}`} aria-live="polite">
                    {approvalCopyState === 'failed'
                      ? 'Clipboard unavailable'
                      : `${approvedGroups.length} approved`}
                  </span>
                </div>
                <div className="tileset-category-select">
                  <span>Source</span>
                  <div className="source-art-source-row">
                    <button
                      type="button"
                      className="tileset-view-action source-art-source-step"
                      disabled={busy || sourceNavigationGroups.length < 2}
                      aria-label="Previous source artwork"
                      title="Previous source artwork"
                      onClick={() => stepSource(-1)}
                    >
                      {'<'}
                    </button>
                    <select
                      aria-label="Source artwork"
                      value={group.assetId}
                      disabled={busy}
                      onChange={(event) => onAssetId(event.target.value)}
                    >
                      {acceptedGroups.length ? (
                        <optgroup label="Accepted">
                          {acceptedGroups.map((candidate) => <option key={candidate.assetId} value={candidate.assetId}>{candidate.label}</option>)}
                        </optgroup>
                      ) : null}
                      {needsReviewGroups.length ? (
                        <optgroup label="Needs review">
                          {needsReviewGroups.map((candidate) => <option key={candidate.assetId} value={candidate.assetId}>{candidate.label}</option>)}
                        </optgroup>
                      ) : null}
                    </select>
                    <button
                      type="button"
                      className="tileset-view-action source-art-source-step"
                      disabled={busy || sourceNavigationGroups.length < 2}
                      aria-label="Next source artwork"
                      title="Next source artwork"
                      onClick={() => stepSource(1)}
                    >
                      {'>'}
                    </button>
                  </div>
                </div>
                {!availableInEditor ? (
                  <label className="source-art-approval-check">
                    <input
                      type="checkbox"
                      checked={groupApproved}
                      onChange={(event) => setGroupApproved(event.target.checked)}
                    />
                    <span>Approve</span>
                  </label>
                ) : null}
                <dl className="al-meta source-art-meta">
                  <div><dt>Set</dt><dd>{group.existing ? 'Existing source upgrade' : 'New source-only landmark'}</dd></div>
                  <div><dt>License</dt><dd>{group.license}</dd></div>
                  <div><dt>Contract</dt><dd>8 directions · atomic</dd></div>
                  <div><dt>Proof</dt><dd>Interactive board placement</dd></div>
                  <div><dt>Editor</dt><dd>{availableInEditor ? 'accepted' : 'not accepted'}</dd></div>
                  <div><dt>8-way</dt><dd>{eightWayInstalled ? 'installed' : allSlotsActive ? 'accepted, install pending' : 'needs review'}</dd></div>
                </dl>
                <div className="source-art-proof-controls">
                  <span className="source-art-control-label">Rendered direction</span>
                  <FacingCompass
                    direction={proofPlacement.direction}
                    onSelect={(direction) => setProofPlacement({ ...proofPlacement, direction })}
                    onRotate={rotateProof}
                    ariaLabel="Candidate artwork direction (8-way)"
                  />
                  <label className="source-art-transform-row">
                    <span>X px</span>
                    <input
                      type="range"
                      aria-label="Candidate artwork X pixel position"
                      min="-512"
                      max="512"
                      step="1"
                      value={proofPlacement.pixelX}
                      onChange={(event) => setProofPlacement({ ...proofPlacement, pixelX: clampProofCoordinate(Number(event.target.value)) })}
                    />
                    <input
                      type="number"
                      aria-label="Candidate artwork X pixel position value"
                      min="-512"
                      max="512"
                      step="1"
                      value={proofPlacement.pixelX}
                      onChange={(event) => setProofPlacement({ ...proofPlacement, pixelX: clampProofCoordinate(Number(event.target.value)) })}
                    />
                  </label>
                  <label className="source-art-transform-row">
                    <span>Y px</span>
                    <input
                      type="range"
                      aria-label="Candidate artwork Y pixel position"
                      min="-512"
                      max="512"
                      step="1"
                      value={proofPlacement.pixelY}
                      onChange={(event) => setProofPlacement({ ...proofPlacement, pixelY: clampProofCoordinate(Number(event.target.value)) })}
                    />
                    <input
                      type="number"
                      aria-label="Candidate artwork Y pixel position value"
                      min="-512"
                      max="512"
                      step="1"
                      value={proofPlacement.pixelY}
                      onChange={(event) => setProofPlacement({ ...proofPlacement, pixelY: clampProofCoordinate(Number(event.target.value)) })}
                    />
                  </label>
                  <label className="source-art-transform-row">
                    <span>Scale</span>
                    <input
                      type="range"
                      aria-label="Candidate artwork scale"
                      min="0.1"
                      max="8"
                      step="0.05"
                      value={proofPlacement.scale}
                      onChange={(event) => setProofScale(Number(event.target.value))}
                    />
                    <input
                      type="number"
                      aria-label="Candidate artwork scale value"
                      min="0.1"
                      max="8"
                      step="0.05"
                      value={proofPlacement.scale}
                      onChange={(event) => setProofScale(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" className="tileset-view-action" disabled={busy} onClick={() => setProofPlacement(SOURCE_ART_PROOF_INITIAL_PLACEMENT)}>Reset placement</button>
                </div>
                <details className="source-art-candidate-versions">
                  <summary>Candidate versions</summary>
                  <div className="source-art-candidate-version-list">
                    {group.requiredSlots.map((slotName) => {
                      const direction = sourceArtDirectionForSlot(group, slotName);
                      const candidates = catalog ? candidateVersionsForSlot(catalog, slotName) : [];
                      const selectedId = selectedVersionBySlot[slotName] ?? '';
                      return (
                        <label className="source-art-candidate-select" key={slotName}>
                          <span>{direction}</span>
                          <select value={selectedId} disabled={busy || candidates.length < 2} onChange={(event) => setSelectedVersionBySlot((current) => ({ ...current, [slotName]: event.target.value }))}>
                            {!candidates.length ? <option value="">No candidate</option> : null}
                            {candidates.map((version) => <option key={version.id} value={version.id}>{version.label} · {version.media?.sha256.slice(0, 8)}</option>)}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </details>
                <label className="source-art-review-notes">
                  <span>Owner review notes</span>
                  <textarea rows={3} maxLength={4000} disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did you verify across the eight facings?" />
                </label>
                <p className="source-art-review-summary">
                  {batch.versions.length}/8 candidates · board-mounted {mountedDirectionCount}/8 · {reviewed}/8 current board reviews · native rasters {nativeRastersReady ? 'decoded' : 'decoding'} · {eightWayInstalled ? '8-way installed' : allSlotsActive ? '8-way accepted, install pending' : availableInEditor ? 'accepted source · 8-way needs review' : 'not accepted'}
                </p>
                <button type="button" className="tileset-view-action" disabled={busy || !completeCandidates || !proofReady || !notes.trim()} onClick={() => void recordReview()}>
                  {mutation === 'review' ? 'Recording…' : 'Record board-placement review'}
                </button>
                <button type="button" className="tileset-view-action source-art-accept" disabled={busy || !completeCandidates || reviewed !== 8 || !proofReady} onClick={() => void acceptAndInstall()}>
                  {mutation === 'accept' ? 'Accepting…' : mutation === 'install' ? 'Installing…' : 'Accept atomically + install'}
                </button>
                {allSlotsActive && !eightWayInstalled ? (
                  <button type="button" className="tileset-view-action" disabled={busy} onClick={() => void installAccepted()}>Install accepted group</button>
                ) : null}
                <button type="button" className="tileset-view-action" disabled={busy || groups.length < 2} onClick={nextPending}>Next pending</button>
                {notice ? <p className={notice.includes('failed') || notice.includes('Failed') ? 'source-art-error' : 'source-art-success'}>{notice}</p> : null}
              </>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}

const SOURCE_ART_CSS = `
.source-art-card-image { background-color: #111722; background-image: linear-gradient(45deg,#1b2432 25%,transparent 25%),linear-gradient(-45deg,#1b2432 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1b2432 75%),linear-gradient(-45deg,transparent 75%,#1b2432 75%); background-size:16px 16px; }
.source-art-card-image img { width:100%; height:100%; object-fit:contain; }
.source-art-review-main { position:relative; overflow:hidden; padding:0; align-content:stretch; }
.source-art-board-proof { position:relative; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; }
.source-art-board-surface .tileset-generated-board-tile { cursor:default; }
.source-art-board-candidate { position:absolute; display:block; box-sizing:border-box; transform:translate(-50%,-50%); z-index:30000; border:2px dotted rgba(125,224,255,.94); outline:1px solid rgba(3,14,24,.78); cursor:grab; touch-action:none; pointer-events:auto; }
.source-art-board-candidate:active { cursor:grabbing; }
.source-art-board-candidate img { display:block; width:100%; height:100%; max-width:none; max-height:none; object-fit:contain; image-rendering:auto; pointer-events:none; }
.source-art-board-proof-status { position:absolute; left:12px; bottom:12px; z-index:5; margin:0; padding:7px 9px; border:1px solid rgba(91,157,216,.44); border-radius:4px; background:rgba(5,16,25,.9); color:#c5d9ed; font:11px/1.35 var(--ds-font-sans,system-ui,sans-serif); pointer-events:none; }
.source-art-approval-copy { display:grid; gap:5px; padding:7px; border:1px solid rgba(74,159,121,.55); border-radius:4px; background:rgba(22,58,43,.48); }
.source-art-meta-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,.7fr); gap:5px; }
.source-art-approval-copy .tileset-view-action { min-width:0; margin:0; }
.tileset-control-stack .source-art-approval-check { display:flex; min-width:0; align-items:center; gap:7px; padding:7px; border:1px solid rgba(74,159,121,.55); border-radius:4px; background:rgba(22,58,43,.48); color:#dff9ec; font-size:11px; font-weight:800; cursor:pointer; }
.source-art-approval-check input { width:15px; height:15px; margin:0; accent-color:#4a9f79; }
.source-art-approval-count { color:#8ed6b2; font-size:10px; line-height:1.2; text-align:right; }
.source-art-approval-count.is-error { color:#ffaaa3; }
.source-art-source-row { display:grid; grid-template-columns:36px minmax(0,1fr) 36px; gap:5px; min-width:0; }
.source-art-source-row .source-art-source-step { min-width:0; width:36px; height:36px; min-height:36px; margin:0; padding:0; font-family:var(--ds-font-mono,monospace); font-size:16px; font-weight:900; }
.source-art-meta dd { overflow-wrap:anywhere; }
.source-art-proof-controls { display:grid; gap:8px; }
.source-art-control-label { color:#9fb3ca; font-size:10px; font-weight:800; text-transform:uppercase; }
.source-art-transform-row { display:grid; grid-template-columns:38px minmax(0,1fr) 62px; align-items:center; gap:7px; color:#9fb3ca; font-size:10px; }
.source-art-transform-row input[type="range"] { width:100%; min-width:0; }
.source-art-transform-row input[type="number"] { box-sizing:border-box; width:100%; height:27px; padding:3px 5px; border:1px solid #2a3c5e; border-radius:4px; background:#0a1321; color:#e4eef9; font:10px var(--ds-font-mono,monospace); }
.source-art-candidate-versions { border:1px solid rgba(42,60,94,.72); border-radius:4px; background:rgba(10,19,33,.62); }
.source-art-candidate-versions summary { padding:7px; color:#9fb3ca; cursor:pointer; font-size:10px; font-weight:800; text-transform:uppercase; }
.source-art-candidate-version-list { display:grid; gap:6px; padding:0 7px 7px; }
.source-art-candidate-select { display:grid; gap:3px; color:#9fb3ca; font-size:10px; }
.source-art-candidate-select select { width:100%; min-width:0; height:27px; border:1px solid #2a3c5e; border-radius:4px; background:#0d1728; color:#d8eaff; font:10px var(--ds-font-sans,system-ui,sans-serif); }
.source-art-review-notes { display:grid; gap:4px; color:#9fb3ca; font-size:10px; }
.source-art-review-notes textarea { box-sizing:border-box; width:100%; resize:vertical; min-height:58px; padding:7px; border:1px solid #2a3c5e; border-radius:4px; background:#0a1321; color:#e4eef9; font:11px/1.35 var(--ds-font-sans,system-ui,sans-serif); }
.source-art-review-summary,.source-art-error,.source-art-success { margin:0; font-size:10px; line-height:1.4; overflow-wrap:anywhere; }
.source-art-review-summary { color:#8ba8c2; }
.source-art-error { color:#ffaaa3; }
.source-art-success { color:#8ed6b2; }
.source-art-accept:not(:disabled) { border-color:#4a9f79; background:#163a2b; color:#dff9ec; }
`;
