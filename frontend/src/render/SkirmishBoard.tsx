import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { drawableAssets } from '@chess-tactics/board-render';
import { tileFrameSrc, tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { countIllegalEdges, solveSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
import { densityFieldAt, resolveGroundCover } from '../core/groundCover';
import type { GameState, Move, Piece, Side, TerrainType, UnitFacing, Vec } from '../core/types';
import { attackedSquares, blockedCandidateSquares, enemyThreats, gameEnv, legalMoves, livingPieces } from '../core/rules';
import { PIECE_LABEL, PIECE_MARK, PLAYABLE_PIECE_TYPES, UNIT_FACINGS, defaultFacingForSide, paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import { defaultTerrainFamily, familyForGameplayTerrain, familyIdForAsset, tileSocketsForAsset, type TileFamilyId } from '../core/tileSockets';
import { usePlayerPalette } from '../settings/playerPalette';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { moveGestureInputMode } from '../game/store';
import { adminMoveTargets } from '../game/adminBattle';
import { useSkirmishView } from '../game/SkirmishViewStoreContext';
import { PLAYER_TECHNICAL_MINIMUM_ZOOM } from '../game/boardCameraPolicy';
import { provisionalBoard, premoveArrows, premoveGhosts, premoveTargets, type PremoveArrow, type PremoveStep } from '../game/premoves';
import { clientSide, opponentSide } from '../game/clientPerspective';
import { PLAYER_MOVE_PRESENTATION_MS, promotionArrivalPieces } from '../game/promotionPresentation';
import { structureArtImpact } from '../core/structureArt';
import { BoardLabBoard, boardLabCellPosition, immutableBoardLabTerrainSrc } from './BoardLabBoard';
import { PredrawnMoveHighlightPaint } from './PredrawnMoveHighlightPaint';
import { terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import {
  drawBoardOps,
  isAnimatedGroundCoverOp,
  loadCanvasImage,
  predrawnOcclusionDepthImageDimensionIssue,
  sizeCanvasForBounds,
} from './BoardCanvasLayer';
import { objectBaseZIndex } from './sceneDepth';
import { ViewPane, minimumZoomToCoverViewport, type ViewPaneViewportSize } from '../ui/shared/ViewPane';
import { PawnPromotionPicker } from '../ui/PawnPromotionPicker';
import { useBoardCameraFraming } from '../ui/shared/BoardViewFraming';
import { useBoardFrameReveal } from './boardArtReady';
import { loadingMark } from '../diagnostics/loadingTimeline';
import { groundCoverSet } from '../core/groundCover';
import { featureFrameSrc, fenceFrameSrc, fencePostSrc, wallFrameSrc } from '../art/tileset';
import { resolveFeatureOverlays, resolveFenceOverlays, resolveFencePosts, resolveWallOverlays, type FeatureKind, type FeatureMaterial, type ResolvedFeatureOverlay, type ResolvedFenceOverlay, type ResolvedFencePost, type ResolvedWallOverlay } from '../core/featureAutotile';
import { wallArtSrcs } from '../core/wallArt';
import { decodeBoard, type EditorBoard } from '../ui/boardCode';
import { unitAnchorFraction, unitAssetById } from '../ui/unitCatalog';
import {
  predrawnBoardCoverPolygon,
  runtimePredrawnBoardPlate,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardPlate,
} from './PredrawnBoardLayer';
import {
  UNIT_IMG_MAX_H,
  UNIT_IMG_MAX_W,
  BOARD_PREVIEW_ASPECT,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  effectiveBoardCameraCoverPolygon,
  boardVisualFeatures,
  boardVisualTerrainCells,
  isPredrawnBackgroundActive,
  mirrorFacingPlan,
  mirrorSurfacesForPlacements,
  isVersionedPredrawnBoardSurface,
  predrawnOcclusionDepthMapForSurface,
  predrawnOcclusionMaskOps,
  predrawnVisualFootprintClipStyleForCell,
  reflectedOpsForSubjects,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  subterrainFaceKey,
  subterrainMaterialSrc,
  unprojectBoardPoint,
  type BakeBounds,
  type BoardDrawOp,
  type BoardStructureIdentity,
  type MirrorReflectionSubject,
  type PredrawnOcclusionDepthMap,
  type TerrainSideMaterials,
  withoutBoardDrawLayers,
} from '@chess-tactics/board-render';

function terrainFamilyForGame(terrain: TerrainType | undefined): TileFamilyId | null {
  if (!terrain || terrain === 'void') return null;
  return familyForGameplayTerrain(terrain) ?? null;
}

const tileAssetById = (): Map<string, TileAsset> => new Map(tileAssets.map((asset) => [asset.id, asset]));

function isPlayablePieceType(type: Piece['type']): type is PlayablePieceType {
  return (PLAYABLE_PIECE_TYPES as readonly Piece['type'][]).includes(type);
}

type DirectionalPieceAppearance = {
  facing: UnitFacing;
  spriteForFacing: (facing: UnitFacing) => string;
};

/** Resolve the canonical eight-way appearance shared by the physical unit and every mirror face.
 * Nondirectional obstacles are deliberately excluded from the mirror subject set. */
function directionalPieceAppearance(piece: Piece): DirectionalPieceAppearance | null {
  if (isPropCollider(piece) || piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  const palette = paletteForSide(piece.side, piece.palette);
  return {
    facing: piece.facing ?? defaultFacingForSide(piece.side),
    spriteForFacing: (facing) => pieceSpritePath(piece.type as PlayablePieceType, palette, facing),
  };
}

/** Exact alternate directional assets a live canvas frame can request for the active mirror faces.
 * These must be loaded before the first paint; loading only the physical-facing sprite leaves the
 * corrected reflection absent until some unrelated later redraw. */
export function mirrorSpriteSourcesForPiece(
  piece: Piece,
  faces: readonly ('west' | 'north')[],
): string[] {
  const appearance = directionalPieceAppearance(piece);
  if (!appearance) return [];
  return faces.map((face) => appearance.spriteForFacing(
    mirrorFacingPlan(face, appearance.facing).sourceFacing,
  ));
}

// Neutral rocks: two boulder variants x 8 rotations. Pick deterministically from the
// piece id so each rock on the board looks distinct (no repeated-blob feel) yet stays
// stable across re-renders.
const ROCK_DIRECTIONS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const;
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rockSpritePath(piece: Piece): string {
  const h = hashId(piece.id);
  const variants = drawableAssets('neutral-unit-art');
  if (!variants.length) throw new Error('drawable catalog has no neutral unit art');
  const variant = variants[h % variants.length];
  const dir = ROCK_DIRECTIONS[(h >>> 5) % ROCK_DIRECTIONS.length];
  const src = variant.media[dir]?.media.immutableUrl;
  if (!src) throw new Error(`neutral unit art ${variant.id} has no ${dir} media`);
  return src;
}

// Prop colliders are neutral `rock` pieces stamped under a multi-cell prop (id `prop-…`); their
// VISUAL is the one tall PropSprite, so the collider itself must draw nothing — without this
// guard the rock branch below would paint a phantom boulder on every footprint cell.
const isPropCollider = (piece: Piece): boolean => piece.id.startsWith('prop-');

function pieceImageSrc(piece: Piece): string | null {
  if (isPropCollider(piece)) return null;
  if (piece.type === 'rock' || piece.type === 'random-rock') return rockSpritePath(piece);
  const appearance = directionalPieceAppearance(piece);
  return appearance?.spriteForFacing(appearance.facing) ?? null;
}

/** Directional frames a living piece can request after its next move. They warm in the shared
 * decoded-image cache after the current complete frame, so changing facing never rebuilds the
 * scene renderer or starts a second image lifecycle. */
export function pieceRuntimeSpriteSources(piece: Piece): string[] {
  const appearance = directionalPieceAppearance(piece);
  if (!appearance) {
    const src = pieceImageSrc(piece);
    return src ? [src] : [];
  }
  return UNIT_FACINGS.map((facing) => appearance.spriteForFacing(facing));
}

export type SkirmishTileClickIntent =
  | { kind: 'move' }
  | { kind: 'select'; pieceId: string }
  | { kind: 'focus'; pieceId: string }
  | { kind: 'clear-selection' };

/**
 * Resolve a live-board click before applying store actions. A legal destination still
 * wins over the occupant at that square (captures), and friendly pieces remain directly
 * selectable. Empty and neutral squares dismiss the current movement selection, while an
 * opponent remains an independent inspection focus.
 */
export function skirmishTileClickIntent(
  x: number,
  y: number,
  selectedMoves: readonly Pick<Move, 'x' | 'y'>[],
  occupant: Pick<Piece, 'id' | 'side'> | undefined,
  localSide: Side,
): SkirmishTileClickIntent {
  if (selectedMoves.some((move) => move.x === x && move.y === y)) return { kind: 'move' };
  if (occupant?.side === localSide) return { kind: 'select', pieceId: occupant.id };
  if (occupant && occupant.side !== 'neutral') return { kind: 'focus', pieceId: occupant.id };
  return { kind: 'clear-selection' };
}

/** Union one simulation side's overlay cells. The caller chooses sides through client perspective. */
export function skirmishArmyOverlaySet(
  pieces: readonly Piece[],
  side: Side,
  tilesFor: (piece: Piece) => readonly Vec[],
): Set<string> {
  const out = new Set<string>();
  for (const piece of livingPieces(pieces, side)) {
    for (const tile of tilesFor(piece)) out.add(`${tile.x},${tile.y}`);
  }
  return out;
}

function terrainMapForGame(game: GameState): TileFamilyId[] {
  const byKey = new Map((game.terrain ?? []).map((cell) => [`${cell.x},${cell.y}`, terrainFamilyForGame(cell.terrain)]));
  const map: TileFamilyId[] = [];
  const defaultFamilyId = defaultTerrainFamily().id;
  for (let y = 0; y < game.size.rows; y += 1) {
    for (let x = 0; x < game.size.cols; x += 1) {
      map.push(byKey.get(`${x},${y}`) ?? defaultFamilyId);
    }
  }
  return map;
}

function voidTerrainKeys(game: GameState): Set<string> {
  return new Set((game.terrain ?? []).filter((cell) => cell.terrain === 'void').map((cell) => `${cell.x},${cell.y}`));
}

function legacyFeatureMapForGame(game: GameState): Map<string, { kind: FeatureKind; material: FeatureMaterial }> | undefined {
  const map = new Map<string, { kind: FeatureKind; material: FeatureMaterial }>();
  for (const cell of game.terrain ?? []) {
    if (cell.terrain === 'road') map.set(`${cell.x},${cell.y}`, { kind: 'road', material: 'cobble' });
  }
  return map.size ? map : undefined;
}

function featureOverlaysForBoard(board: EditorBoard): Record<string, ResolvedFeatureOverlay> {
  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  return resolveFeatureOverlays(board.features, isSevered, isExit);
}

function resolveBoardCode(game: GameState): EditorBoard | null {
  if (!game.boardCode) return null;
  const board = decodeBoard(game.boardCode);
  if (!board || board.cols !== game.size.cols || board.rows !== game.size.rows) return null;
  return board;
}

function coverMapForGame(game: GameState, exactBoard: EditorBoard | null): Map<string, 'sparse' | 'filled'> {
  if (exactBoard) return new Map(Object.entries(exactBoard.cover));
  return new Map((game.terrain ?? []).filter((cell) => cell.cover).map((cell) => [`${cell.x},${cell.y}`, cell.cover!.density]));
}

function resolveSkirmishGroundCover(
  result: SocketBoardResult<TileAsset>,
  game: GameState,
  seed: number,
  exactBoard: EditorBoard | null,
): SocketBoardResult<TileAsset> {
  // Resolve ambient ground cover ONCE here (placement/build time), not per render.
  // Painted cover (level data) is authoritative; a level with NO cover painted at all
  // falls back to a low-frequency density field so generated/legacy boards still grow grass.
  const painted = coverMapForGame(game, exactBoard);
  const hasPainted = exactBoard ? true : painted.size > 0;
  // A cell painted in the editor carries the seed it was painted with, so the game renders the
  // exact arrangement the author saw. Everything else falls back to the ambient seed.
  resolveGroundCover(
    result.cells,
    (cell) => exactBoard?.coverSeeds?.[`${cell.x},${cell.y}`] ?? seed,
    (cell) => painted.get(`${cell.x},${cell.y}`) ?? (hasPainted ? null : densityFieldAt(cell.x, cell.y, seed)),
  );
  const voids = voidTerrainKeys(game);
  if (voids.size > 0) {
    for (const cell of result.cells) {
      if (!voids.has(`${cell.x},${cell.y}`)) continue;
      cell.asset = undefined;
      cell.feature = undefined;
      cell.groundCover = undefined;
      cell.missing = undefined;
    }
  }
  return result;
}

function coverMapRecordForGame(game: GameState, exactBoard: EditorBoard | null): Record<string, 'sparse' | 'filled'> {
  if (exactBoard) return { ...exactBoard.cover };
  const cover: Record<string, 'sparse' | 'filled'> = {};
  for (const cell of game.terrain ?? []) {
    if (cell.cover) cover[`${cell.x},${cell.y}`] = cell.cover.density;
  }
  return cover;
}

export function sceneBoardForSkirmish(
  game: GameState,
  board: SocketBoardResult<TileAsset>,
  exactBoard: EditorBoard | null,
): EditorBoard {
  const cells: Record<string, string> = {};
  const coverTypes: Record<string, TileFamilyId> = {};
  for (const cell of board.cells) {
    const key = `${cell.x},${cell.y}`;
    if (cell.asset) cells[key] = cell.asset.id;
    if (cell.terrain) coverTypes[key] = cell.terrain;
  }

  return {
    cols: game.size.cols,
    rows: game.size.rows,
    playerFaction: exactBoard?.playerFaction,
    factionDirections: exactBoard?.factionDirections ?? {},
    cells,
    decorativeApron: exactBoard?.decorativeApron,
    decorativeCells: exactBoard?.decorativeCells ?? {},
    decorativeFootprint: exactBoard?.decorativeFootprint ?? [],
    decorativeFeatures: exactBoard?.decorativeFeatures ?? {},
    decorativeFences: exactBoard?.decorativeFences ?? {},
    decorativeFencePosts: exactBoard?.decorativeFencePosts ?? {},
    decorativeWalls: exactBoard?.decorativeWalls ?? {},
    backgroundMode: exactBoard?.backgroundMode,
    surface: exactBoard?.surface,
    macroTiles: exactBoard?.macroTiles,
    subterrain: exactBoard?.subterrain,
    units: {},
    doodads: exactBoard?.doodads ?? {},
    props: {
      ...(exactBoard?.props ?? {}),
      ...Object.fromEntries((game.props ?? []).map((prop) => [`${prop.x},${prop.y}`, { propId: prop.propId }])),
    },
    floatingArtwork: exactBoard?.floatingArtwork ?? [],
    cover: coverMapRecordForGame(game, exactBoard),
    coverTypes: exactBoard?.coverTypes ?? coverTypes,
    features: exactBoard?.features ?? {},
    fences: exactBoard?.fences ?? {},
    fencePosts: exactBoard?.fencePosts ?? {},
    walls: exactBoard?.walls ?? {},
    wallArt: exactBoard?.wallArt ?? {},
    featureCuts: exactBoard?.featureCuts ?? {},
    featureExits: exactBoard?.featureExits ?? {},
    zoneEntries: exactBoard?.zoneEntries ?? [],
    zones: exactBoard?.zones ?? {},
    generatedRegions: exactBoard?.generatedRegions ?? [],
  };
}

/**
 * Project the complete authored visual-terrain surface into the gameplay terrain canvas.
 * SocketBoard cells remain the only semantic/hit-target cells; scenic coordinates contribute
 * pixels and topology without changing TileGrid centering or gameplay authority.
 */
export function skirmishVisualTerrainCells(
  exactBoard: EditorBoard | null,
): TerrainCanvasCell[] | undefined {
  if (!exactBoard) return undefined;
  const visualCells = boardVisualTerrainCells(exactBoard);
  const occupied = new Set(visualCells.filter((cell) => cell.tileId).map((cell) => cell.key));
  const assets = tileAssetById();
  const visualFeatures = resolveFeatureOverlays(
    boardVisualFeatures(exactBoard, visualCells),
    (edge) => exactBoard.featureCuts[edge] === true,
    (edge) => exactBoard.featureExits[edge] === true,
  );
  const freezeTerrain = visualCells.some((cell) => cell.decorative);

  return visualCells.map((cell) => {
    const asset = cell.tileId ? assets.get(cell.tileId) : undefined;
    const sideMaterials = Object.fromEntries((['south', 'east'] as const).flatMap((face) => {
      const material = exactBoard.subterrain?.[subterrainFaceKey(cell.x, cell.y, face)];
      return material ? [[face, subterrainMaterialSrc(material)]] : [];
    })) as TerrainSideMaterials<string>;
    const feature = visualFeatures[cell.key];
    return {
      key: cell.decorative ? `decorative:${cell.key}` : `${cell.x}-${cell.y}`,
      x: cell.x,
      y: cell.y,
      topSrc: asset ? terrainTopSrc(tileFrameSrc(asset), asset.topAnimFrames) : undefined,
      sideFaces: asset
        ? resolveTerrainSideFaces(
            resolveTerrainSideExposure(cell, (x, y) => occupied.has(`${x},${y}`)),
            sideMaterials,
          )
        : undefined,
      featureSrc: feature ? featureFrameSrc(feature.kind, feature.material, feature.mask) : undefined,
      topAnimFrames: asset?.topAnimFrames,
      ...(freezeTerrain ? { animate: false } : {}),
    };
  });
}

function sceneArtUrls(
  sceneBoard: EditorBoard,
  seed: number,
  ambientCover: boolean,
  predrawnBackgroundActive: boolean,
): string[] {
  return [...new Set(boardDrawOps(sceneBoard, {
    coverSeed: seed,
    ambientCover,
    predrawnBackgroundActive,
  }).map((op) => op.src))];
}

function skirmishStaticSceneOps(
  sceneBoard: EditorBoard,
  seed: number,
  ambientCover: boolean,
  predrawnBackgroundActive: boolean,
): BoardDrawOp[] {
  return withoutBoardDrawLayers(
    boardDrawOps(sceneBoard, { coverSeed: seed, ambientCover, predrawnBackgroundActive }),
    'terrain',
    'linear-feature',
  );
}

function generatedSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  return solveSocketBoard({
    assets: tileAssets,
    terrainMap: terrainMapForGame(game),
    seed,
    columns: game.size.cols,
    rows: game.size.rows,
    familyAssets: tileFamilies,
    featureMap: legacyFeatureMapForGame(game),
  });
}

function exactSkirmishBoard(
  game: GameState,
  seed: number,
  exactBoard: EditorBoard,
  base: SocketBoardResult<TileAsset>,
): SocketBoardResult<TileAsset> {
  const featureOverlays = featureOverlaysForBoard(exactBoard);
  const cells: SocketBoardCell<TileAsset>[] = base.cells.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const exactAsset = tileAssetById().get(exactBoard.cells[key]);
    const feature = featureOverlays[key] ?? undefined;
    if (!exactAsset) return { ...cell, feature };

    const terrain = familyIdForAsset(exactAsset, tileFamilies);
    return {
      ...cell,
      asset: exactAsset,
      terrain,
      sockets: tileSocketsForAsset(exactAsset, tileFamilies),
      feature,
      missing: undefined,
    };
  });

  return resolveSkirmishGroundCover({
    cells,
    fallbacks: base.fallbacks,
    stats: {
      placed: cells.length,
      missingPlacements: cells.filter((cell) => !cell.asset).length,
      illegalEdges: countIllegalEdges(cells, tileFamilies),
      candidateAssets: base.stats.candidateAssets,
    },
  }, game, seed, exactBoard);
}

export function buildSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  const base = generatedSkirmishBoard(game, seed);
  const exactBoard = resolveBoardCode(game);
  if (!exactBoard) return resolveSkirmishGroundCover(base, game, seed, null);
  return exactSkirmishBoard(game, seed, exactBoard, base);
}

// Every image URL the board will draw, split into the STABLE tile set (terrain/seed —
// unchanged by play) and the live unit set (changes on capture). The reveal arms on the
// tile signature so it fires once per board, not once per move; the full list is what we
// preload so units don't popcorn in on the first paint either. Terrain URLs match the
// sources BoardTerrainLayer consumes: split top/side frames plus feature and edge art.
function collectBoardArt(
  board: SocketBoardResult<TileAsset>,
  livePieces: readonly Piece[],
  fenceOverlays: ReadonlyMap<string, ResolvedFenceOverlay>,
  fencePosts: ReadonlyMap<string, ResolvedFencePost>,
  wallOverlays: ReadonlyMap<string, ResolvedWallOverlay>,
  wallArtUrls: readonly string[],
  sceneUrls: readonly string[],
  occlusionUrls: readonly string[],
  predrawnSrc?: string,
): { urls: string[]; signature: string } {
  const tiles = new Set<string>();
  for (const url of sceneUrls) tiles.add(url);
  for (const url of occlusionUrls) tiles.add(url);
  if (predrawnSrc) {
    tiles.add(predrawnSrc);
  } else {
    for (const fence of fenceOverlays.values()) tiles.add(fenceFrameSrc(fence.material, fence.mask));
    for (const post of fencePosts.values()) tiles.add(fencePostSrc(post.material));
    for (const wall of wallOverlays.values()) tiles.add(wallFrameSrc(wall.material, wall.mask));
    for (const url of wallArtUrls) tiles.add(url);
    for (const cell of board.cells) {
      if (cell.asset) {
        const top = tileFrameSrc(cell.asset);
        tiles.add(immutableBoardLabTerrainSrc(terrainTopSrc(top, cell.asset.topAnimFrames)));
      }
      if (cell.feature) tiles.add(featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask));
      const cover = cell.groundCover;
      if (cover) {
        const set = groundCoverSet(cell.terrain);
        if (set) for (const tuft of cover.tufts) {
          const variant = set.variants.find((entry) => entry.id === tuft.variant);
          if (variant) tiles.add(variant.src);
        }
      }
    }
  }
  const units = new Set<string>();
  for (const piece of livePieces) {
    const src = pieceImageSrc(piece);
    if (src) units.add(src);
  }
  return {
    urls: [...new Set([...tiles, ...units])],
    signature: [...tiles].sort().join('|'),
  };
}

