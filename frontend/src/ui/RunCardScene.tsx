import {
  boardLabCellPosition,
  currentDoodadAssets,
  drawableAssets,
  structureArtDirections,
  structureArtDirectionSprite,
} from '@chess-tactics/board-render';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { TILE_STEP_Y } from '../art/projectionContract';
import { tileAssets } from '../art/tileset';
import { paletteForSide } from '../core/pieces';
import { createRng, type Rng } from '../core/rng';
import { PROP_DEFS, propCells, type PropDef } from '../core/props';
import {
  familyForGameplayTerrain,
  gameplayTerrainForFamily,
  type TileFamilyId,
} from '../core/tileSockets';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { canonicalCardId } from '../run/cardNames';
import { mixSeed, PIECE_VALUE, type PieceBundle } from '../run/model';
import { type EditorBoard, type FloatingArtworkPlacement } from './boardCode';

/** A card's viewing pane in board-world space; height follows the capture ratio. */
export interface CardSceneFrame {
  x: number;
  y: number;
  width: number;
}

// A bundle card's artwork is a small battlefield vignette: the bundle's units mustered
// on a coherent patch of live terrain, with seeded ground cover and an optional prop.
// Like the Run unit profile (ADR-0247), the card owns only the deterministic plan —
// terrain, cover, prop, and unit pixels stay live-storage-backed and resolve through
// their canonical catalogs.
export const RUN_CARD_SCENE_COLS = 3;
export const RUN_CARD_SCENE_ROWS = 3;
// Render-only scenic ring around the 3×3 tactical stage (echoes the edge terrain), so
// every window crop is full-bleed field instead of a floating diamond island.
export const RUN_CARD_SCENE_APRON = 2;

// The enriched-art contract: every scene slot is captured (and installed) at exactly
// this stage raster. The stage renders the card's authored viewing pane (its frame),
// so a card window can mount the art as a board-registered plate — centred on the
// same frame and scaled by the zoom ratio — with the live units seated exactly on top.
export const RUN_CARD_SCENE_CAPTURE = {
  width: 480,
  height: 360,
} as const;

const boardCentre = (): { left: number; top: number } => boardLabCellPosition({
  x: (RUN_CARD_SCENE_COLS - 1) / 2,
  y: (RUN_CARD_SCENE_ROWS - 1) / 2,
});

/**
 * The default viewing pane: what every card showed before frames were authorable —
 * the massing centred one canonical half-step above the board centre at the original
 * capture framing (480px stage at 1.9× zoom).
 */
export function defaultCardSceneFrame(): CardSceneFrame {
  const centre = boardCentre();
  return {
    x: centre.left,
    y: centre.top - TILE_STEP_Y,
    width: RUN_CARD_SCENE_CAPTURE.width / 1.9,
  };
}

export function cardSceneFrameHeight(frame: CardSceneFrame): number {
  return frame.width * (RUN_CARD_SCENE_CAPTURE.height / RUN_CARD_SCENE_CAPTURE.width);
}

/**
 * Map the authored frame into a viewport: cover-fit (the frame fills the window; the
 * off-aspect axis crops symmetrically) centred on the frame. Both the live card window
 * and the fixed capture stage use this one mapping, so the art plate registration
 * below stays exact.
 */
export function cardSceneCameraForView(
  frame: CardSceneFrame,
  viewWidth: number,
  viewHeight: number,
): { zoom: number; pan: { x: number; y: number } } {
  const zoom = Math.max(viewWidth / frame.width, viewHeight / cardSceneFrameHeight(frame));
  const centre = boardCentre();
  return {
    zoom,
    pan: { x: (centre.left - frame.x) * zoom, y: (centre.top - frame.y) * zoom },
  };
}

const CARD_FACTION = paletteForSide('player');
const CARD_FACING = 'south' as const;
// Card vignettes shrink ground-cover tufts so grass reads in proportion to the
// mustered units; gameplay boards keep native tuft scale.
export const RUN_CARD_COVER_SCALE = 0.7;