// Deploy choreography: when the board first reveals, the armies arrive in a staggered
// wave rather than all popping in at once (see ADR — board-start unit arrival). Order is
// communication: the PLAYER force lands first (back row → forward), then the ENEMY answers
// from its edge, each wave ending on its royal piece (king/queen) as a focal accent — so the
// motion alone teaches mine-vs-theirs and turn-taking before turn 1. Neutral rocks are
// scenery, not deploying units, so they get no drop (null delay → they just appear with the
// board). Timing is bounded (~1.2s total) and presentation-only — board state and input are
// live immediately, so the sequence never gates play.
const ARRIVAL_BASE_MS = 400; // first unit lands AFTER the board reveal (veil/board fade) has finished
const ARRIVAL_WAVE_GAP_MS = 240; // the enemy wave answers this long after the player wave starts
const ARRIVAL_STEP_MS = 50; // per-unit stagger within a wave
const DEPARTURE_STEP_MS = 45;
const DEPARTURE_ANIM_MS = 760;
// Drag-to-move tuning. The threshold keeps a small wobble on a tap from becoming a drag, so
// click-select → click-move is untouched; the ghost defaults are only a fallback size for when
// the on-screen sprite can't be measured at pick-up.
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_GHOST_W = 72;
const DEFAULT_GHOST_H = 86;

const isRoyal = (type: Piece['type']): boolean => type === 'king' || type === 'queen';

/**
 * A unit's entrance, from the moment it is admitted to the board until it lands. `startMs` is
 * null while the entrance is staged but not yet released, which is how a battlefield can be
 * prepared and revealed without ever painting a unit at a seat it has not arrived in yet.
 */
export interface UnitArrivalPlan {
  startMs: number | null;
  delayMs: number;
  /** A Deployment formation owns one shared projected board-space translation from
   * its horizontal-gravity entry anchor. Ordinary drop entrances omit it. */
  startOffset?: { dx: number; dy: number };
  /** Delay of the formation's final staggered summon. Every member waits for that unit to
   * complete ADR-0045's drop before the shared horizontal slide may begin. */
  summonWaveDelayMs?: number;
}

/**
 * Unit exits are selected from this closed physical track registry. Callers name a reason and
 * normally accept its default; an authored context may explicitly choose another registered
 * track, but may not supply an arbitrary motion curve.
 */
export const UNIT_DEPARTURE_TRACKS = ['withdraw-home', 'withdraw-nearest-edge'] as const;
export type UnitDepartureTrack = typeof UNIT_DEPARTURE_TRACKS[number];
export type UnitDepartureReason = 'deployment-reroll';

export interface UnitDepartureRequest {
  id: string;
  reason: UnitDepartureReason;
  track?: UnitDepartureTrack;
}

export function unitDepartureTrack(request: UnitDepartureRequest): UnitDepartureTrack {
  if (request.track) return request.track;
  switch (request.reason) {
    case 'deployment-reroll': return 'withdraw-home';
  }
}

export interface UnitDeparturePlan {
  requestId: string;
  track: UnitDepartureTrack;
  startMs: number;
  delayMs: number;
  durationMs: number;
  startLeft: number;
  startTop: number;
  endLeft: number;
  endTop: number;
  startOpacity: number;
  facing: UnitFacing;
}

function nearestEdgeDestination(
  piece: Piece,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): { x: number; y: number; facing: UnitFacing } {
  const candidates = [
    { distance: piece.x + 1, x: -2.5, y: piece.y, facing: 'west' as const },
    { distance: board.cols - piece.x, x: board.cols + 1.5, y: piece.y, facing: 'east' as const },
    { distance: piece.y + 1, x: piece.x, y: -2.5, facing: 'north' as const },
    { distance: board.rows - piece.y, x: piece.x, y: board.rows + 1.5, facing: 'south' as const },
  ];
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates[0];
}

export function unitDepartureDestination(
  piece: Piece,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
  track: UnitDepartureTrack,
): { left: number; top: number; facing: UnitFacing } {
  const destination = track === 'withdraw-home'
    ? piece.side === 'enemy'
      ? { x: piece.x, y: -2.5, facing: 'north' as const }
      : { x: piece.x, y: board.rows + 1.5, facing: 'south' as const }
    : nearestEdgeDestination(piece, board);
  return { ...boardLabCellPosition(destination), facing: destination.facing };
}

export function unitDeparturePose(
  timeMs: number,
  plan: UnitDeparturePlan,
): { left: number; top: number; opacity: number; active: boolean } {
  const progress = clamp01((timeMs - plan.startMs - plan.delayMs) / plan.durationMs);
  const travel = easeInQuad(progress);
  return {
    left: lerp(plan.startLeft, plan.endLeft, travel),
    top: lerp(plan.startTop, plan.endTop, travel),
    opacity: plan.startOpacity * clamp01(progress < 0.84 ? 1 : 1 - (progress - 0.84) / 0.16),
    active: progress < 1,
  };
}

/**
 * Where a battlefield is in its unit-entrance lifecycle. `pending` is a battlefield that will
 * play an entrance but has not been activated for it: preparation and reveal both happen here,
 * so the units it is about to introduce are already staged off the board. `active` releases
 * them. `settled` is a review of a position whose units have already arrived, so it admits them
 * directly at their seats. Scene activation gates the MOTION (ADR-0353); it must not gate the
 * staging, because the scene entrance reveals the board before it activates it.
 */
export type UnitArrivalLifecycle = 'pending' | 'active' | 'settled';
export type UnitArrivalTrack = 'drop' | 'slide-from-right';

export function unitArrivalPlan(
  lifecycle: UnitArrivalLifecycle,
  now: number,
  delayMs: number,
): UnitArrivalPlan | undefined {
  if (lifecycle === 'settled') return undefined;
  return {
    startMs: lifecycle === 'active' ? now : null,
    delayMs,
  };
}

export function computeArrivalDelays(
  pieces: readonly Piece[],
  baseDelayMs = ARRIVAL_BASE_MS,
): Map<string, number> {
  const delays = new Map<string, number>();
  (['player', 'enemy'] as const).forEach((side, wave) => {
    const group = pieces.filter((p) => p.side === side && p.type !== 'rock' && p.type !== 'random-rock');
    // Order within the wave: by rows out from the home edge (startY), royals last.
    group.sort((a, b) => {
      if (isRoyal(a.type) !== isRoyal(b.type)) return isRoyal(a.type) ? 1 : -1;
      const da = Math.abs(a.y - (a.startY ?? a.y));
      const db = Math.abs(b.y - (b.startY ?? b.y));
      return da !== db ? da - db : a.x - b.x;
    });
    const waveBase = baseDelayMs + wave * ARRIVAL_WAVE_GAP_MS;
    group.forEach((p, i) => delays.set(p.id, waveBase + i * ARRIVAL_STEP_MS));
  });
  return delays;
}

// Board assembly: the placed OBSTACLES land before the armies do. ADR-0045 gave the units a
// staggered drop and left every prop as scenery that was simply already there; a board whose
// rocks arrive the same way reads as being ASSEMBLED — ground, then the shape of the position,
// then the pieces that have to solve it. Rocks are the obstacle that defines a position, so they
// take part; trees and houses stay dressing (widen `structureArrives` to change that). The whole
// set lands inside the reveal beat, before ARRIVAL_BASE_MS frees the first unit.
const STRUCTURE_ARRIVAL_BASE_MS = 130;
const STRUCTURE_ARRIVAL_STEP_MS = 55;
// The impact reads as one event, not a performance: it resolves inside the deploy wave rather
// than trailing behind it, and what it leaves is permanent.
export const STRUCTURE_IMPACT_MS = 320;

/** Which placed props take part in the board-assembly drop. */
export function structureArrives(structure: BoardStructureIdentity): boolean {
  return structure.kind === 'rock';
}

/**
 * Depth-ordered entrance for a board's obstacles: the far corner lands first and the wave runs
 * toward the player, matching the isometric depth order the same ops are painted in — so the
 * position lays itself down rather than flickering in at random.
 */
export function computeStructureArrivalDelays(
  structures: readonly BoardStructureIdentity[],
  baseDelayMs = STRUCTURE_ARRIVAL_BASE_MS,
): Map<string, number> {
  const delays = new Map<string, number>();
  [...structures]
    .sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x)
    .forEach((structure, index) => delays.set(structure.key, baseDelayMs + index * STRUCTURE_ARRIVAL_STEP_MS));
  return delays;
}

/** The arriving props of a board, one entry per placed anchor (a prop draws several ops). */
export function arrivingStructures(ops: readonly BoardDrawOp[]): Map<string, BoardStructureIdentity> {
  const structures = new Map<string, BoardStructureIdentity>();
  for (const op of ops) {
    if (op.structure && structureArrives(op.structure)) structures.set(op.structure.key, op.structure);
  }
  return structures;
}

/** Apply a prop's entrance to one of its draw ops. Every op of the same anchor takes the SAME
 * offset, so a flat-contact prop's two depth halves cannot shear apart mid-fall. */
export function structureArrivalOp(
  op: BoardDrawOp,
  plan: UnitArrivalPlan | undefined,
  timeMs: number,
): BoardDrawOp {
  if (!plan) return op;
  const arrival = arrivalOffset(timeMs, plan);
  if (arrival.dy === 0 && arrival.opacity >= 1) return op;
  return { ...op, dy: op.dy + arrival.dy, opacity: (op.opacity ?? 1) * arrival.opacity };
}

/**
 * The moment a prop's fall reaches the ground — where the impact belongs. This is NOT the end of
 * the arrival duration: the fall curve touches down at ARRIVAL_CONTACT_PROGRESS and spends its
 * remaining time on the settle ADR-0045 describes. Timing an impact off the full duration leaves
 * the prop sitting on the ground for the difference before it reacts, which reads as a crack that
 * arrives late rather than as an impact at all.
 */
export function structureLandingMs(plan: UnitArrivalPlan): number | null {
  return plan.startMs == null
    ? null
    : plan.startMs + plan.delayMs + ARRIVAL_ANIM_MS * ARRIVAL_CONTACT_PROGRESS;
}

/**
 * Redirect a landed prop's op at its impact sheet. The sheet's first frame IS the resting
 * drawing, so this can be applied from the landing moment onward forever: during the impact it
 * advances, and after it holds the last frame, which is what the prop looks like from then on.
 * Props with no sheet, and props still in the air, are returned untouched.
 */
export function structureImpactOp(
  op: BoardDrawOp,
  landedAtMs: number | undefined,
  timeMs: number,
  durationMs = STRUCTURE_IMPACT_MS,
): BoardDrawOp {
  if (landedAtMs == null || timeMs < landedAtMs || !op.structure || op.sw == null) return op;
  const impact = structureArtImpact(op.structure.artId);
  if (!impact || impact.frameWidth !== op.sw) return op;
  return {
    ...op,
    src: impact.src,
    animation: {
      kind: 'structure-impact',
      frameCount: impact.frameCount,
      durationMs,
      startMs: landedAtMs,
    },
  };
}

/** Return only units which have newly joined the visible position. A retained battlefield uses
 * this identity boundary to animate arrivals without replaying the units already standing there. */
export function newlyVisibleArrivalPieces(
  previouslyVisibleIds: ReadonlySet<string>,
  pieces: readonly Piece[],
): Piece[] {
  return pieces.filter((piece) => (
    piece.side !== 'neutral'
    && piece.type !== 'rock'
    && piece.type !== 'random-rock'
    && !previouslyVisibleIds.has(piece.id)
  ));
}

// The queued premove chain, drawn chess.com-style: one arrow per step, from the piece's
// provisional square to its destination. Rendered inside the board's transformed space
// (the same board projection as the scene canvas) so it tracks zoom/pan for free.
// Placeholder art — a flat stroked line + arrowhead — pending a richer treatment.
function PremoveArrowLayer({ arrows }: { arrows: PremoveArrow[] }) {
  if (!arrows.length) return null;
  return (
    <svg
      className="premove-arrow-layer"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 32000 }}
      aria-hidden="true"
    >
      <defs>
        <marker id="premove-arrowhead" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="premove-arrowhead-fill" />
        </marker>
      </defs>
      {arrows.map((arrow, i) => {
        const from = boardLabCellPosition(arrow.from);
        const to = boardLabCellPosition(arrow.to);
        return (
          <line
            key={`${arrow.from.x},${arrow.from.y}->${arrow.to.x},${arrow.to.y}-${i}`}
            x1={from.left}
            y1={from.top}
            x2={to.left}
            y2={to.top}
            className="premove-arrow"
            markerEnd="url(#premove-arrowhead)"
          />
        );
      })}
    </svg>
  );
}

// When more than one unit plans the same tile, the tile is SPLIT between them (up to 4) —
// symmetric board-space offsets (px) from the tile centre + a scale so they fit side by side.
const GHOST_SLOTS: Record<number, ReadonlyArray<{ dx: number; dy: number }>> = {
  1: [{ dx: 0, dy: 0 }],
  2: [{ dx: -18, dy: 0 }, { dx: 18, dy: 0 }],
  3: [{ dx: 0, dy: -11 }, { dx: -18, dy: 9 }, { dx: 18, dy: 9 }],
  4: [{ dx: -17, dy: -10 }, { dx: 17, dy: -10 }, { dx: -17, dy: 10 }, { dx: 17, dy: 10 }],
};
const ghostScaleFor = (count: number): number => (count >= 3 ? 0.5 : count === 2 ? 0.62 : 1);

const UNIT_SEAT_W = 72;
const UNIT_SEAT_H = 86;
// Neutral rocks are local obstacle art, not one of the six live-catalog chess families.
// Keep the legacy board-seat contact point that positioned them before live unit anchors.
const ROCK_ANCHOR_X = 0.5;
const ROCK_ANCHOR_Y = 0.78;
const SCENE_BOUNDS_PAD = 96;
const ARRIVAL_ANIM_MS = 620;
/** Where in the fall the sprite reaches the ground. The remainder of the duration is the settle,
 *  so anything that happens ON CONTACT — an impact, a sound, dust — keys off this, not the end. */
export const ARRIVAL_CONTACT_PROGRESS = 0.82;
/** The whole entrance, fall through impact — what a review surface has to be able to replay. */
export const STRUCTURE_ENTRANCE_MS = ARRIVAL_ANIM_MS + STRUCTURE_IMPACT_MS;
const FORMATION_SLIDE_ANIM_MS = 560;
const ZERO_BOARD_DELTA: Vec = { x: 0, y: 0 };