// Formation seats in placement-priority order: the highest-value piece anchors the
// centre, flanks fill the middle rank, then the front rank, then the rear rank.
const FORMATION_SEATS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: 2, y: 1 },
  { x: 1, y: 2 },
  { x: 0, y: 2 },
  { x: 2, y: 2 },
  { x: 1, y: 0 },
  { x: 0, y: 0 },
  { x: 2, y: 0 },
];

interface WalkableFamily {
  familyId: TileFamilyId;
  tileIds: string[];
}

function walkableFamilies(): WalkableFamily[] {
  const byFamily = new Map<TileFamilyId, string[]>();
  for (const asset of [...tileAssets].sort((left, right) => left.id.localeCompare(right.id))) {
    const family = asset.terrains?.[0];
    if (!family) continue;
    const terrain = gameplayTerrainForFamily(family);
    if (terrain === 'water' || terrain === 'cliff' || terrain === 'void') continue;
    byFamily.set(family, [...(byFamily.get(family) ?? []), asset.id]);
  }
  return [...byFamily.entries()]
    .map(([familyId, tileIds]) => ({ familyId, tileIds }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function scenePropDefs(familyId: TileFamilyId): PropDef[] {
  return PROP_DEFS
    .filter((def) => (def.kind === 'tree' || def.kind === 'rock' || def.kind === 'house') && def.terrains.includes(familyId))
    .filter((def) => def.w <= RUN_CARD_SCENE_COLS && def.h <= RUN_CARD_SCENE_ROWS)
    .sort((left, right) => left.id.localeCompare(right.id));
}

// Small placed decorations (boulder, fern, flower…) from the shared doodad shelf,
// terrain-gated exactly like the board brush.
function placeDoodads(
  rng: Rng,
  familyId: TileFamilyId,
  free: Set<string>,
): EditorBoard['doodads'] {
  const eligible = currentDoodadAssets()
    .filter((doodad) => doodad.terrains.includes(familyId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const placed: EditorBoard['doodads'] = {};
  if (!eligible.length) return placed;
  const wanted = 2 + rng.int(3);
  const cells = [...free].sort();
  for (let index = 0; index < wanted && cells.length > 0; index += 1) {
    const key = cells.splice(rng.int(cells.length), 1)[0];
    placed[key] = { doodadId: eligible[rng.int(eligible.length)].id };
    free.delete(key);
  }
  return placed;
}

// Scenic backdrops from the shared structure-art library, mounted as gameplay-inert
// floating artwork in the rear apron. Universal anchors suit any field; lush and
// arid extras join by the scene's terrain. Only landmarks with installed direction
// media are eligible, so the pool follows the live catalog like every other channel.
const LANDMARKS_UNIVERSAL = [
  'castle-ii',
  'castle-chinchilla',
  'castle-consuegra',
  'hrusov-castle',
  'paletas-windmill',
  'windmill-game-ready',
  'river-mill',
  'waterfall-mountain-river',
  'forest-rock-cluster',
] as const;
const LANDMARKS_LUSH = [
  'broadleaf-tree',
  'rootbound-majesty-tree',
  'forest-tree-1',
  'forest-tree-2',
  'forest-tree-3',
  'forest-tree-4',
  'mushroom-cluster-2',
  'mushroom-cluster-4',
  'mushroom-cluster-6',
] as const;
const LANDMARKS_ARID = ['saguaro-cactus'] as const;
const LUSH_TERRAINS = new Set(['grass', 'dirt']);
const ARID_TERRAINS = new Set(['sand']);
/**
 * The default viewing pane as a world rectangle. Generated landmark placement is
 * solved inside this rectangle from real sprite metrics, so nothing lands off frame
 * for an unauthored card; an authored frame simply crops the same scene differently,
 * which the editor's frame overlay shows while composing.
 */
function captureWorldRect(): { minX: number; maxX: number; minY: number; maxY: number } {
  const frame = defaultCardSceneFrame();
  const halfW = frame.width / 2;
  const halfH = cardSceneFrameHeight(frame) / 2;
  return { minX: frame.x - halfW, maxX: frame.x + halfW, minY: frame.y - halfH, maxY: frame.y + halfH };
}

function placeLandmark(rng: Rng, familyId: TileFamilyId): FloatingArtworkPlacement[] {
  const terrain = gameplayTerrainForFamily(familyId);
  const pool = [
    ...LANDMARKS_UNIVERSAL,
    ...(terrain && LUSH_TERRAINS.has(terrain) ? LANDMARKS_LUSH : []),
    ...(terrain && ARID_TERRAINS.has(terrain) ? LANDMARKS_ARID : []),
  ].filter((id) => structureArtDirections(id).length > 0);
  if (!pool.length) return [];
  const sourceArtId = pool[rng.int(pool.length)];
  const directions = structureArtDirections(sourceArtId);
  const direction = directions[rng.int(directions.length)];
  const sprite = structureArtDirectionSprite(sourceArtId, direction);
  if (!sprite) return [];

  // Floating artwork draws centred on (pixelX, pixelY) at sprite.scale × placement
  // scale (see renderPlan). Size it to a readable backdrop and seat it fully inside
  // the frame's upper band, horizontally seeded between the corners and centre.
  const frame = captureWorldRect();
  const inset = 8;
  const nativeW = sprite.w * sprite.scale;
  const nativeH = sprite.h * sprite.scale;
  const targetH = 80 + rng.int(3) * 10;
  const scale = Math.min(targetH / nativeH, (frame.maxX - frame.minX - inset * 2) / nativeW);
  const width = nativeW * scale;
  const height = nativeH * scale;
  const pixelY = frame.minY + inset + height / 2;
  const maxOffset = Math.max(0, frame.maxX - inset - width / 2);
  const pixelX = (rng.int(3) - 1) * Math.min(70, maxOffset);
  return [{
    id: `card-landmark-${sourceArtId}`,
    sourceArtId,
    pixelX,
    pixelY,
    direction,
    scale,
  }];
}

function placeProps(
  rng: Rng,
  familyId: TileFamilyId,
  free: Set<string>,
): Record<string, { propId: string }> {
  const defs = scenePropDefs(familyId);
  const placed: Record<string, { propId: string }> = {};
  if (!defs.length) return placed;
  const roll = rng.int(4);
  const wanted = roll === 0 ? 0 : roll === 3 ? 2 : 1;
  for (let attempt = 0; attempt < wanted; attempt += 1) {
    const def = defs[rng.int(defs.length)];
    // Rear-most fits first so props read as backdrop behind the formation.
    const anchors: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < RUN_CARD_SCENE_ROWS; y += 1) {
      for (let x = 0; x < RUN_CARD_SCENE_COLS; x += 1) {
        const cells = propCells(x, y, def);
        const fits = cells.every((cell) => (
          cell.x >= 0 && cell.x < RUN_CARD_SCENE_COLS
          && cell.y >= 0 && cell.y < RUN_CARD_SCENE_ROWS
          && free.has(`${cell.x},${cell.y}`)
        ));
        if (fits) anchors.push({ x, y });
      }
    }
    if (!anchors.length) continue;
    const preferred = anchors.filter((anchor) => anchor.y === 0);
    const pool = preferred.length ? preferred : anchors;
    const anchor = pool[rng.int(pool.length)];
    placed[`${anchor.x},${anchor.y}`] = { propId: def.id };
    for (const cell of propCells(anchor.x, anchor.y, def)) free.delete(`${cell.x},${cell.y}`);
  }
  return placed;
}

export interface RunCardScenePlan {
  board: EditorBoard;
  coverSeed: number;
  familyId: TileFamilyId;
  /** Stable art-slot key for this card's scene; equals the bundle id. */
  sceneId: string;
  /** The card's viewing pane (the default framing). */
  frame: CardSceneFrame;
}

/** The card's mustered formation — always derived from the composition, never stored. */
export function cardSceneUnits(bundle: Pick<PieceBundle, 'pieces'>): EditorBoard['units'] {
  // Highest-value piece takes the hero seat; ties keep the bundle's own order.
  const mustered = bundle.pieces
    .map((piece, index) => ({ piece, index }))
    .sort((left, right) => (
      (PIECE_VALUE[right.piece] ?? 0) - (PIECE_VALUE[left.piece] ?? 0) || left.index - right.index
    ))
    .slice(0, FORMATION_SEATS.length);
  const units: EditorBoard['units'] = {};
  mustered.forEach(({ piece }, seatIndex) => {
    const seat = FORMATION_SEATS[seatIndex];
    units[`${seat.x},${seat.y}`] = { unitId: piece, direction: CARD_FACING, faction: CARD_FACTION };
  });
  return units;
}

/**
 * Turns one bundle into its deterministic battlefield vignette. The canonical card id
 * (the piece composition) is the only input, so the same card always shows the same
 * scene everywhere it appears — draft offer, shop bundle, Enchiridion record, art
 * capture — while live catalog art can still update.
 */
export function runCardScenePlan(bundle: Pick<PieceBundle, 'pieces'>): RunCardScenePlan {
  const families = walkableFamilies();
  if (!families.length) {
    throw new Error('Run card scenes require at least one installed walkable terrain family.');
  }
  const sceneId = canonicalCardId(bundle);
  const units = cardSceneUnits(bundle);
  const coverSeed = mixSeed(mixSeed(0x9c42d5, `run-card-scene:${sceneId}`), 'run-card-scene-cover');
  const frame = defaultCardSceneFrame();

  const rng = createRng(mixSeed(0x9c42d5, `run-card-scene:${sceneId}`, 0));
  const family = families[rng.int(families.length)];

  const cells: Record<string, string> = {};
  for (let y = 0; y < RUN_CARD_SCENE_ROWS; y += 1) {
    for (let x = 0; x < RUN_CARD_SCENE_COLS; x += 1) {
      cells[`${x},${y}`] = family.tileIds[rng.int(family.tileIds.length)];
    }
  }

  const free = new Set(Object.keys(cells));
  for (const key of Object.keys(units)) free.delete(key);

  const props = placeProps(rng, family.familyId, free);
  const doodads = placeDoodads(rng, family.familyId, free);
  const floatingArtwork = placeLandmark(rng, family.familyId);

  const grassFamily = familyForGameplayTerrain('grass');
  const cover: EditorBoard['cover'] = {};
  const coverTypes: NonNullable<EditorBoard['coverTypes']> = {};
  if (grassFamily) {
    for (const key of Object.keys(cells)) {
      const roll = rng.int(3);
      if (roll === 0) continue;
      cover[key] = roll === 1 ? 'sparse' : 'filled';
      coverTypes[key] = grassFamily;
    }
  }

  const board: EditorBoard = {
    cols: RUN_CARD_SCENE_COLS,
    rows: RUN_CARD_SCENE_ROWS,
    decorativeApron: {
      top: RUN_CARD_SCENE_APRON,
      right: RUN_CARD_SCENE_APRON,
      bottom: RUN_CARD_SCENE_APRON,
      left: RUN_CARD_SCENE_APRON,
    },
    cells,
    units,
    doodads,
    props,
    floatingArtwork,
    cover,
    coverTypes,
    features: {},
    featureCuts: {},
    featureExits: {},
  };
  return {
    board,
    coverSeed,
    familyId: family.familyId,
    sceneId,
    frame,
  };
}

export interface RunCardSceneArtwork {
  src: string;
  width: number;
  height: number;
}

/**
 * The accepted enriched artwork for one card scene, if installed: an active
 * `run-card-scene` drawable whose behavior names this scene id binds its `scene` role
 * to the restyled render of the same vignette, at exactly the capture-stage native
 * size. Runtime shows the live tile scene until a slot is installed; there is no
 * generated or packaged fallback artwork.
 */
export function installedRunCardSceneArt(sceneId: string): RunCardSceneArtwork | null {
  const matches = drawableAssets('run-card-scene').filter((asset) => asset.behavior.sceneId === sceneId);
  if (matches.length > 1) {
    throw new Error(`drawable catalog has ${matches.length} installed artworks for Run card scene ${sceneId}`);
  }
  const asset = matches[0];
  if (!asset) return null;
  const scene = asset.media.scene?.media;
  if (
    !scene
    || scene.mediaType !== 'image/png'
    || scene.width !== RUN_CARD_SCENE_CAPTURE.width
    || scene.height !== RUN_CARD_SCENE_CAPTURE.height
  ) {
    throw new Error(
      `installed Run card scene ${sceneId} does not bind one native ${RUN_CARD_SCENE_CAPTURE.width}×${RUN_CARD_SCENE_CAPTURE.height} PNG scene`,
    );
  }
  return { src: scene.immutableUrl, width: scene.width, height: scene.height };
}

export function RunCardScene({
  bundle,
  className = '',
  variant = 'live',
  onLayerFirstFrame,
  onFrameError,
}: {
  bundle: Pick<PieceBundle, 'pieces'>;
  className?: string;
  /**
   * 'live' is the card face: installed enriched artwork under the mustered units when
   * a scene slot is accepted, else the tile scene without landmark overlays (floating
   * artwork always draws above units, so it belongs to generated art, not the live
   * composite). 'source' is the unit-less full scene — the art-generation seed.
   * 'guide' is the full scene including units, for with-units generation trials.
   */
  variant?: 'live' | 'source' | 'guide';
  /** First completed paint of each canvas layer — a staging host's readiness gate. */
  onLayerFirstFrame?: (layer: 'terrain' | 'scene') => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  // The canonical composition id is the sole plan input.
  const cardId = canonicalCardId(bundle);
  const plan = useMemo(
    () => runCardScenePlan(bundle),
    [cardId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const artwork = variant === 'live' ? installedRunCardSceneArt(plan.sceneId) : null;

  // The window renders the card's authored viewing pane (cover-fit), so the camera
  // needs the real window size; the board mounts only once it is measured, under the
  // painted-surface gate so nothing partial ever shows.
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = (): void => {
      const rect = viewport.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width > 0 && height > 0) {
        setViewSize((currentSize) => (
          currentSize && currentSize.width === width && currentSize.height === height
            ? currentSize
            : { width, height }
        ));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const camera = useMemo(
    () => (viewSize ? cardSceneCameraForView(plan.frame, viewSize.width, viewSize.height) : null),
    [plan.frame, viewSize],
  );
  const captureZoom = RUN_CARD_SCENE_CAPTURE.width / plan.frame.width;

  // The scene window speaks the app's painted-surface protocol: it is a loading
  // surface until every gate below has painted (both canvas layers, plus the art
  // plate when one is installed), so the Run workspace stages — which already wait
  // for `.painted-surface.is-loading` to clear — reveal draft and shop hands only
  // as complete card faces. A frame error reveals rather than strands the phase.
  const [revealed, setRevealed] = useState(false);
  const gatesRef = useRef({ terrain: false, scene: false, art: false });
  const needsArtRef = useRef(false);
  needsArtRef.current = Boolean(artwork);
  const revealIfComplete = useRef<() => void>(() => {});
  revealIfComplete.current = () => {
    const gates = gatesRef.current;
    if (gates.terrain && gates.scene && (gates.art || !needsArtRef.current)) setRevealed(true);
  };
  useEffect(() => {
    // A reused mount showing a different card (or newly installed art) re-arms its gates.
    gatesRef.current = { terrain: false, scene: false, art: false };
    setRevealed(false);
  }, [cardId, artwork?.src]);
  // Stable per-layer callbacks: the canvas layers repaint when their callbacks change
  // identity, so these must not be re-created by unrelated parent renders.
  const externalLayerRef = useRef(onLayerFirstFrame);
  externalLayerRef.current = onLayerFirstFrame;
  const externalErrorRef = useRef(onFrameError);
  externalErrorRef.current = onFrameError;
  const handleTerrainFirstFrame = useMemo(() => () => {
    gatesRef.current.terrain = true;
    revealIfComplete.current();
    externalLayerRef.current?.('terrain');
  }, []);
  const handleSceneFirstFrame = useMemo(() => () => {
    gatesRef.current.scene = true;
    revealIfComplete.current();
    externalLayerRef.current?.('scene');
  }, []);
  const handleFrameError = useMemo(() => (error: unknown) => {
    setRevealed(true);
    externalErrorRef.current?.(error);
  }, []);
  const markArtGate = useMemo(() => (image: HTMLImageElement | null) => {
    if (!image || !image.complete || image.naturalWidth <= 0) return;
    gatesRef.current.art = true;
    revealIfComplete.current();
  }, []);

  const board = useMemo(() => (
    variant === 'source'
      ? { ...plan.board, units: {} }
      : variant === 'guide'
        ? plan.board
        : artwork
          // Installed artwork already contains the whole environment; the live render
          // contributes only the units so sprites stay crisp above the painted scene.
          ? { ...plan.board, cover: {}, coverTypes: {}, props: {}, doodads: {}, floatingArtwork: [] }
          // Landmark overlays paint above units by contract, so the interim tile-scene
          // face omits them; they arrive with the generated art.
          : { ...plan.board, floatingArtwork: [] }
  ), [artwork, plan.board, variant]);
  return (
    <span
      ref={viewportRef}
      className={`run-card-scene-viewport ${className}`.trim()}
      data-scene-art={artwork ? 'installed' : 'live'}
      aria-hidden="true"
    >
      <span className={`painted-surface run-card-scene-surface ${revealed ? 'is-ready' : 'is-loading'}`}>
        <span className="painted-surface-content">
          {camera ? (
            <>
              {artwork ? (
                // A board-registered plate, not a cover-fit background: the art raster is
                // the authored frame at the capture width, and the window camera centres
                // that same frame — so scaling by the zoom ratio seats the live unit
                // sprites exactly where the captured terrain stood.
                <img
                  className="run-card-scene-art"
                  src={artwork.src}
                  width={artwork.width}
                  height={artwork.height}
                  style={{
                    transform: `translate(-50%, -50%) scale(${camera.zoom / captureZoom})`,
                  }}
                  alt=""
                  draggable={false}
                  ref={markArtGate}
                  onLoad={(event) => markArtGate(event.currentTarget)}
                  onError={() => handleFrameError(new Error(`Run card scene art failed: ${plan.sceneId}`))}
                />
              ) : null}
              {/* A card is a still: one authored frame, no sway, no repaint clock. The
                  living version of this scene belongs to gameplay boards, not to a card
                  painting. */}
              <StudioReadOnlyBoard
                board={board}
                hidden={artwork ? { tile: true, unit: false, doodad: true } : undefined}
                still
                coverScale={RUN_CARD_COVER_SCALE}
                boardZoom={camera.zoom}
                boardPan={camera.pan}
                coverSeed={plan.coverSeed}
                className="run-card-scene-board"
                ariaLabel=""
                onTerrainFirstFrame={handleTerrainFirstFrame}
                onSceneFirstFrame={handleSceneFirstFrame}
                onFrameError={handleFrameError}
              />
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}