type PieceMotion = {
  gridX: number;
  gridY: number;
  startLeft: number;
  startTop: number;
  targetLeft: number;
  targetTop: number;
  startTime: number;
  duration: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeInQuad(t: number): number {
  const v = clamp01(t);
  return v * v;
}

function motionSeat(motion: PieceMotion, timeMs: number): { left: number; top: number; progress: number; active: boolean } {
  if (motion.duration <= 0) return { left: motion.targetLeft, top: motion.targetTop, progress: 1, active: false };
  const progress = clamp01((timeMs - motion.startTime) / motion.duration);
  const eased = easeOutCubic(progress);
  return {
    left: lerp(motion.startLeft, motion.targetLeft, eased),
    top: lerp(motion.startTop, motion.targetTop, eased),
    progress,
    active: progress < 1,
  };
}

/** Build a live mirror subject from the animated seat itself, so corridor membership changes at
 * the exact point where a moving piece crosses a grid-axis boundary rather than at move commit. */
export function mirrorSubjectForSeat(
  op: BoardDrawOp,
  seat: { left: number; top: number },
  piece: Piece,
): MirrorReflectionSubject | null {
  const appearance = directionalPieceAppearance(piece);
  if (!appearance) return null;
  return {
    op,
    grid: unprojectBoardPoint(seat),
    seat,
    ...appearance,
  };
}

function moveHopOffset(progress: number, side: Piece['side']): number {
  const peak = side === 'enemy' ? -12 : -16;
  if (progress <= 0 || progress >= 1) return 0;
  return Math.sin(progress * Math.PI) * peak;
}

export function arrivalOffset(
  timeMs: number,
  plan: UnitArrivalPlan | undefined,
  track: UnitArrivalTrack = 'drop',
): { dx: number; dy: number; opacity: number } {
  // No plan means this piece is scenery, or its arrival has already finished: it stands seated.
  if (!plan) return { dx: 0, dy: 0, opacity: 1 };
  const staged = track === 'slide-from-right'
    ? { dx: plan.startOffset?.dx ?? 160, dy: (plan.startOffset?.dy ?? 90) - 60, opacity: 0 }
    : { dx: 0, dy: -60, opacity: 0 };
  // Staged but not yet released. Every unit waits invisibly above the seat it will summon onto;
  // a Run formation's seats happen to be beyond the board's right edge.
  if (plan.startMs == null) return staged;
  const activeElapsed = timeMs - plan.startMs;
  const summonOffset = (elapsed: number): { dy: number; opacity: number } => {
    if (elapsed < 0) return { dy: -60, opacity: 0 };
    const progress = clamp01(elapsed / ARRIVAL_ANIM_MS);
    if (progress < 0.26) return { dy: -60, opacity: progress / 0.26 };
    if (progress < 0.46) return { dy: -60, opacity: 1 };
    if (progress < ARRIVAL_CONTACT_PROGRESS) {
      const fall = easeInQuad((progress - 0.46) / 0.36);
      return { dy: lerp(-60, 0, fall), opacity: 1 };
    }
    return { dy: 0, opacity: 1 };
  };
  if (track === 'slide-from-right') {
    const start = plan.startOffset ?? { dx: 160, dy: 90 };
    const slideStartMs = (plan.summonWaveDelayMs ?? plan.delayMs) + ARRIVAL_ANIM_MS;
    if (activeElapsed < slideStartMs) {
      const summon = summonOffset(activeElapsed - plan.delayMs);
      return { dx: start.dx, dy: start.dy + summon.dy, opacity: summon.opacity };
    }
    // Only the complete, landed silhouette may move. From here every member shares the same
    // clock and canonical board-x vector, so the stagger cannot shear the formation.
    const slide = easeInQuad((activeElapsed - slideStartMs) / FORMATION_SLIDE_ANIM_MS);
    return {
      dx: lerp(start.dx, 0, slide),
      dy: lerp(start.dy, 0, slide),
      opacity: 1,
    };
  }
  return { dx: 0, ...summonOffset(activeElapsed - plan.delayMs) };
}

export function pieceOp(
  piece: Piece,
  seat: { left: number; top: number },
  options: { dx?: number; dy?: number; opacity?: number; scale?: number } = {},
): BoardDrawOp | null {
  const src = pieceImageSrc(piece);
  if (!src) return null;
  const instanceScale = options.scale ?? 1;
  const unit = unitAssetById(piece.type);
  const isRock = piece.type === 'rock' || piece.type === 'random-rock';
  if (!unit && !isRock) throw new Error(`live unit metadata is missing: ${piece.type}`);
  if (isRock) {
    const dw = UNIT_SEAT_W * instanceScale;
    const dh = UNIT_SEAT_H * instanceScale;
    return {
      layer: 'scene',
      src,
      dx: seat.left - dw * ROCK_ANCHOR_X + (options.dx ?? 0),
      dy: seat.top - dh * ROCK_ANCHOR_Y + (options.dy ?? 0),
      dw,
      dh,
      z: objectBaseZIndex(piece),
      contain: true,
      opacity: options.opacity,
    };
  }
  const logicalScale = instanceScale * (unit!.defaultScale / 100);
  const seatScale = logicalScale * (unit!.nativeScalePercent / 100);
  const seatW = UNIT_SEAT_W * seatScale;
  const seatH = UNIT_SEAT_H * seatScale;
  const imageW = Math.min(UNIT_IMG_MAX_W, unit!.footprint.sourceCanvasPx) * logicalScale;
  const imageH = Math.min(UNIT_IMG_MAX_H, unit!.footprint.sourceCanvasHeightPx) * logicalScale;
  const seatLeft = seat.left - seatW * unitAnchorFraction(unit!.unitAnchorX);
  const seatTop = seat.top - seatH * unitAnchorFraction(unit!.unitAnchorY);
  return {
    layer: 'scene',
    src,
    dx: seatLeft + (seatW - imageW) / 2 + (options.dx ?? 0),
    dy: seatTop + (seatH - imageH) / 2 + (options.dy ?? 0),
    dw: imageW,
    dh: imageH,
    z: objectBaseZIndex(piece),
    contain: true,
    opacity: options.opacity,
  };
}

function padBounds(bounds: BakeBounds): BakeBounds {
  return {
    minX: bounds.minX - SCENE_BOUNDS_PAD,
    minY: bounds.minY - SCENE_BOUNDS_PAD,
    width: bounds.width + SCENE_BOUNDS_PAD * 2,
    height: bounds.height + SCENE_BOUNDS_PAD * 2,
  };
}

/**
 * Keep Skirmish's animated scene compositor behind the same immutable-depth validation as the
 * shared canvas layer. The callbacks make the ordering explicit: invalid persisted bytes can
 * neither reach the compositor nor acknowledge the scene as ready.
 */
export function commitSkirmishSceneFirstFrame(
  occlusionDepthMap: PredrawnOcclusionDepthMap | undefined,
  images: ReadonlyMap<string, Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'>>,
  composite: () => void,
  acknowledge: () => void,
): void {
  const dimensionIssue = predrawnOcclusionDepthImageDimensionIssue(
    occlusionDepthMap,
    occlusionDepthMap ? images.get(occlusionDepthMap.src) : undefined,
  );
  if (dimensionIssue) throw new Error(dimensionIssue);
  composite();
  acknowledge();
}

function SkirmishSceneLayer({
  sceneBoard,
  seed,
  ambientCover,
  livePieces,
  previewPieces,
  unitArrivals,
  unitArrivalTrack,
  unitArrivalStartDelta,
  onArrivingUnitIdsChange,
  unitDeparture,
  onDepartingUnitIdsChange,
  onUnitDepartureComplete,
  draggingId,
  noHopId,
  premovedIds,
  afterGhosts,
  occlusionMasks,
  occlusionDepthMap,
  predrawnBackgroundActive,
  onFirstFrame,
  onFrameError,
}: {
  sceneBoard: EditorBoard;
  seed: number;
  ambientCover: boolean;
  livePieces: readonly Piece[];
  previewPieces: readonly Piece[];
  unitArrivals: UnitArrivalLifecycle;
  unitArrivalTrack: UnitArrivalTrack;
  unitArrivalStartDelta: Vec;
  onArrivingUnitIdsChange: (unitIds: readonly string[]) => void;
  unitDeparture: UnitDepartureRequest | null;
  onDepartingUnitIdsChange: (unitIds: readonly string[]) => void;
  onUnitDepartureComplete: (requestId: string) => void;
  draggingId: string | null;
  noHopId: string | null;
  premovedIds: ReadonlySet<string>;
  afterGhosts: ReturnType<typeof premoveGhosts>;
  occlusionMasks: readonly BoardDrawOp[];
  occlusionDepthMap?: PredrawnOcclusionDepthMap;
  predrawnBackgroundActive: boolean;
  onFirstFrame: () => void;
  onFrameError: (error: unknown) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionRef = useRef<Map<string, PieceMotion>>(new Map());
  const visibleUnitIdsRef = useRef<Set<string>>(new Set());
  const arrivalPlansRef = useRef<Map<string, UnitArrivalPlan>>(new Map());
  const departurePlansRef = useRef<Map<string, UnitDeparturePlan>>(new Map());
  const visibleStructureKeysRef = useRef<Set<string>>(new Set());
  const structureArrivalPlansRef = useRef<Map<string, UnitArrivalPlan>>(new Map());
  const structureLandingRef = useRef<Map<string, number>>(new Map());
  const structureLifecycleStartedRef = useRef(false);
  const arrivalLifecycleStartedRef = useRef(false);
  const reportedArrivalIdsRef = useRef('');
  const reportedDepartureIdsRef = useRef('');
  const handledDepartureRequestRef = useRef<string | null>(null);
  const completedDepartureRequestRef = useRef<string | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const acknowledgementFrameRef = useRef<number | null>(null);
  const acknowledgedFrameKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const paintFrameRef = useRef<(timeMs: number) => void>(() => {});
  const staticOps = useMemo(
    () => skirmishStaticSceneOps(sceneBoard, seed, ambientCover, predrawnBackgroundActive),
    [ambientCover, predrawnBackgroundActive, sceneBoard, seed],
  );
  const mirrorSurfaces = useMemo(
    () => mirrorSurfacesForPlacements(sceneBoard.wallArt, { cols: sceneBoard.cols, rows: sceneBoard.rows })
      .filter((surface) => surface.segments.every((segment) => !segment.edge || Boolean(sceneBoard.walls?.[segment.edge]))),
    [sceneBoard],
  );
  // The bitmap geometry belongs to the static board, not to whichever unit currently reaches
  // furthest. React changing a canvas width/height attribute clears its backing store; deriving
  // those attributes from live piece positions was the intermittent whole-scene blank on moves.
  // Use the complete logical terrain footprint even when a pre-drawn plate suppresses those
  // terrain pixels, because live pieces still need seats at every playable edge of that plate.
  const bounds = useMemo(
    () => padBounds(boardBounds({
      ...sceneBoard,
      backgroundMode: 'legacy',
      surface: undefined,
    }, {
      coverSeed: seed,
      ambientCover,
      predrawnBackgroundActive: false,
    })),
    [ambientCover, sceneBoard, seed],
  );
  const mirrorFaces = useMemo(
    () => [...new Set(mirrorSurfaces.map((surface) => surface.face))],
    [mirrorSurfaces],
  );
  // A prop's impact sheet is a source no static op names — the op only points at it once the
  // prop has landed. It has to be decoded before then, because the compositor skips an op whose
  // image is not ready, which reads as the rock disappearing at the moment it touches down.
  const impactSources = useMemo(() => [...new Set(
    staticOps.flatMap((op) => {
      const src = op.structure ? structureArtImpact(op.structure.artId)?.src : undefined;
      return src ? [src] : [];
    }),
  )], [staticOps]);
  const requiredSources = useMemo(() => [...new Set([
    ...staticOps.map((op) => op.src),
    ...impactSources,
    ...occlusionMasks.map((op) => op.src),
    ...(occlusionDepthMap ? [occlusionDepthMap.src] : []),
    ...livePieces.map(pieceImageSrc).filter((src): src is string => !!src),
    ...previewPieces.map(pieceImageSrc).filter((src): src is string => !!src),
    ...afterGhosts.flatMap((group) => group.pieces.map(pieceImageSrc)).filter((src): src is string => !!src),
    ...livePieces.flatMap((piece) => mirrorSpriteSourcesForPiece(piece, mirrorFaces)),
  ])].sort(), [afterGhosts, livePieces, mirrorFaces, occlusionDepthMap, occlusionMasks, previewPieces, staticOps]);
  const requiredSourceKey = requiredSources.join('|');
  const warmSources = useMemo(
    () => [...new Set(livePieces.flatMap(pieceRuntimeSpriteSources))].sort(),
    [livePieces],
  );
  const warmSourceKey = warmSources.join('|');
  const frameKey = useMemo(
    () => `${seed}:${boardContentHash(sceneBoard)}:${predrawnBackgroundActive ? 1 : 0}:${occlusionDepthMap?.src ?? ''}`,
    [occlusionDepthMap?.src, predrawnBackgroundActive, sceneBoard, seed],
  );
  const frameStateRef = useRef({
    staticOps,
    mirrorSurfaces,
    bounds,
    livePieces,
    previewPieces,
    draggingId,
    premovedIds,
    afterGhosts,
    occlusionMasks,
    occlusionDepthMap,
    requiredSources,
    hasAnimatedGroundCover: staticOps.some(isAnimatedGroundCoverOp),
    frameKey,
    onFirstFrame,
    onFrameError,
    unitDeparture,
    onUnitDepartureComplete,
    unitArrivalTrack,
  });

  const requestSceneFrame = useCallback(() => {
    if (!mountedRef.current || animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame((timeMs) => {
      animationFrameRef.current = null;
      paintFrameRef.current(timeMs);
    });
  }, []);

  const reportArrivingUnits = useCallback(() => {
    const ids = [...arrivalPlansRef.current.keys()].sort();
    const key = ids.join(',');
    if (key === reportedArrivalIdsRef.current) return;
    reportedArrivalIdsRef.current = key;
    onArrivingUnitIdsChange(ids);
  }, [onArrivingUnitIdsChange]);

  const reportDepartingUnits = useCallback(() => {
    const ids = [...departurePlansRef.current.keys()].sort();
    const key = ids.join(',');
    if (key === reportedDepartureIdsRef.current) return;
    reportedDepartureIdsRef.current = key;
    onDepartingUnitIdsChange(ids);
  }, [onDepartingUnitIdsChange]);

  useLayoutEffect(() => {
    frameStateRef.current = {
      staticOps,
      mirrorSurfaces,
      bounds,
      livePieces,
      previewPieces,
      draggingId,
      premovedIds,
      afterGhosts,
      occlusionMasks,
      occlusionDepthMap,
      requiredSources,
      hasAnimatedGroundCover: staticOps.some(isAnimatedGroundCoverOp),
      frameKey,
      onFirstFrame,
      onFrameError,
      unitDeparture,
      onUnitDepartureComplete,
      unitArrivalTrack,
    };
    if (acknowledgedFrameKeyRef.current !== frameKey && acknowledgementFrameRef.current !== null) {
      window.cancelAnimationFrame(acknowledgementFrameRef.current);
      acknowledgementFrameRef.current = null;
    }
    const now = performance.now();
    if (!unitDeparture && handledDepartureRequestRef.current !== null) {
      departurePlansRef.current.clear();
      handledDepartureRequestRef.current = null;
      completedDepartureRequestRef.current = null;
      reportDepartingUnits();
    }
    if (unitDeparture && handledDepartureRequestRef.current !== unitDeparture.id) {
      departurePlansRef.current.clear();
      handledDepartureRequestRef.current = unitDeparture.id;
      completedDepartureRequestRef.current = null;
      const track = unitDepartureTrack(unitDeparture);
      const departingPieces = livePieces.filter((piece) => (
        piece.side !== 'neutral'
        && piece.type !== 'rock'
        && piece.type !== 'random-rock'
      ));
      departingPieces.forEach((piece, index) => {
        const target = boardLabCellPosition(piece);
        const motion = motionRef.current.get(piece.id);
        const seated = motion ? motionSeat(motion, now) : { ...target, progress: 1, active: false };
        const arrivalTrack = unitArrivalTrack === 'slide-from-right' && piece.side === 'player'
          ? 'slide-from-right'
          : 'drop';
        const arrival = arrivalOffset(now, arrivalPlansRef.current.get(piece.id), arrivalTrack);
        const destination = unitDepartureDestination(piece, sceneBoard, track);
        departurePlansRef.current.set(piece.id, {
          requestId: unitDeparture.id,
          track,
          startMs: now,
          delayMs: index * DEPARTURE_STEP_MS,
          durationMs: DEPARTURE_ANIM_MS,
          startLeft: seated.left + arrival.dx,
          startTop: seated.top + arrival.dy,
          endLeft: destination.left,
          endTop: destination.top,
          startOpacity: arrival.opacity,
          facing: destination.facing,
        });
        // Reroll is now the unit's active lifecycle. An arrival cannot keep settling while the
        // same identity is physically withdrawing from the battlefield.
        arrivalPlansRef.current.delete(piece.id);
      });
      reportArrivingUnits();
      reportDepartingUnits();
    }
    const nextIds = new Set(livePieces.map((piece) => piece.id));
    for (const id of visibleUnitIdsRef.current) {
      if (!nextIds.has(id)) visibleUnitIdsRef.current.delete(id);
    }
    for (const id of arrivalPlansRef.current.keys()) {
      if (!nextIds.has(id)) arrivalPlansRef.current.delete(id);
    }
    const additions = newlyVisibleArrivalPieces(visibleUnitIdsRef.current, livePieces);
    // A cold board keeps ADR-0045's reveal beat. Once this mounted battlefield is visible,
    // later additions begin immediately: a Discipline click and Battle promotion are already
    // the event that communicates why those pieces are entering.
    const delays = computeArrivalDelays(
      additions,
      arrivalLifecycleStartedRef.current ? 0 : ARRIVAL_BASE_MS,
    );
    const formationAdditions = unitArrivalTrack === 'slide-from-right'
      ? additions.filter((piece) => piece.side === 'player')
      : [];
    const projectedEntryDelta = boardLabCellPosition(unitArrivalStartDelta);
    const formationOffset = { dx: projectedEntryDelta.left, dy: projectedEntryDelta.top };
    const summonWaveDelayMs = formationAdditions.length
      ? Math.max(...formationAdditions.map((piece) => delays.get(piece.id) ?? 0))
      : 0;
    for (const piece of livePieces) visibleUnitIdsRef.current.add(piece.id);
    arrivalLifecycleStartedRef.current = true;
    // Admission happens whether or not the entrance may play yet, so a battlefield preparing
    // behind a scene transition already knows these units are off the board. Activation then
    // releases everything staged so far as one wave. A terminal review is different: those
    // units have already arrived, so it deliberately owns no arrival plans at all.
    if (unitArrivals === 'settled') arrivalPlansRef.current.clear();
    for (const piece of additions) {
      const plan = unitArrivalPlan(unitArrivals, now, delays.get(piece.id) ?? 0);
      if (plan) {
        arrivalPlansRef.current.set(piece.id, piece.side === 'player' && unitArrivalTrack === 'slide-from-right'
          ? { ...plan, startOffset: formationOffset, summonWaveDelayMs }
          : plan);
      }
    }
    if (unitArrivals === 'active') {
      for (const [pieceId, plan] of arrivalPlansRef.current) {
        if (plan.startMs == null) arrivalPlansRef.current.set(pieceId, { ...plan, startMs: now });
      }
    }
    reportArrivingUnits();

    // The board's obstacles follow the same admission → staging → activation path as the units,
    // keyed by their anchor cell instead of a piece id. A prop that was already standing when
    // this battlefield was retained is not re-dropped, and a settled review owns no prop plans
    // at all, for the same reason its units own none.
    const nextStructures = arrivingStructures(staticOps);
    for (const key of visibleStructureKeysRef.current) {
      if (!nextStructures.has(key)) visibleStructureKeysRef.current.delete(key);
    }
    for (const key of structureArrivalPlansRef.current.keys()) {
      if (!nextStructures.has(key)) structureArrivalPlansRef.current.delete(key);
    }
    for (const key of structureLandingRef.current.keys()) {
      if (!nextStructures.has(key)) structureLandingRef.current.delete(key);
    }
    const structureAdditions = [...nextStructures.values()]
      .filter((structure) => !visibleStructureKeysRef.current.has(structure.key));
    const structureDelays = computeStructureArrivalDelays(
      structureAdditions,
      structureLifecycleStartedRef.current ? 0 : STRUCTURE_ARRIVAL_BASE_MS,
    );
    for (const key of nextStructures.keys()) visibleStructureKeysRef.current.add(key);
    structureLifecycleStartedRef.current = true;
    if (unitArrivals === 'settled') structureArrivalPlansRef.current.clear();
    for (const structure of structureAdditions) {
      const plan = unitArrivalPlan(unitArrivals, now, structureDelays.get(structure.key) ?? 0);
      if (plan) structureArrivalPlansRef.current.set(structure.key, plan);
    }
    if (unitArrivals === 'active') {
      for (const [key, plan] of structureArrivalPlansRef.current) {
        const released = plan.startMs == null ? { ...plan, startMs: now } : plan;
        if (plan.startMs == null) structureArrivalPlansRef.current.set(key, released);
        const landing = structureLandingMs(released);
        if (landing != null && !structureLandingRef.current.has(key)) structureLandingRef.current.set(key, landing);
      }
    }
    for (const piece of livePieces) {
      const target = boardLabCellPosition(piece);
      const existing = motionRef.current.get(piece.id);
      if (!existing) {
        motionRef.current.set(piece.id, {
          gridX: piece.x,
          gridY: piece.y,
          startLeft: target.left,
          startTop: target.top,
          targetLeft: target.left,
          targetTop: target.top,
          startTime: now,
          duration: 0,
        });
        continue;
      }
      if (existing.gridX === piece.x && existing.gridY === piece.y) continue;
      const current = motionSeat(existing, now);
      const snap = noHopId === piece.id;
      motionRef.current.set(piece.id, {
        gridX: piece.x,
        gridY: piece.y,
        startLeft: snap ? target.left : current.left,
        startTop: snap ? target.top : current.top,
        targetLeft: target.left,
        targetTop: target.top,
        startTime: now,
        duration: snap ? 0 : piece.side === 'enemy' ? 460 : PLAYER_MOVE_PRESENTATION_MS,
      });
    }
    for (const id of motionRef.current.keys()) {
      if (!nextIds.has(id)) motionRef.current.delete(id);
    }
    if (requiredSources.every((src) => imagesRef.current.has(src))) requestSceneFrame();
  }, [
    afterGhosts,
    bounds,
    draggingId,
    frameKey,
    livePieces,
    mirrorSurfaces,
    noHopId,
    occlusionDepthMap,
    occlusionMasks,
    onFirstFrame,
    reportArrivingUnits,
    onFrameError,
    premovedIds,
    previewPieces,
    requestSceneFrame,
    requiredSourceKey,
    reportDepartingUnits,
    staticOps,
    unitDeparture,
    unitArrivalStartDelta,
    unitArrivalTrack,
    unitArrivals,
  ]);

  useLayoutEffect(() => {
    paintFrameRef.current = (timeMs: number): void => {
      const state = frameStateRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || state.requiredSources.some((src) => !imagesRef.current.has(src))) return;

      try {
        const ops: BoardDrawOp[] = state.staticOps.map((op) => {
          if (!op.structure) return op;
          const seated = structureArrivalOp(op, structureArrivalPlansRef.current.get(op.structure.key), timeMs);
          // Landing outlives the arrival plan — the plan is discarded once the fall ends, but what
          // the impact left behind has to keep being drawn for the rest of the battle.
          return structureImpactOp(seated, structureLandingRef.current.get(op.structure.key), timeMs);
        });
        const physicalPieceOps: BoardDrawOp[] = [];
        const reflectionSubjects: MirrorReflectionSubject[] = [];
        for (const piece of state.livePieces) {
          const target = boardLabCellPosition(piece);
          const motion = motionRef.current.get(piece.id) ?? {
            gridX: piece.x,
            gridY: piece.y,
            startLeft: target.left,
            startTop: target.top,
            targetLeft: target.left,
            targetTop: target.top,
            startTime: timeMs,
            duration: 0,
          };
          const seated = motionSeat(motion, timeMs);
          const departurePlan = departurePlansRef.current.get(piece.id);
          const departure = departurePlan ? unitDeparturePose(timeMs, departurePlan) : null;
          const seat = departure ?? seated;
          const arrivalTrack = state.unitArrivalTrack === 'slide-from-right' && piece.side === 'player'
            ? 'slide-from-right'
            : 'drop';
          const arrival = departure
            ? { dx: 0, dy: 0, opacity: departure.opacity }
            : arrivalOffset(timeMs, arrivalPlansRef.current.get(piece.id), arrivalTrack);
          const baseOpacity = state.draggingId === piece.id ? 0.3 : state.premovedIds.has(piece.id) ? 0.4 : 1;
          const presentedPiece = departurePlan ? { ...piece, facing: departurePlan.facing } : piece;
          const depthPiece = departure
            ? { ...presentedPiece, ...unprojectBoardPoint(seat) }
            : presentedPiece;
          const op = pieceOp(depthPiece, seat, {
            dx: arrival.dx,
            dy: (departure ? 0 : moveHopOffset(seated.progress, piece.side)) + arrival.dy,
            opacity: baseOpacity * arrival.opacity,
          });
          if (op) {
            physicalPieceOps.push(op);
            const reflectionSubject = mirrorSubjectForSeat(op, seat, presentedPiece);
            if (reflectionSubject) reflectionSubjects.push(reflectionSubject);
          }
        }
        ops.push(...reflectedOpsForSubjects(state.mirrorSurfaces, reflectionSubjects));
        ops.push(...physicalPieceOps);
        for (const piece of state.previewPieces) {
          const op = pieceOp(piece, boardLabCellPosition(piece), { opacity: 0.62 });
          if (op) ops.push(op);
        }
        for (const group of state.afterGhosts) {
          group.pieces.forEach((piece, i) => {
            const off = (GHOST_SLOTS[group.pieces.length] ?? GHOST_SLOTS[1])[i] ?? { dx: 0, dy: 0 };
            const { left, top } = boardLabCellPosition(piece);
            const op = pieceOp(piece, { left: left + off.dx, top: top + off.dy }, {
              opacity: 0.55,
              scale: ghostScaleFor(group.pieces.length),
            });
            if (op) ops.push(op);
          });
        }
        ops.sort((a, b) => a.z - b.z);
        commitSkirmishSceneFirstFrame(
          state.occlusionDepthMap,
          imagesRef.current,
          () => {
            sizeCanvasForBounds(canvas, state.bounds);
            drawBoardOps(
              ctx,
              ops,
              state.bounds,
              imagesRef.current,
              timeMs,
              undefined,
              state.occlusionMasks,
              undefined,
              state.occlusionDepthMap,
            );
          },
          () => {
            if (acknowledgedFrameKeyRef.current === state.frameKey) return;
            acknowledgedFrameKeyRef.current = state.frameKey;
            acknowledgementFrameRef.current = window.requestAnimationFrame(() => {
              acknowledgementFrameRef.current = null;
              if (mountedRef.current && frameStateRef.current.frameKey === state.frameKey) {
                frameStateRef.current.onFirstFrame();
              }
            });
          },
        );
      } catch (error) {
        state.onFrameError(error);
        return;
      }

      let hasActiveMotion = false;
      for (const motion of motionRef.current.values()) {
        if (motionSeat(motion, timeMs).active) {
          hasActiveMotion = true;
          break;
        }
      }
      let hasActiveArrivals = false;
      for (const [pieceId, plan] of arrivalPlansRef.current) {
        // A staged entrance holds its unit off the board indefinitely and drives no frames of
        // its own; releasing it is a state change, which schedules the next frame itself.
        if (plan.startMs == null) continue;
        const piece = state.livePieces.find((candidate) => candidate.id === pieceId);
        const arrivalTrack = piece?.side === 'player' && state.unitArrivalTrack === 'slide-from-right'
          ? 'slide-from-right'
          : 'drop';
        const endMs = arrivalTrack === 'slide-from-right'
          ? plan.startMs + (plan.summonWaveDelayMs ?? plan.delayMs)
            + ARRIVAL_ANIM_MS + FORMATION_SLIDE_ANIM_MS
          : plan.startMs + plan.delayMs + ARRIVAL_ANIM_MS;
        if (timeMs < endMs) {
          hasActiveArrivals = true;
        } else {
          arrivalPlansRef.current.delete(pieceId);
        }
      }
      let hasActiveStructureArrivals = false;
      for (const [key, plan] of structureArrivalPlansRef.current) {
        // Staged but unreleased props drive no frames of their own, exactly like staged units:
        // releasing them is a state change, and that schedules the next frame itself.
        if (plan.startMs == null) continue;
        if (timeMs < plan.startMs + plan.delayMs + ARRIVAL_ANIM_MS) hasActiveStructureArrivals = true;
        else structureArrivalPlansRef.current.delete(key);
      }
      // An impact keeps painting only while it still has frames to advance; once it holds its
      // last frame the scene is static again.
      for (const landedAt of structureLandingRef.current.values()) {
        if (timeMs >= landedAt && timeMs < landedAt + STRUCTURE_IMPACT_MS) hasActiveStructureArrivals = true;
      }
      let hasActiveDepartures = false;
      for (const plan of departurePlansRef.current.values()) {
        if (unitDeparturePose(timeMs, plan).active) {
          hasActiveDepartures = true;
          break;
        }
      }
      const departureRequest = state.unitDeparture;
      if (
        departureRequest
        && !hasActiveDepartures
        && completedDepartureRequestRef.current !== departureRequest.id
      ) {
        completedDepartureRequestRef.current = departureRequest.id;
        state.onUnitDepartureComplete(departureRequest.id);
      }
      reportArrivingUnits();
      if (
        state.hasAnimatedGroundCover
        || hasActiveArrivals
        || hasActiveStructureArrivals
        || hasActiveMotion
        || hasActiveDepartures
      ) requestSceneFrame();
    };
  }, [reportArrivingUnits, requestSceneFrame]);

  useEffect(() => {
    mountedRef.current = true;
    if (requiredSources.every((src) => imagesRef.current.has(src))) requestSceneFrame();
    return () => {
      mountedRef.current = false;
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      if (acknowledgementFrameRef.current !== null) window.cancelAnimationFrame(acknowledgementFrameRef.current);
      animationFrameRef.current = null;
      acknowledgementFrameRef.current = null;
    };
  }, [requestSceneFrame]);

  useEffect(() => {
    let active = true;
    void Promise.all(requiredSources.map(async (src): Promise<[string, HTMLImageElement]> => [src, await loadCanvasImage(src)]))
      .then((entries) => {
        if (!active) return;
        for (const [src, image] of entries) imagesRef.current.set(src, image);
        requestSceneFrame();
      })
      .catch((error: unknown) => {
        if (active) frameStateRef.current.onFrameError(error);
      });
    return () => { active = false; };
  }, [requestSceneFrame, requiredSourceKey]);

  useEffect(() => {
    let active = true;
    void Promise.all(warmSources.map(async (src): Promise<[string, HTMLImageElement]> => [src, await loadCanvasImage(src)]))
      .then((entries) => {
        if (!active) return;
        for (const [src, image] of entries) imagesRef.current.set(src, image);
      })
      .catch(() => {
        // Directional warm-up is opportunistic. If a future frame actually needs a failed
        // source, the required-resource path above owns the visible retry/error semantics.
      });
    return () => { active = false; };
  }, [warmSourceKey]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="skirmish-scene-canvas"
      className="tileset-scene-layer"
      style={{ left: `${bounds.minX}px`, top: `${bounds.minY}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }}
      aria-hidden="true"
    />
  );
}

const EMPTY_PREMOVES: readonly PremoveStep[] = [];
const EMPTY_PREVIEW_PIECES: readonly Piece[] = [];
export interface SkirmishBoardSurfaceState {
  /** A passive position projected through the live Battle compositor without starting a match. */
  game: GameState;
  seed: number;
  /** Stable camera identity for the owning non-Battle phase. */
  viewKey: string;
  /** Translucent board-space units previewed through the same projection as live pieces. */
  previewPieces?: readonly Piece[];
}

export interface SkirmishBoardCellOverlayContext {
  cell: SocketBoardCell<TileAsset>;
  left: number;
  top: number;
  visualFootprintStyle?: CSSProperties;
}

export function SkirmishBoard({
  interactive = true,
  surfaceState,
  renderCellOverlay,
  boardOverlay,
  className = '',
  ariaLabel = 'Skirmish board',
  predrawnReview,
  onSurfaceReady,
  onSurfaceError,
  onArrivingUnitIdsChange,
  unitDeparture = null,
  onUnitDepartureComplete,
  reveal = true,
  activate = reveal,
  unitArrivals = activate ? 'active' : 'pending',
  unitArrivalTrack = 'drop',
  unitArrivalStartDelta = ZERO_BOARD_DELTA,
  revealTransition = 'local',
}: {
  interactive?: boolean;
  /**
   * Non-combat phases use this adapter to render their position through the exact live Battle
   * surface. It deliberately bypasses match initialization, persistence, clocks, premoves,
   * selections, and combat overlays while retaining the canonical camera and compositors.
   */
  surfaceState?: SkirmishBoardSurfaceState;
  renderCellOverlay?: (context: SkirmishBoardCellOverlayContext) => ReactNode;
  /** Board-space content, such as a placement ghost, seated in the canonical scene. */
  boardOverlay?: ReactNode;
  className?: string;
  ariaLabel?: string;
  predrawnReview?: {
    src: string;
    registration?: PredrawnBoardCornerRegistration;
  };
  onSurfaceReady?: (ready: boolean) => void;
  onSurfaceError?: (error: Error | null) => void;
  /** Reports the compositor-owned arrival cycle without transferring animation timing upward. */
  onArrivingUnitIdsChange?: (unitIds: readonly string[]) => void;
  /** One registered physical exit selected by the owning gameplay transition. */
  unitDeparture?: UnitDepartureRequest | null;
  /** Reports only after every selected unit has followed that exit clear of the board. */
  onUnitDepartureComplete?: (requestId: string) => void;
  reveal?: boolean;
  activate?: boolean;
  /**
   * Unit-entry presentation is independent from combat input/clock activation. A battlefield
   * that has not been activated yet is `pending`, not "no arrivals": it still stages the units
   * it is about to introduce, so its first revealed frame never shows them seated early.
   * `settled` is reserved for a position being revisited after its arrival already happened.
   */
  unitArrivals?: UnitArrivalLifecycle;
  /** Deployment may use the same compositor lifecycle with a rigid horizontal-gravity entrance. */
  unitArrivalTrack?: UnitArrivalTrack;
  /** Shared board-space translation from a rigid formation's off-board entry position. */
  unitArrivalStartDelta?: Vec;
  /**
   * `scene` delegates the visible opacity entrance to the surrounding SceneBoundary. The local
   * readiness gate still keeps incomplete pixels hidden, but does not start a second fade.
   */
  revealTransition?: 'local' | 'scene';
} = {}) {
  const interactionEnabled = interactive && !surfaceState;
  // Board-view state lives in the shared view store so the HUD's "View" tab owns
  // the controls and the playfield stays clean of floating buttons.
  const storedShowMoves = useSkirmishView((s) => s.showMoves);
  const storedShowEnemyAttacks = useSkirmishView((s) => s.showEnemyAttacks);
  const storedShowBlocked = useSkirmishView((s) => s.showBlocked);
  const storedShowEnemyMoves = useSkirmishView((s) => s.showEnemyMoves);
  const storedShowPlayerAttacks = useSkirmishView((s) => s.showPlayerAttacks);
  const storedShowPlayerMoves = useSkirmishView((s) => s.showPlayerMoves);
  const storedShowPromotionZones = useSkirmishView((s) => s.showPromotionZones);
  const showMoves = surfaceState ? false : storedShowMoves;
  const showEnemyAttacks = surfaceState ? false : storedShowEnemyAttacks;
  const showBlocked = surfaceState ? false : storedShowBlocked;
  const showEnemyMoves = surfaceState ? false : storedShowEnemyMoves;
  const showPlayerAttacks = surfaceState ? false : storedShowPlayerAttacks;
  const showPlayerMoves = surfaceState ? false : storedShowPlayerMoves;
  const showPromotionZones = surfaceState ? false : storedShowPromotionZones;
  const showGrid = useSkirmishView((s) => s.showGrid);
  // The sprite resolvers above read the chosen player color from module state, which React cannot
  // see. Subscribing here is what repaints the board when the setting changes under a live battle.
  usePlayerPalette();
  const boardZoom = useSkirmishView((s) => s.zoom);
  const boardMinZoom = useSkirmishView((s) => s.minZoom);
  const boardMaxZoom = useSkirmishView((s) => s.maxZoom);
  const boardPan = useSkirmishView((s) => s.pan);
  const cameraResetRevision = useSkirmishView((s) => s.cameraResetRevision);
  const setZoom = useSkirmishView((s) => s.setZoom);
  const setMinZoom = useSkirmishView((s) => s.setMinZoom);
  const setBoardPan = useSkirmishView((s) => s.setPan);
  const setOpeningView = useSkirmishView((s) => s.setOpeningView);
  const [viewViewportSize, setViewViewportSize] = useState<ViewPaneViewportSize | null>(null);
  const storedGame = useSkirmish((s) => s.game);
  const storedLevelId = useSkirmish((s) => s.levelId);
  const storedActivityId = useSkirmish((s) => s.activityId);
  const storedBoardViewEpoch = useSkirmish((s) => s.boardViewEpoch);
  const storedEnv = useSkirmish((s) => s.env);
  const storedSelectedId = useSkirmish((s) => s.selectedId);
  const storedFocusedId = useSkirmish((s) => s.focusedId);
  const storedPendingPromotion = useSkirmish((s) => s.pendingPromotion);
  const choosePromotion = useSkirmish((s) => s.choosePromotion);
  const storedSeed = useSkirmish((s) => s.seed);
  const game = surfaceState?.game ?? storedGame;
  const previewPieces = surfaceState?.previewPieces ?? EMPTY_PREVIEW_PIECES;
  const env = useMemo(
    () => surfaceState ? { ...gameEnv(game), lastMove: game.lastMove } : storedEnv,
    [game, storedEnv, surfaceState],
  );
  const selectedId = surfaceState ? null : storedSelectedId;
  const focusedId = surfaceState ? null : storedFocusedId;
  const pendingPromotion = surfaceState ? null : storedPendingPromotion;
  const seed = surfaceState?.seed ?? storedSeed;
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const tryMoveTo = useSkirmish((s) => s.tryMoveTo);
  const releaseMoveGesture = useSkirmish((s) => s.releaseMoveGesture);
  const storedAdminMode = useSkirmish((s) => s.adminMode);
  const adminMode = surfaceState ? null : storedAdminMode;
  const adminKillUnit = useSkirmish((s) => s.adminKillUnit);
  const storedPremoves = useSkirmish((s) => s.premoves);
  const premoves = surfaceState ? EMPTY_PREMOVES : storedPremoves;
  const storedPremoveInputOpen = useSkirmish((s) => s.premoveInputOpen);
  const premoveInputOpen = surfaceState ? false : storedPremoveInputOpen;
  const queueMove = useSkirmish((s) => s.queueMove);
  const clearPremoves = useSkirmish((s) => s.clearPremoves);
  // Premove building: which provisional-board piece the player is queueing from. This stays
  // component-local because queued pieces can be rendered at ghost destinations, but clicks also
  // mirror into the store selection so the chosen unit survives the async enemy-reply boundary.
  const [premoveSelectedId, setPremoveSelectedId] = useState<string | null>(null);
  const storedNet = useSkirmish((s) => s.net);
  const net = surfaceState ? null : storedNet;
  // The side THIS client controls: 'player' in single-player, or its lobby seat in
  // netplay (host='player', guest='enemy'). Interaction (selecting, move highlights,
  // committing) is gated to this side, not the literal 'player'.
  const localSide = clientSide(net);
  const remoteSide = opponentSide(localSide);
  const netMovePending = !!net?.pendingMove;
  // Selection can also be cleared outside this component (for example, the HUD's R shortcut).
  // Mirror that into the provisional premove selection so "Deselect all" removes every ring and
  // target set without discarding premove steps that are already queued.
  useEffect(() => { if (selectedId === null) setPremoveSelectedId(null); }, [selectedId]);
  // Drag-to-move (coexists with click-select → click-move). The live gesture is tracked in a
  // ref (mutated freely without re-rendering the board every pointer frame); `drag` state only
  // flips on/off at pick-up/drop so the ghost mounts and the origin piece fades. Only ONE drag
  // runs at a time — a second concurrent pointer (multi-touch) is ignored while dragRef is set,
  // so it can't hijack the single slot. The ghost follows the cursor imperatively (per frame);
  // the drop-target cell is React state (dropHoverKey) so a re-render can't clobber it.
  const dragRef = useRef<{
    pointerId: number;
    pieceId: string;
    startX: number;
    startY: number;
    active: boolean;
    src: string | null;
    side: Piece['side'];
    /** The pickup happened during premove input. Release may reclassify it as a live move. */
    startedAsPremove: boolean;
  } | null>(null);
  const ghostRef = useRef<HTMLImageElement | null>(null);
  const lastCursorRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<{
    pieceId: string;
    src: string | null;
    side: Piece['side'];
    w: number;
    h: number;
    startedAsPremove: boolean;
  } | null>(null);
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null);
  const [dropAimKey, setDropAimKey] = useState<string | null>(null);
  useEffect(() => {
    if (interactionEnabled) return;
    dragRef.current = null;
    setDrag(null);
    setDropAimKey(null);
    setDropHoverKey(null);
    setPremoveSelectedId(null);
  }, [interactionEnabled]);
  const [noHopId, setNoHopId] = useState<string | null>(null);
  // Premove input is open while the opposing seat owns the turn and for the short
  // post-reply landing beat before live control resumes. This is client input in both
  // solo and lobby play; the authoritative move still commits through the store/relay.
  const premoveMode = !adminMode && (game.turn === remoteSide || premoveInputOpen) && !game.winner;
  // The ghost rides the cursor imperatively (per frame, no board re-render). When a drag-related
  // re-render DOES happen (pick-up, or the drop-target cell changing), React would otherwise
  // reset the ghost's inline position — so re-apply the last cursor after each such commit,
  // synchronously before paint, so the ghost never flicks back to its mount point.
  useLayoutEffect(() => {
    const ghost = ghostRef.current;
    if (drag && ghost) {
      ghost.style.left = `${lastCursorRef.current.x}px`;
      ghost.style.top = `${lastCursorRef.current.y}px`;
    }
  }, [drag, dropHoverKey, dropAimKey]);
  const selectedMoves = useMemo(() => {
    if (premoveMode || pendingPromotion || netMovePending || game.winner) return [];
    if (adminMode === 'free-move') return adminMoveTargets(game, selectedId ?? '');
    if (game.turn !== localSide) return [];
    const piece = game.pieces.find((candidate) => candidate.id === selectedId && candidate.alive && candidate.side === localSide);
    return piece ? legalMoves(piece, game.pieces, game.size, env) : [];
  }, [adminMode, env, game, game.pieces, game.size, game.turn, game.winner, netMovePending, pendingPromotion, premoveMode, selectedId, localSide]);
  // Piece moves replace `game`, but terrain/cover/socket solving is session-static. Keep that
  // board and its static scene ops alive while the animator consumes only the changed pieces.
  const board = useMemo(
    () => buildSkirmishBoard(game, seed),
    [game.boardCode, game.size.cols, game.size.rows, game.terrain, seed],
  );
  const exactBoard = useMemo(() => resolveBoardCode(game), [game.boardCode, game.size.cols, game.size.rows]);
  const persistedPredrawnBackgroundActive = Boolean(
    exactBoard && isPredrawnBackgroundActive(exactBoard),
  );
  const temporaryPredrawnReviewActive = Boolean(predrawnReview && exactBoard?.surface);
  const predrawnBackgroundActive = persistedPredrawnBackgroundActive || temporaryPredrawnReviewActive;
  const predrawnOcclusionMasks = useMemo(
    () => predrawnBackgroundActive
      && exactBoard
      && (
        !persistedPredrawnBackgroundActive
        || !exactBoard.surface
        || !isVersionedPredrawnBoardSurface(exactBoard.surface)
      )
      ? predrawnOcclusionMaskOps(exactBoard)
      : [],
    [exactBoard, persistedPredrawnBackgroundActive, predrawnBackgroundActive],
  );
  const predrawnOcclusionDepthMap = useMemo(
    () => persistedPredrawnBackgroundActive
      ? predrawnOcclusionDepthMapForSurface(exactBoard?.surface)
      : undefined,
    [exactBoard?.surface, persistedPredrawnBackgroundActive],
  );
  const predrawnPlate = useMemo<PredrawnBoardPlate | undefined>(() => {
    const surface = exactBoard?.surface;
    if (!surface || !predrawnBackgroundActive) return undefined;
    return predrawnReview
      ? { surface, src: predrawnReview.src, registration: predrawnReview.registration }
      : runtimePredrawnBoardPlate(surface);
  }, [exactBoard, predrawnBackgroundActive, predrawnReview]);
  const predrawnCoverPolygon = useMemo(
    () => predrawnPlate ? predrawnBoardCoverPolygon(predrawnPlate, board.cells) : undefined,
    [board.cells, predrawnPlate],
  );
  const cameraCoverPolygon = useMemo(
    () => effectiveBoardCameraCoverPolygon(
      exactBoard ?? { cols: game.size.cols, rows: game.size.rows },
      predrawnCoverPolygon,
    ),
    [exactBoard, game.size.cols, game.size.rows, predrawnCoverPolygon],
  );
  const boardViewKey = surfaceState?.viewKey
    ?? storedActivityId
    ?? `${storedLevelId ?? 'free'}:${storedBoardViewEpoch}`;
  const preparedMinimumZoom = useMemo(() => viewViewportSize
    ? minimumZoomToCoverViewport({
        viewport: viewViewportSize,
        polygon: cameraCoverPolygon,
        minZoom: PLAYER_TECHNICAL_MINIMUM_ZOOM,
        maxZoom: 16,
      })
    : boardMinZoom, [boardMinZoom, cameraCoverPolygon, viewViewportSize]);
  const { markViewInteraction, cameraReady } = useBoardCameraFraming({
    board: { cols: game.size.cols, rows: game.size.rows },
    viewKey: boardViewKey,
    viewport: viewViewportSize,
    minimumZoom: preparedMinimumZoom,
    // The canonical opening fit owns its zoom. setOpeningView raises the interactive ceiling
    // before applyOpening calls setZoom, so the old human-control cap cannot undershoot it.
    maximumZoom: 16,
    zoom: boardZoom,
    setZoom,
    setPan: setBoardPan,
    openingViewportAspectCap:
      BOARD_PREVIEW_ASPECT.width / BOARD_PREVIEW_ASPECT.height,
    onOpeningCameraChange: setOpeningView,
    resetRevision: cameraResetRevision,
  });
  const ambientSceneCover = !exactBoard;
  const sceneBoard = useMemo(
    () => sceneBoardForSkirmish(game, board, exactBoard),
    [board, exactBoard, game.props, game.size.cols, game.size.rows],
  );
  const visualTerrainCells = useMemo(
    () => skirmishVisualTerrainCells(exactBoard),
    [exactBoard],
  );
  // Edge fences resolve from the authored board code (each shared edge → its upper-left cell's
  // E/S rail). Keyed "x,y" to match resolveFenceOverlays; empty for a generated/fence-free board.
  const fenceOverlays = useMemo<ReadonlyMap<string, ResolvedFenceOverlay>>(() => {
    return exactBoard ? resolveFenceOverlays(exactBoard.fences ?? {}) : new Map();
  }, [exactBoard]);
  const fencePosts = useMemo<ReadonlyMap<string, ResolvedFencePost>>(() => {
    return exactBoard ? resolveFencePosts(exactBoard.fences ?? {}, exactBoard.fencePosts ?? {}) : new Map();
  }, [exactBoard]);
  const wallOverlays = useMemo<ReadonlyMap<string, ResolvedWallOverlay>>(() => {
    return exactBoard ? resolveWallOverlays(exactBoard.walls ?? {}, { cols: game.size.cols, rows: game.size.rows }) : new Map();
  }, [exactBoard, game.size.cols, game.size.rows]);
  const wallArtUrls = useMemo(
    () => exactBoard ? wallArtSrcs(exactBoard.wallArt, { cols: game.size.cols, rows: game.size.rows }) : [],
    [exactBoard, game.size.cols, game.size.rows],
  );
  const presentedPieces = useMemo(
    () => pendingPromotion
      ? promotionArrivalPieces(game, pendingPromotion.pieceId, pendingPromotion.move)
      : game.pieces,
    [game, pendingPromotion],
  );
  const livePieces = useMemo(
    // Prop colliders (`prop-…`) block movement but render as the tall PropSprite, not a unit
    // seat — exclude them so they don't paint an empty/phantom seat over their footprint cells.
    () => presentedPieces.filter((piece) => piece.alive && !isPropCollider(piece)).sort((a, b) => a.x + a.y - (b.x + b.y)),
    [presentedPieces],
  );
  const choosingPromotion = pendingPromotion?.phase === 'choosing' ? pendingPromotion : null;
  const promotingPiece = choosingPromotion
    ? livePieces.find((piece) => piece.id === choosingPromotion.pieceId && piece.alive) ?? null
    : null;
  const promotionPickerSeat = promotingPiece ? boardLabCellPosition(promotingPiece) : null;
  const sceneUrls = useMemo(
    () => sceneArtUrls(sceneBoard, seed, ambientSceneCover, predrawnBackgroundActive),
    [ambientSceneCover, predrawnBackgroundActive, sceneBoard, seed],
  );
  // Hold the board hidden until its whole art set has decoded, then fade it in as one
  // unit — no per-tile popcorn (see render/boardArtReady). The signature is the tile set
  // (stable across moves), so this arms once per board/seed, not on every move.
  const boardArt = useMemo(
    () => collectBoardArt(
      board,
      livePieces,
      fenceOverlays,
      fencePosts,
      wallOverlays,
      wallArtUrls,
      sceneUrls,
      [
        ...predrawnOcclusionMasks.map((op) => op.src),
        ...(predrawnOcclusionDepthMap ? [predrawnOcclusionDepthMap.src] : []),
      ],
      predrawnPlate?.src,
    ),
    [board, fenceOverlays, fencePosts, livePieces, predrawnOcclusionDepthMap?.src, predrawnOcclusionMasks, predrawnPlate?.src, sceneUrls, wallArtUrls, wallOverlays],
  );
  const boardFrame = useBoardFrameReveal(boardArt.signature);
  const boardReady = boardFrame.ready;
  const surfaceReadinessKey = `${boardViewKey}:${boardArt.signature}:${boardFrame.retryKey}`;
  const [readySurfaceKey, setReadySurfaceKey] = useState<string | null>(null);
  const completePreparedFrame = boardReady && cameraReady;
  useLayoutEffect(() => {
    if (completePreparedFrame) setReadySurfaceKey(surfaceReadinessKey);
  }, [completePreparedFrame, surfaceReadinessKey]);
  const surfaceReady = completePreparedFrame || readySurfaceKey === surfaceReadinessKey;
  const boardVisible = surfaceReady && reveal;
  useEffect(() => {
    onSurfaceReady?.(surfaceReady);
    return () => onSurfaceReady?.(false);
  }, [onSurfaceReady, surfaceReady]);
  useEffect(() => {
    onSurfaceError?.(boardFrame.error);
    return () => onSurfaceError?.(null);
  }, [boardFrame.error, onSurfaceError]);
  const acknowledgeTerrain = useCallback(() => boardFrame.acknowledge('terrain'), [boardFrame.acknowledge]);
  const acknowledgeBarriers = useCallback(() => boardFrame.acknowledge('barriers'), [boardFrame.acknowledge]);
  const acknowledgeScene = useCallback(() => boardFrame.acknowledge('scene'), [boardFrame.acknowledge]);
  useEffect(() => {
    if (!boardReady) return undefined;
    const frame = requestAnimationFrame(() => loadingMark('board', 'container-first-revealed-frame', { assetCount: boardArt.urls.length }));
    return () => cancelAnimationFrame(frame);
  }, [boardArt.urls.length, boardReady]);
  // The scene layer owns an identity ledger for arrivals. Unlike the old one-shot board flag,
  // it can introduce units into an already-mounted compositor without reanimating incumbents.
  const [arrivingUnitIds, setArrivingUnitIds] = useState<readonly string[]>([]);
  const arriving = arrivingUnitIds.length > 0;
  const [departingUnitIds, setDepartingUnitIds] = useState<readonly string[]>([]);
  const departing = departingUnitIds.length > 0;
  // The entrance is released only once this battlefield is both activated and on screen; until
  // then it stays staged, which is the state a preparing or entering board is revealed in.
  // Review positions bypass the entrance completely and paint their already-arrived units.
  const arrivalLifecycle: UnitArrivalLifecycle = unitArrivals === 'settled'
    ? 'settled'
    : boardVisible && unitArrivals === 'active'
      ? 'active'
      : 'pending';
  const presentingArrivals = arrivalLifecycle !== 'settled' && arriving;
  // Staged and entering are different claims: staged units are held off the board and nothing is
  // moving, entering units are playing their drop. Activation gates the second, not the first.
  const arrivalState = !presentingArrivals ? 'none' : arrivalLifecycle === 'active' ? 'entering' : 'staged';
  const handleArrivingUnitIdsChange = useCallback((unitIds: readonly string[]) => {
    setArrivingUnitIds(unitIds);
    onArrivingUnitIdsChange?.(unitIds);
  }, [onArrivingUnitIdsChange]);
  const handleUnitDepartureComplete = useCallback((requestId: string) => {
    onUnitDepartureComplete?.(requestId);
  }, [onUnitDepartureComplete]);
  useEffect(() => {
    if (!unitDeparture) setDepartingUnitIds([]);
  }, [unitDeparture]);
  const focusPiece = useMemo(
    () => livePieces.find((piece) => piece.id === focusedId) ?? livePieces.find((piece) => piece.id === selectedId) ?? null,
    [focusedId, livePieces, selectedId],
  );
  const focusedMoves: Move[] = useMemo(
    () => (focusPiece ? legalMoves(focusPiece, game.pieces, game.size, env) : []),
    [env, focusPiece, game.pieces, game.size],
  );
  const overlayMoves = focusPiece ? focusedMoves : selectedMoves;
  const moveSet = useMemo(() => new Set((showMoves ? overlayMoves : []).map((move) => `${move.x},${move.y}`)), [overlayMoves, showMoves]);
  // Army-wide display layers driven by the in-match shortcut grid. Canonical sides stay
  // fixed on the board; only which side means "your" or "opponent" changes per client.
  const armyLayer = (enabled: boolean, tilesFor: (piece: Piece) => readonly Vec[], side: Side) => (
    enabled ? skirmishArmyOverlaySet(game.pieces, side, tilesFor) : new Set<string>()
  );
  const threatSet = useMemo(() => {
    if (!showEnemyAttacks) return new Set<string>();
    if (focusPiece?.side === remoteSide) {
      return new Set(attackedSquares(focusPiece, game.pieces, game.size, env).map((tile) => `${tile.x},${tile.y}`));
    }
    return armyLayer(true, (piece) => attackedSquares(piece, game.pieces, game.size, env), remoteSide);
  }, [env, focusPiece, game.pieces, game.size, remoteSide, showEnemyAttacks]);
  const blockedSet = useMemo(() => {
    if (!showBlocked || !focusPiece) return new Set<string>();
    const legal = new Set(overlayMoves.map((move) => `${move.x},${move.y}`));
    return new Set(blockedCandidateSquares(focusPiece, game.pieces, game.size, env).filter((tile) => !legal.has(`${tile.x},${tile.y}`)).map((tile) => `${tile.x},${tile.y}`));
  }, [env, focusPiece, game.pieces, game.size, overlayMoves, showBlocked]);
  const opponentMoveSet = useMemo(
    () => armyLayer(showEnemyMoves, (piece) => legalMoves(piece, game.pieces, game.size, env), remoteSide),
    [env, game.pieces, game.size, remoteSide, showEnemyMoves],
  );
  const localAttackSet = useMemo(
    () => armyLayer(showPlayerAttacks, (piece) => attackedSquares(piece, game.pieces, game.size, env), localSide),
    [env, game.pieces, game.size, localSide, showPlayerAttacks],
  );
  const localMoveSet = useMemo(
    () => armyLayer(showPlayerMoves, (piece) => legalMoves(piece, game.pieces, game.size, env), localSide),
    [env, game.pieces, game.size, localSide, showPlayerMoves],
  );
  const promotionZoneSet = useMemo(
    () => new Set((showPromotionZones ? game.promotionZones ?? [] : []).map((cell) => `${cell.x},${cell.y}`)),
    [game.promotionZones, showPromotionZones],
  );

  // Premoves: while the opponent is thinking or visibly landing a reply, the board accepts
  // a queued chain that fires one-per-turn as live control returns. The chain is built on the
  // PROVISIONAL board (current board + the moves already queued), so a later step sees the
  // piece where its earlier steps left it. See game/premoves. Projection is scoped to the
  // side this client commands, whether that canonical side is `player` or `enemy`.
  const provGame = useMemo(() => provisionalBoard(game, premoves, localSide), [game, localSide, premoves]);
  const premoveChain = useMemo(() => premoveArrows(game, premoves, localSide), [game, localSide, premoves]);
  const premoveTargetSet = useMemo(
    () => (premoveMode ? new Set(premoveTargets(game, premoves, premoveSelectedId, localSide).map((move) => `${move.x},${move.y}`)) : new Set<string>()),
    [premoveMode, game, localSide, premoves, premoveSelectedId],
  );
  const premoveDestSet = useMemo(() => new Set(premoveChain.map((a) => `${a.to.x},${a.to.y}`)), [premoveChain]);
  const premoveSelKey = useMemo(() => {
    if (!premoveMode || !premoveSelectedId) return null;
    const p = provGame.pieces.find((piece) => piece.id === premoveSelectedId && piece.alive && piece.side === localSide);
    return p ? `${p.x},${p.y}` : null;
  }, [localSide, premoveMode, premoveSelectedId, provGame.pieces]);
  const showStoreSelection = !pendingPromotion && (!premoveMode || !premoveSelectedId);
  // Pieces with a queued premove get TWO ghosts: the real piece dimmed in place (before) and a
  // translucent copy on its planned square (after). The before/origin square is also a precise
  // handle for continuing that unit's premove when several after-ghosts share one tile.
  const premovedIds = useMemo(() => {
    const owned = new Set(game.pieces.filter((piece) => piece.alive && piece.side === localSide).map((piece) => piece.id));
    return new Set(premoves.filter((step) => owned.has(step.pieceId)).map((step) => step.pieceId));
  }, [game.pieces, localSide, premoves]);
  const premovedOriginPieceAt = (x: number, y: number): Piece | null =>
    game.pieces.find((piece) => piece.alive && piece.side === localSide && premovedIds.has(piece.id) && piece.x === x && piece.y === y) ?? null;
  // Ghost units grouped by the square they land on — a ghost on every square each premoved unit
  // passes through, and when several units plan the same square they SHARE it (the tile splits
  // between them, up to 4) rather than one hiding the others.
  const afterGhosts = useMemo(() => premoveGhosts(game, premoves, localSide), [game, localSide, premoves]);
  const sharedPremoveGhostKeys = useMemo(
    () => new Set(afterGhosts.filter((group) => group.pieces.length > 1).map((group) => group.key)),
    [afterGhosts],
  );
  const provisionalLocalPieceAt = (x: number, y: number): Piece | null => {
    const key = `${x},${y}`;
    if (sharedPremoveGhostKeys.has(key)) return null;
    return provGame.pieces.find((piece) => piece.alive && piece.side === localSide && piece.x === x && piece.y === y) ?? null;
  };
  const premoveDraggablePieceAt = (x: number, y: number): Piece | null =>
    premovedOriginPieceAt(x, y) ?? provisionalLocalPieceAt(x, y);

  // The chain-building selection is only meaningful during the opponent's turn; when it
  // ends (a premove fires, or the player regains a live turn) drop it so the next enemy
  // turn starts clean.
  useEffect(() => { if (!premoveMode) setPremoveSelectedId(null); }, [premoveMode]);
  // Escape clears the whole queued chain (spec: chess-style cancel).
  useEffect(() => {
    if (!premoves.length && !premoveSelectedId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearPremoves(); setPremoveSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [premoves.length, premoveSelectedId, clearPremoves]);

  // Resolve targets from the CURRENT input boundary, not the pickup boundary. In particular,
  // a premove drag may outlive the post-reply landing beat; once live control resumes, both its
  // green drop promise and its eventual commit must use exact live legality.
  const dragInputModeFor = useCallback((startedAsPremove: boolean) => moveGestureInputMode({
    startedAsPremove,
    adminMode,
    gameTurn: game.turn,
    gameWinner: game.winner,
    localSide,
    netMovePending,
    pendingPromotion: Boolean(pendingPromotion),
    premoveInputOpen,
  }), [adminMode, game.turn, game.winner, localSide, netMovePending, pendingPromotion, premoveInputOpen]);
  const dragMovesFor = useCallback((pieceId: string, startedAsPremove: boolean): readonly Move[] => {
    const inputMode = dragInputModeFor(startedAsPremove);
    if (inputMode === 'premove') {
      return premoveTargets(game, premoves, pieceId, localSide);
    }
    if (inputMode !== 'move') return [];
    const piece = game.pieces.find((candidate) => (
      candidate.id === pieceId
      && candidate.alive
      && candidate.side === (adminMode === 'free-move' ? game.turn : localSide)
    ));
    if (!piece) return [];
    return adminMode === 'free-move'
      ? adminMoveTargets(game, piece.id)
      : legalMoves(piece, game.pieces, game.size, env);
  }, [adminMode, dragInputModeFor, env, game, localSide, premoves]);
  // While a drag is live, its currently valid squares always glow (even if the View→moves
  // overlay is off) so the feedback cannot outlive the authority that will accept the drop.
  const dragTargetSet = useMemo(
    () => new Set(drag ? dragMovesFor(drag.pieceId, drag.startedAsPremove).map((move) => `${move.x},${move.y}`) : []),
    [drag, dragMovesFor],
  );

  const handleTile = (x: number, y: number) => {
    if (!interactionEnabled) {
      // A secondary same-seat tab remains useful for inspection, but cannot build a
      // selection, drag, premove, promotion, or move gesture.
      const inspected = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
      if (inspected) focus(inspected.id);
      return;
    }
    const adminHere = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
    if (adminMode === 'kill-unit') {
      if (adminHere) adminKillUnit(adminHere.id);
      return;
    }
    // Opponent's turn: clicks build the premove chain instead of being ignored.
    if (pendingPromotion) return;
    if (premoveMode) {
      const key = `${x},${y}`;
      // A premoved unit's real/origin square is always a precise selection handle.
      // Treat it before legal-target clicks so tapping the dimmed original never
      // accidentally adds a return-to-origin step.
      const originalHere = premovedOriginPieceAt(x, y);
      if (originalHere) {
        setPremoveSelectedId(originalHere.id);
        select(originalHere.id);
        return;
      }
      // A legal target for the selected piece → queue the step.
      if (premoveSelectedId && premoveTargetSet.has(key)) { queueMove(premoveSelectedId, x, y); return; }
      // A single unshared provisional ghost selects that unit to continue premoving.
      // Shared ghost stacks are intentionally not picked from the stack; use the
      // original piece square to choose the exact unit.
      const here = provisionalLocalPieceAt(x, y);
      if (here) {
        setPremoveSelectedId(here.id);
        select(here.id);
        return;
      }
      // Clicking away from a unit or one of its legal premove targets dismisses the
      // active premove selection without throwing away moves that are already queued.
      setPremoveSelectedId(null);
      select(null);
      return;
    }
    const here = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
    const selectingSide = adminMode === 'free-move' && (game.turn === 'player' || game.turn === 'enemy')
      ? game.turn
      : localSide;
    const intent = skirmishTileClickIntent(x, y, selectedMoves, here, selectingSide);
    switch (intent.kind) {
      case 'move':
        tryMoveTo(x, y);
        break;
      case 'select':
        // A piece THIS client commands — select it (own side; 'player' in single-player).
        select(intent.pieceId);
        break;
      case 'focus':
        // The opponent's living piece is an inspection focus; the player's movement
        // selection remains independent so returning focus can restore that context.
        focus(intent.pieceId);
        break;
      case 'clear-selection':
        // Chess-style cancellation: an invalid/empty destination removes the move dots and
        // focus instead of leaving the player locked onto a unit they no longer care about.
        select(null);
        break;
    }
  };

  // Map a viewport point to the board cell under it by testing the actual on-screen diamond
  // geometry. `elementFromPoint` is too sensitive to overlapping isometric hit boxes: near a
  // seam it can report a visually-front cell rather than the cell whose diamond contains the
  // cursor. Picking the most central containing diamond makes the highlight and drop target
  // stable under zoom, pan, and per-cell z-index.
  const cellFromPoint = (clientX: number, clientY: number): { x: number; y: number; btn: HTMLElement } | null => {
    let best: { x: number; y: number; btn: HTMLElement; score: number } | null = null;
    const cells = document.querySelectorAll<HTMLElement>('[data-testid="skirmish-board"] .skirmish-board-cell-hit');
    for (const btn of cells) {
      if (btn.dataset.cx === undefined || btn.dataset.cy === undefined) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const dx = Math.abs(clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = Math.abs(clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const score = dx + dy;
      if (score > 1.08) continue;
      if (best && score >= best.score) continue;
      const x = Number(btn.dataset.cx);
      const y = Number(btn.dataset.cy);
      if (Number.isFinite(x) && Number.isFinite(y)) best = { x, y, btn, score };
    }
    return best ? { x: best.x, y: best.y, btn: best.btn } : null;
  };
  const setDropKeys = (aimKey: string | null, hoverKey: string | null): void => {
    setDropAimKey((prev) => (prev === aimKey ? prev : aimKey));
    setDropHoverKey((prev) => (prev === hoverKey ? prev : hoverKey));
  };

  const onCellPointerDown = (cx: number, cy: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    // Right-click-and-hold always pans the board (ViewPane) — never swallow it, even on a unit.
    if (event.button === 2) return;
    if (!interactionEnabled) return;
    // Left press stays on the cell: stop it bubbling so ViewPane doesn't start a pan.
    event.stopPropagation();
    // One drag at a time: while a gesture is armed, ignore any second concurrent pointer (a
    // second finger) so it can't overwrite the single drag slot and strand the first drag.
    if (dragRef.current) return;
    // Don't let a press start a drag before the board is even visible (cold load = opacity:0
    // but still hit-testable) — you'd be dragging a piece you can't see.
    if (pendingPromotion || game.winner || !boardReady) return;
    if (adminMode === 'kill-unit') return;
    // On your turn a drag MOVES from the live board; on the opponent's turn it queues a
    // PREMOVE from the provisional board. That makes a queued
    // after-ghost draggable from the square the player already moved it to.
    const canMove = adminMode === 'free-move'
      ? (game.turn === 'player' || game.turn === 'enemy')
      : game.turn === localSide && !premoveMode && !netMovePending;
    if (!canMove && !premoveMode) return;
    const piece = premoveMode
      ? premoveDraggablePieceAt(cx, cy)
      : livePieces.find((p) => (
          p.x === cx
          && p.y === cy
          && p.side === (adminMode === 'free-move' ? game.turn : localSide)
        ));
    if (!piece) return;
    // Pick it up: select (so the ring shows) and arm a potential drag. It only becomes a real
    // drag once the pointer crosses the threshold, so a plain tap still falls through to the
    // click handler unchanged. Targets are this move's legal squares, or — for a premove —
    // the provisional-board squares the piece could be queued to.
    if (canMove) {
      select(piece.id);
    } else {
      setPremoveSelectedId(piece.id);
      select(piece.id);
    }
    dragRef.current = {
      pointerId: event.pointerId,
      pieceId: piece.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      src: pieceImageSrc(piece),
      side: piece.side,
      startedAsPremove: premoveMode,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture can fail if the pointer already ended; the gesture just no-ops */
    }
  };

  const updateDragPointer = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    lastCursorRef.current = { x: event.clientX, y: event.clientY };
    if (!d.active) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      // Board-space units now paint into the scene canvas; size the screen-space drag ghost
      // from the same seat dimensions, scaled by the current board zoom.
      setDrag({
        pieceId: d.pieceId,
        src: d.src,
        side: d.side,
        w: DEFAULT_GHOST_W * boardZoom,
        h: DEFAULT_GHOST_H * boardZoom,
        startedAsPremove: d.startedAsPremove,
      });
    }
    // Follow the cursor imperatively (no board re-render per frame).
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }
    // Show the interpreted cell even when it is not a legal drop; the green drop ring then
    // layers on top only for targets that will actually commit.
    const hit = cellFromPoint(event.clientX, event.clientY);
    const aimKey = hit ? `${hit.x},${hit.y}` : null;
    const currentTargets = new Set(dragMovesFor(d.pieceId, d.startedAsPremove).map((move) => `${move.x},${move.y}`));
    const dropKey = aimKey && currentTargets.has(aimKey) ? aimKey : null;
    setDropKeys(aimKey, dropKey);
  };

  const finishDragPointer = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const releaseHit = cellFromPoint(event.clientX, event.clientY);
    const releaseAimKey = releaseHit ? `${releaseHit.x},${releaseHit.y}` : null;
    const releaseTargets = new Set(dragMovesFor(d.pieceId, d.startedAsPremove).map((move) => `${move.x},${move.y}`));
    const releaseDropKey = releaseAimKey && releaseTargets.has(releaseAimKey) ? releaseAimKey : null;
    setDropKeys(null, null);
    if (!d.active) return; // a tap, not a drag — let the native click handle select/move
    // A completed drag emits a trailing click; swallow it so it doesn't re-select the piece.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (releaseHit && releaseDropKey) {
      const releaseAsPremove = dragInputModeFor(d.startedAsPremove) === 'premove';
      if (!releaseAsPremove) {
        // Legal drop: land with no hop (the drag already showed the travel). noHopId is set in
        // the same handler as the store gesture so the destination render carries the flag.
        setNoHopId(d.pieceId);
        window.setTimeout(() => setNoHopId(null), 0);
      }
      releaseMoveGesture(d.pieceId, releaseHit.x, releaseHit.y, d.startedAsPremove);
    }
    // Illegal drop (or released off the board): keep the piece selected so its move dots
    // stay up and the player can click a destination instead — just release the ghost.
    setDrag(null);
  };

  const cancelDragPointer = (event: { pointerId: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDropKeys(null, null);
    if (d.active) setDrag(null);
  };

  const onCellPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    updateDragPointer(event);
  };

  const onCellPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    finishDragPointer(event);
  };

  const onCellPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    cancelDragPointer(event);
  };

  return (
    <div
      data-testid="skirmish-board"
      data-interactive={interactionEnabled ? 'true' : 'false'}
      data-arriving={presentingArrivals ? 'true' : 'false'}
      data-arrival-state={arrivalState}
      data-arriving-unit-ids={presentingArrivals ? arrivingUnitIds.join(',') : ''}
      data-unit-arrivals={unitArrivals}
      data-unit-arrival-track={unitArrivalTrack}
      data-unit-arrival-start-delta={`${unitArrivalStartDelta.x},${unitArrivalStartDelta.y}`}
      data-reveal-transition={revealTransition}
      data-departure-state={departing ? 'withdrawing' : 'none'}
      data-departure-track={unitDeparture ? unitDepartureTrack(unitDeparture) : undefined}
      data-departing-unit-ids={departingUnitIds.join(',')}
      data-painted-layers={boardFrame.paintedLayers.join(',')}
      aria-busy={!boardVisible && !boardFrame.error ? true : undefined}
      inert={!boardVisible && !boardFrame.error ? true : undefined}
      className={`skirmish-board-lab ${className} ${boardVisible ? '' : 'is-board-loading'} ${boardFrame.error ? 'is-board-error' : ''} ${drag ? 'is-dragging' : ''} ${interactionEnabled ? '' : 'is-read-only'}`.trim()}
    >
      {boardFrame.error ? (
        <div className="board-load-error" role="alert">
          <strong>Board artwork could not be loaded.</strong>
          <button type="button" onClick={boardFrame.retry}>Retry</button>
        </div>
      ) : null}
      <ViewPane
        key={`${boardArt.signature}:${boardFrame.retryKey}`}
        kind="board"
        boardViewportMode="fill"
        ariaLabel={`${ariaLabel} viewport`}
        zoom={boardZoom}
        pan={boardPan}
        minZoom={PLAYER_TECHNICAL_MINIMUM_ZOOM}
        maxZoom={boardMaxZoom}
        onZoomChange={setZoom}
        onPanChange={setBoardPan}
        coverPolygon={cameraCoverPolygon}
        onMinimumZoomChange={setMinZoom}
        onViewportSizeChange={setViewViewportSize}
        onViewInteraction={markViewInteraction}
      >
        <BoardLabBoard
          board={board}
          assetFrameSrc={tileFrameSrc}
          macroTiles={exactBoard?.macroTiles}
          subterrain={exactBoard?.subterrain}
          visualTerrainCells={visualTerrainCells}
          boardZoom={boardZoom}
          boardPan={boardPan}
          className="skirmish-board-surface"
          ariaLabel={ariaLabel}
          showGrid={showGrid}
          predrawnPlate={predrawnPlate}
          onTerrainFirstFrame={acknowledgeTerrain}
          onBarrierFirstFrame={acknowledgeBarriers}
          onFrameError={boardFrame.fail}
          sceneLayer={(
            <SkirmishSceneLayer
              sceneBoard={sceneBoard}
              seed={seed}
              ambientCover={ambientSceneCover}
              livePieces={livePieces}
              previewPieces={previewPieces}
              unitArrivals={arrivalLifecycle}
              unitArrivalTrack={unitArrivalTrack}
              unitArrivalStartDelta={unitArrivalStartDelta}
              onArrivingUnitIdsChange={handleArrivingUnitIdsChange}
              unitDeparture={unitDeparture}
              onDepartingUnitIdsChange={setDepartingUnitIds}
              onUnitDepartureComplete={handleUnitDepartureComplete}
              draggingId={drag?.pieceId ?? null}
              noHopId={noHopId}
              premovedIds={premovedIds}
              afterGhosts={afterGhosts}
              occlusionMasks={predrawnOcclusionMasks}
              occlusionDepthMap={predrawnOcclusionDepthMap}
              predrawnBackgroundActive={predrawnBackgroundActive}
              onFirstFrame={acknowledgeScene}
              onFrameError={boardFrame.fail}
            />
          )}
          renderCellOverlay={({ cell, left, top }) => {
            if (!cell.asset && !cell.missing) return null;
            const key = `${cell.x},${cell.y}`;
            const visualFootprintStyle = predrawnBackgroundActive
              ? predrawnVisualFootprintClipStyleForCell(exactBoard?.surface, key)
              : undefined;
            if (renderCellOverlay) {
              return renderCellOverlay({
                cell,
                left,
                top,
                visualFootprintStyle: visualFootprintStyle as CSSProperties | undefined,
              });
            }
            const state = [
              localMoveSet.has(key) ? 'is-player-move' : '',
              promotionZoneSet.has(key) ? 'is-promotion-zone' : '',
              opponentMoveSet.has(key) ? 'is-enemy-move' : '',
              localAttackSet.has(key) ? 'is-player-attack' : '',
              moveSet.has(key) || dragTargetSet.has(key) ? 'is-move' : '',
              threatSet.has(key) ? 'is-threat' : '',
              blockedSet.has(key) ? 'is-blocked-candidate' : '',
              premoveTargetSet.has(key) ? 'is-premove-target' : '',
              premoveDestSet.has(key) ? 'is-premove' : '',
              dropAimKey === key ? 'is-drop-aim' : '',
              dropHoverKey === key && dragTargetSet.has(key) ? 'is-drop-hover' : '',
              showStoreSelection && game.pieces.some((piece) => piece.id === selectedId && piece.alive && piece.x === cell.x && piece.y === cell.y) ? 'is-selected' : '',
              premoveSelKey === key ? 'is-selected' : '',
              showStoreSelection && focusPiece && focusPiece.x === cell.x && focusPiece.y === cell.y ? 'is-focused-piece' : '',
              choosingPromotion && choosingPromotion.move.x === cell.x && choosingPromotion.move.y === cell.y ? 'is-selected' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                type="button"
                className={`skirmish-board-cell-hit ${state}`}
                aria-label={`Tile ${cell.x},${cell.y}`}
                data-cx={cell.x}
                data-cy={cell.y}
                style={visualFootprintStyle as CSSProperties | undefined}
                onPointerDown={(event) => onCellPointerDown(cell.x, cell.y, event)}
                onPointerMove={onCellPointerMove}
                onPointerUp={onCellPointerUp}
                onPointerCancel={onCellPointerCancel}
                onClick={() => {
                  // A drag emits a trailing click on release; the handler swallows it so the
                  // drop doesn't immediately re-select the piece it just moved. dragRef guards
                  // against a stray second-finger tap firing a move while a drag is in flight.
                  if (suppressClickRef.current || dragRef.current) return;
                  handleTile(cell.x, cell.y);
                }}
              >
                <PredrawnMoveHighlightPaint />
              </button>
            );
          }}
        >
          {!surfaceState ? <PremoveArrowLayer arrows={premoveChain} /> : null}
          {choosingPromotion && promotingPiece && promotionPickerSeat ? (
            <PawnPromotionPicker
              piece={promotingPiece}
              choices={choosingPromotion.choices}
              boardSeat={promotionPickerSeat}
              boardZoom={boardZoom}
              onChoose={choosePromotion}
            />
          ) : null}
        </BoardLabBoard>
      </ViewPane>
      {/* A battlefield overlay belongs to the measured screen viewport, not to the board world.
          TileGrid applies the camera transform to every child, so seating this inside
          BoardLabBoard scales and pans it with the terrain. Keep it beside ViewPane while
          cell overlays remain in board space. */}
      {boardOverlay}
      {/* The picked-up piece rides the cursor in screen space. Portaled to <body> so the board's
          own CSS transform can't become its containing block and misplace the fixed positioning;
          pointer-events:none so drop hit-testing sees the cells underneath (see cellFromPoint).
          left/top are owned imperatively (per-frame move + the useLayoutEffect reconcile), never
          in JSX — so a mid-drag re-render can't reset the ghost to a stale mount position. */}
      {drag
        ? createPortal(
            <img
              ref={ghostRef}
              className={`skirmish-drag-ghost is-${drag.side}`}
              src={drag.src ?? undefined}
              alt=""
              draggable={false}
              style={{ width: drag.w, height: drag.h }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
