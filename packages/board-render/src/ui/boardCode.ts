// A compact, URL-safe encoding of a level-editor board, so a board can be shared/inspected
// via `/editor/level?board=<code>`. Round-trips the editor's in-memory layers (tiles, units,
// doodads, cover, and linear features — roads + rivers). Used both to LOAD a board on mount
// and to EXPORT the current one.
//
// Wire shape (keys kept short): { c:cols, r:rows, pf?:playerFaction, ef?:enemyFaction,
//   fd?:{faction:defaultDir},
//   f?:fillTileId, t?:{cell:tileId}, h?:[cell], u?:{cell:[unitId,dir,faction]},
//   d?:{cell:doodadId}, p?:{anchorCell:propId}, mt?:[[macroTileId,x,y,breakMask?]], v?:{cell:density},
//   rd?:{cell:roadMaterial}, rv?:{cell:riverMaterial}, fe?:{edgeKey:fenceMaterial},
//   fp?:{vertexKey:fenceMaterial},
//   wl?:{edgeKey:wallMaterial}, wa?:{anchorEdgeKey:wallArtId},
//   st?:{"x,y:south|east":subterrainMaterial},
//   rc?:[edgeKey], rx?:[edgeKey], zn?:[[zoneId,zoneType,[cell],name?,color?]], z?:{cell:zoneType},
//   gr?:generatedRegionUnits, tw?:savedTownUnits, fr?:savedForestUnits,
//   pd?:[semanticMediaSlot,referenceFrameWidth,referenceFrameHeight,registration?],
//   pgf?:[version,x,y,width,height], cam?:[minX,minY,width,height],
//   fa?:[[instanceId,sourceArtId,pixelX,pixelY,direction,scale]],
//   da?:[top,right,bottom,left], df?:[cell], dt?:{cell:tileId}, dr?:{cell:feature},
//   dfe?:{edgeKey:fenceMaterial}, dfp?:{vertexKey:fenceMaterial}, dwl?:{edgeKey:wallMaterial} }.
// `pd[3]` is the stable compact legacy/v2/v3/v4/v5 registration string. Three-field `pd` records
// remain the byte-identical unregistered form.
// `f` fills every cell, then `t` overrides — so a "mostly one tile"
// board stays tiny; `h` punches intentional holes back out of that fill. The autotiling ribbon
// features split per kind on the wire (rd=roads, rv=rivers) and merge into one `features` map on
// decode. FENCES are edge-based, not per-cell: `fe` maps a shared-edge key (roadEdgeKey "x,y|x,y")
// to a fence material — same edge keying as `rc` (severed edges) and `rx` (forced outward exits).
// `fp` stores author-added fence posts at logical grid vertices ("x,y"); automatic degree-one
// fence endings remain derived from `fe`. `wl` is a plain wall material map; `wa` is the
// independent wall-art layer mounted on walls.
// `zn` is the authored gameplay-zone list; `z` is the legacy collapsed view (cell -> type) kept
// for old links/clients. `gr` stores editor-only generated-region units: saved cell selections
// plus the Generate panel settings needed to rerun them. `tw` and `fr` do the same for saved Town
// and Forest instances. base64url of the JSON (no padding, +/ -> -_).
//
// FORWARD/BACK-COMPAT: `z`/`p`/`fa`/`fe`/`fp`/`wl`/`wa`/`df`/`pgf` are emitted only when non-empty, so a board without them
// encodes byte-identically to a code that predates them, and an OLD code decodes them to empty.

import type { GroundCoverDensity } from '../core/groundCover';
import { macroTileAsset, macroTileBreakIndices, type MacroTilePlacement } from '../core/macroTiles';
import { defaultWallMaterial, fenceMaterials, wallMaterials, type FeatureKind, type FeatureMaterial, type RoadMaterial, type RiverMaterial, type FenceMaterial, type WallMaterial } from '../core/featureAutotile';
import { wallArt, wallArtAtEdge, type WallArtId } from '../core/wallArt';
import { canonicalizeSingletonZones, ZONE_COLORS, ZONE_TYPES, type ZoneColor, type ZoneType } from '../core/level';
import type { TileFamilyId } from '../core/tileSockets';
import { PLAYABLE_PIECE_TYPES, UNIT_FACINGS, UNIT_PALETTES, type PlayablePieceType, type UnitPalette } from '../core/pieces';
import type { UnitFacing } from '../core/types';
import { rookDirections, type Direction } from './unitCatalog';
import { generatorAreasBounds, normalizeGeneratorAreas } from '../core/generatorAreas';
import { cleanSubterrainPlacements, type SubterrainPlacementMap } from '../core/subterrain';
import {
  normalizePredrawnGenerationFrame,
  type PredrawnGenerationFrame,
} from '../core/predrawnGenerationFrame';
import {
  normalizePredrawnBoardRegistration,
  parsePredrawnBoardRegistration,
  serializePredrawnBoardPreviewRegistration,
  type PredrawnBoardCornerRegistration,
} from '../render/predrawnRegistration';
import {
  PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS,
  PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA,
  comparePredrawnMoveHighlightCellKeys,
  normalizePredrawnMoveHighlightProfile,
  type PredrawnMoveHighlightProfile,
} from '../render/predrawnMoveHighlight';
import {
  normalizeBoardCameraBounds,
  normalizeCameraZoomIn,
  type BoardCameraBounds,
} from '../render/boardCameraBounds';

/**
 * One painted autotiling feature cell (road or river): which linear feature it carries and its
 * surface material. (Fences are NOT here — they are edge-based, stored in `EditorBoard.fences`.)
 */
export interface FeatureCell {
  kind: FeatureKind;
  material: FeatureMaterial;
}

export interface EditorZoneEntry {
  id: string;
  name?: string;
  color?: ZoneColor;
  type: ZoneType;
  /** Piece types the automatic placer may not use in this Player Deployment zone (ADR-0367). */
  excludedPieceTypes?: PlayablePieceType[];
  tiles: string[];
}

export type BoardFactionDirections = Partial<Record<UnitPalette, UnitFacing>>;

/**
 * A board painting placed by hand: four corners dragged onto the board's own corners, which the
 * renderer honours as an exact projective registration.
 *
 * NO level uses this any more. Fortress Gate was the last, and it was migrated by baking its exact
 * registration into the raster — the same projective map, resampled onto the level's 16:9 viewing
 * pane — so the painting kept its position to the pixel while becoming an ordinary versioned
 * surface.
 *
 * Decoding it is kept anyway, because the document's own older revisions still carry it: restoring
 * one must bring its artwork back rather than a blank board. So anything deciding whether artwork
 * may paint still has to accept it (ADR-0528) — a check that understands only versioned surfaces
 * blanks the board of any level holding one.
 */
export interface LegacyPredrawnBoardSurface {
  kind: 'predrawn';
  slot: string;
  frameWidth: number;
  frameHeight: number;
  /** Optional whole-plate alignment consumed by saved editor, viewer, and gameplay surfaces. */
  registration?: PredrawnBoardCornerRegistration;
}

export interface PredrawnBoardWorldBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * One exact immutable background-version selection in canonical projected board space.
 * Pixels have already passed through any approved raster transform; renderers place them at
 * `worldBounds` without another hidden warp. An optional occlusion version is derived from and
 * validated against this exact background version.
 */
interface VersionedPredrawnBoardSurfaceBase {
  kind: 'predrawn';
  backgroundVersionId: string;
  occlusionVersionId?: string;
  frameWidth: number;
  frameHeight: number;
  worldBounds: PredrawnBoardWorldBounds;
}

export interface VersionedPredrawnBoardSurfaceV2 extends VersionedPredrawnBoardSurfaceBase {
  schemaVersion: 2;
}

export interface VersionedPredrawnBoardSurfaceV3 extends VersionedPredrawnBoardSurfaceBase {
  schemaVersion: 3;
  /** Exact visual-only cyan move-highlight calibration bound to this background version. */
  moveHighlightProfile: PredrawnMoveHighlightProfile;
}

export type VersionedPredrawnBoardSurface =
  | VersionedPredrawnBoardSurfaceV2
  | VersionedPredrawnBoardSurfaceV3;

export type PredrawnBoardSurface = LegacyPredrawnBoardSurface | VersionedPredrawnBoardSurface;

export function isVersionedPredrawnBoardSurface(
  surface: PredrawnBoardSurface,
): surface is VersionedPredrawnBoardSurface {
  return 'schemaVersion' in surface
    && (surface.schemaVersion === 2 || surface.schemaVersion === 3);
}

export type BoardBackgroundMode = 'legacy' | 'ai';

/**
 * Resolve the level's persisted background choice independently from its remembered AI surface.
 *
 * Older board codes did not carry an explicit mode, so a retained surface means AI for that
 * migration case. New callers may keep the same surface while selecting legacy rendering.
 */
export function boardBackgroundMode(board: {
  backgroundMode?: BoardBackgroundMode;
  surface?: PredrawnBoardSurface;
}): BoardBackgroundMode {
  if (board.backgroundMode === 'legacy') return 'legacy';
  // An explicit AI choice remains AI even when its remembered surface is missing or failed
  // normalization. Renderers must expose that as an unavailable AI state; silently falling back
  // to legacy pixels would change the saved Level's meaning and hide the broken selection.
  if (board.backgroundMode === 'ai') return 'ai';
  return board.surface?.kind === 'predrawn' ? 'ai' : 'legacy';
}

export type BoardGeneratedRegionCover = {
  type: TileFamilyId;
  knobs: { amount: number; amountRandom: number; density: number; densityRandom: number };
};

export type BoardGeneratedRegionSection = {
  terrain: TileFamilyId;
  share: number;
  locked?: boolean;
  covers?: BoardGeneratedRegionCover[];
  /** Share of this terrain section covered by composite terrain art, 0..1. */
  macroTileDensity?: number;
  /** Per-cell chance that generated composite art exposes its normal 1x1 tile, 0..1. */
  macroTileBreakup?: number;
};

export interface BoardGeneratedRegion {
  id: string;
  name: string;
  /** Board cell keys ("x,y") that this generated-region unit owns. */
  cells: string[];
  /** Generate panel terrain rows captured for reruns. */
  sections: BoardGeneratedRegionSection[];
  /** Randomness buffer percentage, 0..60. */
  buffer: number;
  /** Edge roughness, 0..1. */
  wiggle: number;
  /** Legacy region-wide density; new regions store this per section. */
  macroTileDensity?: number;
}

/**
 * One raw installed structure source placed as visual-only pre-drawn generation input.
 * Coordinates are unzoomed projected-scene pixels. The image is a floating overlay, not a tile,
 * footprint, contact point, or depth-bearing board object.
 */
export interface FloatingArtworkPlacement {
  id: string;
  sourceArtId: string;
  pixelX: number;
  pixelY: number;
  direction: Direction;
  scale: number;
}

/** One weighted source-art entry in a saved Forest recipe. */
export interface BoardForestTree {
  id: string;
  sourceArtId: string;
  weight: number;
}

export type BoardGeneratorSectionRelationship = 'distinct' | 'mixed';

/** One complete Forest approach inside the generator-owned composition. */
export interface BoardForestSection {
  id: string;
  /** Distinct starts a new generated territory; mixed shares the preceding territory. */
  relationship: BoardGeneratorSectionRelationship;
  trees: BoardForestTree[];
  density: number;
  jitter: number;
  scaleMin: number;
  scaleMax: number;
  randomFacing: boolean;
  facing: Direction;
  spacing: number;
  clumping: number;
  falloff: number;
}

/**
 * One saved Forest INSTANCE. Like a saved generated terrain region or Town, it owns its grid
 * area and complete rerunnable recipe; generated Scene Art remains ordinary editable board data.
 */
export interface BoardForest {
  id: string;
  name: string;
  /** Bounding box of `areas`. Layout templates are fitted to it; membership reads `areas`. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * Every patch of ground this Forest occupies, as a union. Absent means the single rectangle in
   * `bounds` — which is what every Forest saved before shift-drag existed carries.
   */
  areas?: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
  /** Complete approaches; the generator derives every internal territory from these. */
  sections: BoardForestSection[];
  /** Absent/false means Generate chooses a fresh seed; true opts into exact replay. */
  fixedSeed?: boolean;
  seed: number;
}

/**
 * One saved town INSTANCE, mirroring how BoardGeneratedRegion saves a generated terrain unit:
 * a named thing that owns an area, remembers the settings it was built from, and can be reselected
 * and regenerated later. A board carries as many as the author places.
 */
export interface BoardTownBuilding {
  id: string;
  sourceArtId: string;
  weight: number;
}

export interface BoardTownSection {
  id: string;
  /** Distinct starts a new generated territory; mixed shares the preceding territory. */
  relationship: BoardGeneratorSectionRelationship;
  plan: string;
  size: number;
  buildings: BoardTownBuilding[];
  scaleMean: number;
  scaleMin: number;
  scaleMax: number;
  plotWidth: number;
  landmarkIds: string[];
  setback: number;
  looseness: number;
  facingWobble: number;
  spacing: number;
  fit: string;
}

export interface BoardTown {
  id: string;
  name: string;
  /** Bounding box of `areas`. Layout templates are fitted to it; membership reads `areas`. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * Every patch of ground this town occupies, as a union. Absent means the single rectangle in
   * `bounds` — which is what every town saved before shift-drag existed carries.
   */
  areas?: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
  /** Complete approaches; the generator derives every internal territory from these. */
  sections: BoardTownSection[];
  /** Absent/false means Generate chooses a fresh seed; true opts into exact replay. */
  fixedSeed?: boolean;
  seed: number;
}

export interface EditorBoard {
  cols: number;
  rows: number;
  /** Player-camera coverage boundary in board-centred projected world pixels. */
  cameraBounds?: BoardCameraBounds;
  /**
   * How far a player may zoom IN on this level. Absent means the automatic ceiling.
   *
   * The automatic value can only reason about the level's own zoom floor; it has no knowledge of
   * how much detail the environment artwork actually holds at this board size. Only the author
   * knows that, so the author can state it.
   */
  cameraZoomIn?: number;
  /** Level-editor/art-handoff presentation only. Extends terrain beyond the tactical bounds;
   * apron cells are never gameplay addresses and never project into Level layers. */
  decorativeApron?: { top: number; right: number; bottom: number; left: number };
  /** Render-only generated terrain keyed by coordinates outside the playable board. */
  decorativeCells?: Record<string, string>;
  /** Explicit render-only scenic cells outside the playable board, independent of their material. */
  decorativeFootprint?: string[];
  decorativeFeatures?: Record<string, FeatureCell>;
  decorativeFences?: Record<string, FenceMaterial>;
  decorativeFencePosts?: Record<string, FenceMaterial>;
  decorativeWalls?: Record<string, WallMaterial>;
  /** Palette faction the human player controls. Undefined/null means choose at play-load time. */
  playerFaction?: string | null;
  /**
   * Palette faction the CPU opposition wears. Declared alongside `playerFaction` so the pair is the
   * level's authored roster of sides rather than something inferred from whatever colours happen to
   * be painted — a board with no enemy pieces yet still knows what colour its enemy is.
   *
   * Undefined means the declaration has never been authored; readers resolve it from the painted
   * units and fall back to the classic pairing. Every unit still carries its own palette, so this
   * field is the DECLARATION, not the per-piece colour.
   */
  enemyFaction?: string | null;
  /** Per-faction default facing used when the level editor places new units. */
  factionDirections?: BoardFactionDirections;
  cells: Record<string, string>;
  /**
   * The saved background choice. Missing is accepted only for legacy in-memory callers and is
   * normalized from the remembered surface; every newly encoded board persists the resolved mode.
   */
  backgroundMode?: BoardBackgroundMode;
  /** Remembered AI artwork selection. It remains present while `backgroundMode` is `legacy`. */
  surface?: PredrawnBoardSurface;
  /**
   * The owner has deliberately placed the playable grid over the artwork by hand — resizing it or
   * sliding it across the plate — so the selection no longer claims to depict this exact terrain.
   *
   * The artwork stays the same immutable artifact and every identity, lineage, and completeness
   * check still applies. Only the environment-geometry comparison is dropped, because the owner
   * has answered that question themselves. Setting a newly generated artifact clears this again.
   */
  predrawnGridDetached?: boolean;
  /**
   * Owner-authored placement of the artwork under the playable grid, in projected board pixels.
   *
   * The selection's own `worldBounds` stay byte-exact because they are part of the artifact's
   * identity and every lineage check compares them. This is the separate, Level-side answer to
   * "where do I want the picture to sit", which is the owner's to move and nobody else's.
   */
  predrawnPlateOffset?: { left: number; top: number };
  /** Owner-authored native-1x 16:9 crop for the canonical pre-drawn generation reference. */
  predrawnGenerationFrame?: PredrawnGenerationFrame;
  /** Opaque multi-cell terrain tops that replace the covered 1x1 top sprites. */
  macroTiles?: MacroTilePlacement[];
  units: Record<string, { unitId: string; direction: string; faction: string }>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props (trees/houses), keyed by ANCHOR cell "x,y" -> {propId} (mirrors doodads). */
  props: Record<string, { propId: string }>;
  /**
   * Anchors in `props` that STAND ON a pre-drawn plate instead of being painted into it (ADR-0537).
   *
   * A plate board's props are ordinarily the picture's own pixels — generated from that geometry,
   * suppressed at render, kept only for their colliders. A rock the owner places after the art
   * exists is the opposite: nothing depicts it, so it must draw live and take part in the board's
   * entrance. One marker set rather than a second props map, so occupancy, erase, move, resize and
   * the gameplay projection keep working off the single canonical channel.
   *
   * Absent on every board authored before this existed, which is exactly right: their props ARE
   * baked, and they keep rendering as they always have.
   */
  liveProps?: string[];
  /** Floating, gameplay-inert source artwork used by the pre-drawn generation reference. */
  floatingArtwork?: FloatingArtworkPlacement[];
  cover: Record<string, GroundCoverDensity>;
  /**
   * The seed each painted cover cell was rolled with, baked at paint time. Absent for every board
   * authored before cover was baked; those cells fall back to LEGACY_GROUND_COVER_SEED and so keep
   * rendering exactly as they always have. Baking is what stops the cover brush's seed control
   * from re-styling grass that is already down.
   */
  coverSeeds?: Record<string, number>;
  /** Per-cell cover-set OVERRIDE (cell "x,y" -> cover family), decoupling ground cover from the
   * tile's terrain (e.g. grass tufts on a stone region). A cell absent here falls back to its own
   * tile terrain (the classic behaviour). Optional + back-compat (like `zones`). */
  coverTypes?: Record<string, TileFamilyId>;
  features: Record<string, FeatureCell>;
  /** Edge fences, keyed by the shared-edge key (roadEdgeKey "x,y|x,y") -> fence material.
   * Edge-based (a wall between two tiles), not per-cell — mirrors featureCuts/featureExits.
   * Optional + back-compat (like `zones`): a bare board literal omits it; `decodeBoard` always
   * returns it populated (empty for an old code). */
  fences?: Record<string, FenceMaterial>;
  /** Author-added fence posts, keyed by logical grid vertex "x,y" -> material. Vertex bounds are
   * inclusive (0..cols, 0..rows), unlike cell keys. These supplement the automatic degree-one
   * fence endings and may stand alone without an incident fence. */
  fencePosts?: Record<string, FenceMaterial>;
  /** Edge walls, keyed like fences, but valid only on the northmost/westmost map perimeter.
   * Saves as its own visual channel while `editorBoardToLevel` projects it into the same
   * durable blocked-edge list as fences. Values are plain wall material ids. */
  walls?: Record<string, WallMaterial>;
  /** Wall art mounted on existing perimeter walls, keyed by anchor edge. A wall art item may span
   * multiple wall edges; only the anchor is stored, matching props' anchor-cell model. */
  wallArt?: Record<string, WallArtId>;
  /** Explicit opt-in vertical surfaces. A terrain tile never supplies a default. */
  subterrain?: SubterrainPlacementMap;
  featureCuts: Record<string, true>;
  featureExits: Record<string, true>;
  /** Authored gameplay zone entries. Empty entries are allowed so the editor's zone dropdown can
   * preserve an author's chosen N even before any cells are painted. */
  zoneEntries?: EditorZoneEntry[];
  /** Legacy collapsed gameplay zones, keyed by cell "x,y" -> zone type. Kept as a compatibility
   * view for old board codes and renderer overlays; entries are the source of truth when present. */
  zones?: Record<string, ZoneType>;
  /** Editor-only generated-region units: saved selections + Generate panel settings. */
  generatedRegions?: BoardGeneratedRegion[];
  /** Saved town instances: the selection each owns plus the settings it was generated from. */
  towns?: BoardTown[];
  /** Saved Forest instances: grid selection plus the complete weighted rerun recipe. */
  forests?: BoardForest[];
}

const enc = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const nonEmpty = (o: object): boolean => Object.keys(o).length > 0;
const validFactions = new Set<string>(UNIT_PALETTES);
const validFacings = new Set<string>(UNIT_FACINGS);
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clampNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const validZoneTypes = new Set<string>(ZONE_TYPES);
const validPieceTypes = new Set<string>(PLAYABLE_PIECE_TYPES);
const validZoneColors = new Set<string>(ZONE_COLORS);
const validWallMaterial = (value: string): boolean => wallMaterials().includes(value);
const validFenceMaterial = (value: string): boolean => fenceMaterials().includes(value);
const validArtworkDirections = new Set<string>(rookDirections);
const floatingArtworkIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;
export const MAX_FLOATING_ARTWORK_PIXEL = 8192;
const mediaSlotSegmentPattern = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PREDRAWN_FRAME_DIMENSION = 8192;
const MAX_PREDRAWN_WORLD_COORDINATE = 1_000_000;

function normalizePredrawnWorldBounds(value: unknown): PredrawnBoardWorldBounds | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const minX = Number(record.minX);
  const minY = Number(record.minY);
  const width = Number(record.width);
  const height = Number(record.height);
  if (
    !Number.isFinite(minX)
    || !Number.isFinite(minY)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || Math.abs(minX) > MAX_PREDRAWN_WORLD_COORDINATE
    || Math.abs(minY) > MAX_PREDRAWN_WORLD_COORDINATE
    || width <= 0
    || height <= 0
    || width > MAX_PREDRAWN_WORLD_COORDINATE
    || height > MAX_PREDRAWN_WORLD_COORDINATE
  ) return undefined;
  return { minX, minY, width, height };
}

/**
 * The selected surface as it should be DRAWN, with the owner's plate offset folded into its world
 * bounds.
 *
 * Every renderer — editor plate, gameplay, browser and server thumbnails, and the occlusion depth
 * map — must place the artwork through this so they cannot drift apart. Identity, lineage, and
 * validity code keeps reading `board.surface` directly, because those compare the artifact's own
 * exact bounds and must never see the owner's placement.
 */
export function predrawnRenderSurface(board: {
  surface?: PredrawnBoardSurface;
  predrawnPlateOffset?: { left: number; top: number };
}): PredrawnBoardSurface | undefined {
  const { surface, predrawnPlateOffset: offset } = board;
  if (!surface || !offset || (offset.left === 0 && offset.top === 0)) return surface;
  if (!isVersionedPredrawnBoardSurface(surface)) return surface;
  return {
    ...surface,
    worldBounds: {
      ...surface.worldBounds,
      minX: surface.worldBounds.minX + offset.left,
      minY: surface.worldBounds.minY + offset.top,
    },
  };
}

/** Validate the persisted half of a pre-drawn surface without resolving its live media. */
export function normalizePredrawnBoardSurface(value: unknown): PredrawnBoardSurface | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'predrawn') return undefined;
  const frameWidth = Number(record.frameWidth);
  const frameHeight = Number(record.frameHeight);
  if (
    !Number.isSafeInteger(frameWidth)
    || !Number.isSafeInteger(frameHeight)
    || frameWidth < 1
    || frameHeight < 1
    || frameWidth > MAX_PREDRAWN_FRAME_DIMENSION
    || frameHeight > MAX_PREDRAWN_FRAME_DIMENSION
  ) return undefined;
  if (record.schemaVersion === 2 || record.schemaVersion === 3) {
    const backgroundVersionId = typeof record.backgroundVersionId === 'string'
      ? record.backgroundVersionId.trim().toLowerCase()
      : '';
    const occlusionVersionId = typeof record.occlusionVersionId === 'string'
      ? record.occlusionVersionId.trim().toLowerCase()
      : undefined;
    const worldBounds = normalizePredrawnWorldBounds(record.worldBounds);
    if (
      !uuidPattern.test(backgroundVersionId)
      || (occlusionVersionId !== undefined && !uuidPattern.test(occlusionVersionId))
      || !worldBounds
    ) return undefined;
    if (record.schemaVersion === 3) {
      const moveHighlightProfile = normalizePredrawnMoveHighlightProfile(
        record.moveHighlightProfile,
      );
      if (
        !moveHighlightProfile
        || moveHighlightProfile.backgroundVersionId !== backgroundVersionId
      ) return undefined;
      return {
        kind: 'predrawn',
        schemaVersion: 3,
        backgroundVersionId,
        ...(occlusionVersionId ? { occlusionVersionId } : {}),
        frameWidth,
        frameHeight,
        worldBounds,
        moveHighlightProfile,
      };
    }
    return {
      kind: 'predrawn',
      schemaVersion: 2,
      backgroundVersionId,
      ...(occlusionVersionId ? { occlusionVersionId } : {}),
      frameWidth,
      frameHeight,
      worldBounds,
    };
  }
  if (typeof record.slot !== 'string') return undefined;
  const slot = record.slot.trim();
  const segments = slot.split('/');
  if (
    !slot
    || slot.length > 512
    || slot.includes('//')
    || slot.endsWith('/')
    || segments.some((segment) => segment === '.' || segment === '..' || !mediaSlotSegmentPattern.test(segment))
  ) return undefined;
  const registration = normalizePredrawnBoardRegistration(record.registration);
  return {
    kind: 'predrawn',
    slot,
    frameWidth,
    frameHeight,
    ...(registration ? { registration } : {}),
  };
}

function cellParts(key: string): [number, number] | null {
  const [xs, ys] = key.split(',');
  const x = Number(xs), y = Number(ys);
  return Number.isInteger(x) && Number.isInteger(y) ? [x, y] : null;
}

function inBoardKey(key: string, cols: number, rows: number): boolean {
  const p = cellParts(key);
  return !!p && p[0] >= 0 && p[0] < cols && p[1] >= 0 && p[1] < rows;
}

/** Keep only canonical integer grid vertices inside the board's inclusive vertex bounds. */
function cleanFencePosts(value: unknown, cols: number, rows: number): Record<string, FenceMaterial> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, FenceMaterial> = {};
  for (const [key, material] of Object.entries(value as Record<string, unknown>)) {
    const parts = key.split(',');
    if (parts.length !== 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    // Requiring the re-serialized key to match rejects fractions, whitespace, leading zeroes,
    // extra components, and other aliases that could otherwise name the same geometric vertex.
    if (!Number.isInteger(x) || !Number.isInteger(y) || `${x},${y}` !== key) continue;
    if (x < 0 || x > cols || y < 0 || y > rows) continue;
    if (typeof material !== 'string' || !validFenceMaterial(material)) continue;
    out[key] = material as FenceMaterial;
  }
  return out;
}

function sortCellKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = cellParts(a) ?? [0, 0];
    const pb = cellParts(b) ?? [0, 0];
    return pa[1] - pb[1] || pa[0] - pb[0];
  });
}

/** Keep only canonical safe-integer cell keys outside the playable board. */
function cleanDecorativeFootprint(value: unknown, cols: number, rows: number): string[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  for (const rawKey of value) {
    if (typeof rawKey !== 'string') continue;
    const parts = rawKey.split(',');
    if (parts.length !== 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    // Exact re-serialization rejects fractions, whitespace, leading zeroes, exponents, and aliases
    // such as `-0` that could otherwise name the same logical cell more than once.
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || `${x},${y}` !== rawKey) continue;
    if (x >= 0 && x < cols && y >= 0 && y < rows) continue;
    keys.add(rawKey);
  }
  return sortCellKeys([...keys]);
}

/** Coordinates that may own visual terrain faces; gameplay membership is deliberately irrelevant. */
function visualTerrainSurfaceKeys(
  cells: Readonly<Record<string, unknown>>,
  cols: number,
  rows: number,
  apron: { top: number; right: number; bottom: number; left: number } | undefined,
  footprint: readonly string[],
): Set<string> {
  const keys = new Set(Object.keys(cells));
  const top = apron?.top ?? 0;
  const right = apron?.right ?? 0;
  const bottom = apron?.bottom ?? 0;
  const left = apron?.left ?? 0;
  for (let y = -top; y < rows + bottom; y += 1) {
    for (let x = -left; x < cols + right; x += 1) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) continue;
      keys.add(`${x},${y}`);
    }
  }
  for (const key of footprint) keys.add(key);
  return keys;
}

/** Deduplicate and order a zone's barred types so the same authored intent always encodes alike. */
function cleanExcludedPieceTypes(value: unknown): PlayablePieceType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const types: PlayablePieceType[] = value.includes('king') ? ['king'] : [];
  return types.length ? types : undefined;
}

function normalizeZoneEntries(entries: readonly EditorZoneEntry[] | undefined, cols: number, rows: number): EditorZoneEntry[] {
  const out: EditorZoneEntry[] = [];
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!entry || typeof entry.id !== 'string' || !validZoneTypes.has(entry.type) || !Array.isArray(entry.tiles)) continue;
    const seen = new Set<string>();
    const tiles: string[] = [];
    for (const rawKey of entry.tiles) {
      const key = String(rawKey);
      if (seen.has(key) || !inBoardKey(key, cols, rows)) continue;
      seen.add(key);
      tiles.push(key);
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined;
    const color = entry.color && validZoneColors.has(entry.color) ? entry.color : undefined;
    // Only the general Player Deployment zone can bar a type; a dedicated zone already holds one
    // type and every other zone type would have no meaning for the list, so it is dropped rather
    // than carried as dead state.
    const excludedPieceTypes = entry.type === 'player-spawn' ? cleanExcludedPieceTypes(entry.excludedPieceTypes) : undefined;
    out.push({
      id: entry.id.trim() || `zone-${index + 1}`,
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      type: entry.type,
      ...(excludedPieceTypes ? { excludedPieceTypes } : {}),
      tiles: sortCellKeys(tiles),
    });
  }
  // At most one Player Deployment, King Deployment and Enemy Deployment zone can survive a
  // normalize, so no decode, paste or legacy import can reintroduce a duplicate (ADR-0367).
  return canonicalizeSingletonZones(out).map((entry) => ({ ...entry, tiles: sortCellKeys(entry.tiles) }));
}

export function zoneCellMapFromEntries(entries: readonly EditorZoneEntry[] | undefined): Record<string, ZoneType> {
  const zones: Record<string, ZoneType> = {};
  for (const entry of entries ?? []) {
    if (!entry || !validZoneTypes.has(entry.type)) continue;
    for (const key of entry.tiles) zones[key] = entry.type;
  }
  return zones;
}

export function zoneEntriesFromCellMap(channel: Record<string, ZoneType> | undefined, cols: number, rows: number): EditorZoneEntry[] {
  if (!channel) return [];
  const byType = new Map<ZoneType, string[]>();
  for (const [key, type] of Object.entries(channel)) {
    if (!validZoneTypes.has(type) || !inBoardKey(key, cols, rows)) continue;
    const list = byType.get(type) ?? [];
    list.push(key);
    byType.set(type, list);
  }
  const entries: EditorZoneEntry[] = [];
  for (const type of ZONE_TYPES) {
    const tiles = byType.get(type);
    if (!tiles?.length) continue;
    entries.push({ id: `z-${type}`, type, tiles: sortCellKeys(tiles) });
  }
  return entries;
}

function cleanFactionDirections(value: unknown): BoardFactionDirections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: BoardFactionDirections = {};
  for (const [faction, direction] of Object.entries(value as Record<string, unknown>)) {
    if (!validFactions.has(faction) || !validFacings.has(String(direction))) continue;
    out[faction as UnitPalette] = direction as UnitFacing;
  }
  return out;
}

/** Pick the tile id covering the most cells, so it can be the cheap `f` fill base. */
function dominantTile(cells: Record<string, string>): string | undefined {
  const counts = new Map<string, number>();
  for (const id of Object.values(cells)) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: string | undefined, n = 0;
  for (const [id, c] of counts) if (c > n) { n = c; best = id; }
  return best;
}

function isInBoundsCellKey(key: string, cols: number, rows: number): boolean {
  const [xRaw, yRaw] = key.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < cols && y < rows;
}

function isInScenicBoundsCellKey(key: string, cols: number, rows: number, apron: EditorBoard['decorativeApron']): boolean {
  const [xRaw, yRaw] = key.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  const extents = apron ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= -extents.left && x < cols + extents.right
    && y >= -extents.top && y < rows + extents.bottom;
}

function cleanFloatingArtwork(value: unknown): FloatingArtworkPlacement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FloatingArtworkPlacement[] = [];
  for (const raw of value) {
    const tuple = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? [
            (raw as Record<string, unknown>).id,
            (raw as Record<string, unknown>).sourceArtId,
            (raw as Record<string, unknown>).pixelX,
            (raw as Record<string, unknown>).pixelY,
            (raw as Record<string, unknown>).direction,
            (raw as Record<string, unknown>).scale,
          ]
        : null;
    if (!tuple) continue;
    const id = typeof tuple[0] === 'string' ? tuple[0].trim() : '';
    const sourceArtId = typeof tuple[1] === 'string' ? tuple[1].trim() : '';
    const pixelX = Number(tuple[2]);
    const pixelY = Number(tuple[3]);
    const direction = String(tuple[4] ?? '');
    const scale = Number(tuple[5]);
    if (
      !floatingArtworkIdPattern.test(id)
      || !floatingArtworkIdPattern.test(sourceArtId)
      || seen.has(id)
      || !Number.isSafeInteger(pixelX)
      || !Number.isSafeInteger(pixelY)
      || Math.abs(pixelX) > MAX_FLOATING_ARTWORK_PIXEL
      || Math.abs(pixelY) > MAX_FLOATING_ARTWORK_PIXEL
      || !validArtworkDirections.has(direction)
      || !Number.isFinite(scale)
      || scale < 0.1
      || scale > 8
    ) continue;
    seen.add(id);
    out.push({ id, sourceArtId, pixelX, pixelY, direction: direction as Direction, scale });
  }
  return out;
}

/**
 * Baked cover seeds, kept only for cells that actually carry cover. A seed without cover is dead
 * weight in the code and would resurrect if that cell were ever painted again.
 */
const townIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,63}$/;

/** More patches than an author can keep track of is a corrupt document, not an ambitious town. */
const MAX_GENERATOR_AREAS = 32;

type GeneratorAreaRect = { minX: number; minY: number; maxX: number; maxY: number };

const readGeneratorAreaRect = (value: unknown): GeneratorAreaRect | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rect = ['minX', 'minY', 'maxX', 'maxY'].map((key) => Number(raw[key]));
  if (rect.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 4096)) return null;
  return {
    minX: Math.min(rect[0], rect[2]),
    minY: Math.min(rect[1], rect[3]),
    maxX: Math.max(rect[0], rect[2]),
    maxY: Math.max(rect[1], rect[3]),
  };
};

/**
 * The patches a saved generator occupies. A document written before shift-drag existed carries
 * only `bounds`, which is exactly the one-rectangle case, so it needs no migration: the fallback
 * IS the old meaning. Patches another patch already covers are dropped, because every membership
 * test walks this list.
 */
function cleanGeneratorAreas(value: unknown, bounds: GeneratorAreaRect): GeneratorAreaRect[] {
  if (!Array.isArray(value)) return [bounds];
  const parsed = value
    .slice(0, MAX_GENERATOR_AREAS)
    .map(readGeneratorAreaRect)
    .filter((rect): rect is GeneratorAreaRect => rect !== null);
  return parsed.length ? normalizeGeneratorAreas(parsed) : [bounds];
}

/** Saved town instances, rejecting anything that could not be regenerated from. */
function cleanTowns(value: unknown): BoardTown[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: BoardTown[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const t = raw as Record<string, unknown>;
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const bounds = t.bounds as Record<string, unknown> | undefined;
    if (!townIdPattern.test(id) || seen.has(id) || !bounds || typeof bounds !== 'object') continue;
    const rect = ['minX', 'minY', 'maxX', 'maxY'].map((k) => Number((bounds as Record<string, unknown>)[k]));
    if (rect.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 4096)) continue;
    const globalSize = Math.round(clampNumber(t.size, 14, 1, 400));
    const parsedSections: Array<BoardTownSection & { authoredSize: boolean; legacyShare: number }> = Array.isArray(t.sections)
      ? (t.sections as unknown[]).flatMap((rawSection) => {
        if (!rawSection || typeof rawSection !== 'object') return [];
        const sec = rawSection as Record<string, unknown>;
        const sectionId = typeof sec.id === 'string' ? sec.id.trim() : '';
        if (!townIdPattern.test(sectionId)) return [];
        // Accept the flat id list this shipped with for an afternoon, so a board saved then still
        // opens: each id becomes an evenly weighted entry.
        const legacy = Array.isArray(sec.buildingIds)
          ? (sec.buildingIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x)
              .map((sourceArtId, index) => ({ id: `b${index}`, sourceArtId, weight: 1 }))
          : [];
        const buildings = Array.isArray(sec.buildings)
          ? (sec.buildings as unknown[]).flatMap((rawEntry) => {
            if (!rawEntry || typeof rawEntry !== 'object') return [];
            const entry = rawEntry as Record<string, unknown>;
            const entryId = typeof entry.id === 'string' ? entry.id.trim() : '';
            const sourceArtId = typeof entry.sourceArtId === 'string' ? entry.sourceArtId.trim() : '';
            if (!townIdPattern.test(entryId) || !sourceArtId) return [];
            return [{ id: entryId, sourceArtId, weight: clampNumber(entry.weight, 1, 0, 100) }];
          })
          : [];
        return [{
          id: sectionId,
          relationship: sec.relationship === 'mixed' ? 'mixed' as const : 'distinct' as const,
          plan: typeof sec.plan === 'string' ? sec.plan : (typeof t.plan === 'string' ? t.plan : 'linear'),
          size: Math.round(clampNumber(sec.size, globalSize, 1, 400)),
          authoredSize: Number.isFinite(Number(sec.size)),
          buildings: buildings.length ? buildings : legacy,
          legacyShare: clampNumber(sec.share, 1, 0, 100),
          scaleMean: clampNumber(sec.scaleMean, 1, 0.1, 8),
          scaleMin: clampNumber(sec.scaleMin, 0.75, 0.1, 8),
          scaleMax: clampNumber(sec.scaleMax, 1.35, 0.1, 8),
          // Frontage moved from the town onto the section; fall back to the town's old value.
          plotWidth: clampNumber(sec.plotWidth, clampNumber(t.plotWidth, 110, 10, 1000), 10, 1000),
          landmarkIds: Array.isArray(sec.landmarkIds)
            ? (sec.landmarkIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x)
            : [],
          setback: clampNumber(sec.setback, clampNumber(t.setback, 78, 1, 1000), 1, 1000),
          looseness: clampNumber(sec.looseness, clampNumber(t.looseness, 0.45, 0, 1), 0, 1),
          facingWobble: clampNumber(sec.facingWobble, clampNumber(t.facingWobble, 0.2, 0, 1), 0, 1),
          spacing: clampNumber(sec.spacing, clampNumber(t.spacing, 10, 0, 1000), 0, 1000),
          fit: sec.fit === 'drop' || (sec.fit === undefined && t.fit === 'drop') ? 'drop' : 'shrink',
        }];
      })
      : [];
    const shareTotal = parsedSections.reduce((sum, section) => sum + section.legacyShare, 0) || parsedSections.length;
    const legacyLandmarks = Array.isArray(t.landmarkIds)
      ? (t.landmarkIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x)
      : [];
    const legacyMixed = clampNumber(t.blend, 0.35, 0, 1) >= 0.5;
    const sections: BoardTownSection[] = parsedSections.map(({ authoredSize, legacyShare, ...section }, index) => ({
      ...section,
      relationship: index === 0 ? 'distinct' : (
        (t.sections as unknown[])[index] && typeof (t.sections as unknown[])[index] === 'object'
          && ((t.sections as unknown[])[index] as Record<string, unknown>).relationship === 'mixed'
          ? 'mixed'
          : legacyMixed ? 'mixed' : 'distinct'
      ),
      size: authoredSize
        ? section.size
        : Math.max(1, Math.round(globalSize * (legacyShare || 1) / shareTotal)),
      landmarkIds: section.landmarkIds.length || index > 0 ? section.landmarkIds : legacyLandmarks,
    }));
    seen.add(id);
    const areas = cleanGeneratorAreas(t.areas, {
      minX: Math.min(rect[0], rect[2]),
      minY: Math.min(rect[1], rect[3]),
      maxX: Math.max(rect[0], rect[2]),
      maxY: Math.max(rect[1], rect[3]),
    });
    out.push({
      id,
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 64) : id,
      // `bounds` is derived, never authored: it is the union's box, so it cannot disagree with it.
      bounds: generatorAreasBounds(areas),
      // One patch is the whole meaning of `bounds`; writing it out too would grow every board code
      // that never used shift-drag.
      ...(areas.length > 1 ? { areas } : {}),
      sections,
      ...(t.fixedSeed === true ? { fixedSeed: true } : {}),
      seed: Math.round(clampNumber(t.seed, 1, 1, 0xffffffff)),
    });
  }
  return out;
}

/** Saved Forest instances, rejecting any entry that cannot be regenerated deterministically. */
function cleanForests(value: unknown): BoardForest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: BoardForest[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const forest = raw as Record<string, unknown>;
    const id = typeof forest.id === 'string' ? forest.id.trim() : '';
    const bounds = forest.bounds as Record<string, unknown> | undefined;
    if (!townIdPattern.test(id) || seen.has(id) || !bounds || typeof bounds !== 'object') continue;
    const rect = ['minX', 'minY', 'maxX', 'maxY'].map((key) => Number(bounds[key]));
    if (rect.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 4096)) continue;
    const cleanTrees = (rawTrees: unknown): BoardForestTree[] => {
      const treeIds = new Set<string>();
      return Array.isArray(rawTrees)
      ? (rawTrees as unknown[]).flatMap((rawTree) => {
        if (!rawTree || typeof rawTree !== 'object' || Array.isArray(rawTree)) return [];
        const tree = rawTree as Record<string, unknown>;
        const treeId = typeof tree.id === 'string' ? tree.id.trim() : '';
        const sourceArtId = typeof tree.sourceArtId === 'string' ? tree.sourceArtId.trim() : '';
        if (!townIdPattern.test(treeId) || treeIds.has(treeId) || !floatingArtworkIdPattern.test(sourceArtId)) return [];
        treeIds.add(treeId);
        return [{ id: treeId, sourceArtId, weight: clampNumber(tree.weight, 1, 0, 100) }];
      })
      : [];
    };
    const rawSections = Array.isArray(forest.sections)
      ? forest.sections as unknown[]
      : [{ id: 's0', ...forest }];
    const sectionIds = new Set<string>();
    const sections: BoardForestSection[] = rawSections.flatMap((rawSection, index) => {
      if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) return [];
      const section = rawSection as Record<string, unknown>;
      const sectionId = typeof section.id === 'string' ? section.id.trim() : '';
      if (!townIdPattern.test(sectionId) || sectionIds.has(sectionId)) return [];
      sectionIds.add(sectionId);
      const facing = validArtworkDirections.has(String(section.facing))
        ? String(section.facing) as Direction
        : 'south';
      return [{
        id: sectionId,
        relationship: index > 0 && section.relationship === 'mixed' ? 'mixed' : 'distinct',
        trees: cleanTrees(section.trees),
        density: clampNumber(section.density, 1.6, 0.2, 6),
        jitter: clampNumber(section.jitter, 0.85, 0, 1),
        scaleMin: clampNumber(section.scaleMin, 0.8, 0.1, 8),
        scaleMax: clampNumber(section.scaleMax, 1.3, 0.1, 8),
        randomFacing: section.randomFacing !== false,
        facing,
        spacing: clampNumber(section.spacing, 26, 0, 1000),
        clumping: clampNumber(section.clumping, 0.45, 0, 1),
        falloff: clampNumber(section.falloff, 0.35, 0, 1),
      }];
    });
    seen.add(id);
    const areas = cleanGeneratorAreas(forest.areas, {
      minX: Math.min(rect[0], rect[2]),
      minY: Math.min(rect[1], rect[3]),
      maxX: Math.max(rect[0], rect[2]),
      maxY: Math.max(rect[1], rect[3]),
    });
    out.push({
      id,
      name: typeof forest.name === 'string' && forest.name.trim()
        ? forest.name.trim().slice(0, 64)
        : id,
      bounds: generatorAreasBounds(areas),
      ...(areas.length > 1 ? { areas } : {}),
      sections,
      ...(forest.fixedSeed === true ? { fixedSeed: true } : {}),
      seed: Math.round(clampNumber(forest.seed, 1, 1, 0xffffffff)),
    });
  }
  return out;
}

function cleanCoverSeeds(
  value: unknown,
  cover: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!cover || cover[key] === undefined) continue;
    const seed = Number(raw);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) continue;
    out[key] = seed;
  }
  return out;
}

function cleanMacroTiles(value: unknown, cols: number, rows: number): MacroTilePlacement[] {
  if (!Array.isArray(value)) return [];
  const out: MacroTilePlacement[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string') continue;
    const assetId = raw[0].trim();
    const x = Number(raw[1]);
    const y = Number(raw[2]);
    if (!assetId || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const asset = macroTileAsset(assetId);
    if (asset && (x + asset.columns > cols || y + asset.rows > rows)) continue;
    const area = asset ? asset.columns * asset.rows : 31;
    const rawBreaks = raw[3];
    const breaks = Array.isArray(rawBreaks)
      ? [...new Set(rawBreaks.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < area))].sort((a, b) => a - b)
      : typeof rawBreaks === 'number' && Number.isSafeInteger(rawBreaks) && rawBreaks > 0
        ? Array.from({ length: area }, (_, index) => index).filter((index) => Math.floor(Number(rawBreaks) / (2 ** index)) % 2 === 1)
        : [];
    if (asset && breaks.length >= area) continue;
    const key = `${assetId}:${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ assetId, x, y, ...(breaks.length ? { breaks } : {}) });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
}

function encodeMacroTiles(value: MacroTilePlacement[] | undefined, cols: number, rows: number): unknown[] {
  return cleanMacroTiles((value ?? []).map((placement) => [
    placement.assetId,
    placement.x,
    placement.y,
    macroTileBreakIndices(placement),
  ]), cols, rows).map((placement) => {
    const breaks = macroTileBreakIndices(placement);
    if (!macroTileAsset(placement.assetId) && breaks.length > 0) {
      return [placement.assetId, placement.x, placement.y, breaks];
    }
    const breakMask = breaks.reduce((mask, index) => mask + (2 ** index), 0);
    return breakMask > 0
      ? [placement.assetId, placement.x, placement.y, breakMask]
      : [placement.assetId, placement.x, placement.y];
  });
}

function encodeGeneratedRegions(regions: BoardGeneratedRegion[] | undefined, cols: number, rows: number, apron?: EditorBoard['decorativeApron']): unknown[] {
  if (!regions?.length) return [];
  return regions
    .map((region) => {
      const cells = [...new Set(region.cells.filter((key) => isInScenicBoundsCellKey(key, cols, rows, apron)))];
      if (!cells.length) return null;
      return {
        i: region.id,
        n: region.name,
        c: cells,
        s: region.sections.map((section) => [
          section.terrain,
          section.share,
          section.locked ? 1 : 0,
          (section.covers ?? []).map((cover) => [
            cover.type,
            cover.knobs.amount,
            cover.knobs.amountRandom,
            cover.knobs.density,
            cover.knobs.densityRandom,
          ]),
          typeof section.macroTileDensity === 'number' ? clamp01(section.macroTileDensity) : null,
          typeof section.macroTileBreakup === 'number' ? clamp01(section.macroTileBreakup) : null,
        ]),
        b: region.buffer,
        w: region.wiggle,
        ...(typeof region.macroTileDensity === 'number' ? { m: clamp01(region.macroTileDensity) } : {}),
      };
    })
    .filter(Boolean) as unknown[];
}

function decodeGeneratedRegions(value: unknown, cols: number, rows: number, apron?: EditorBoard['decorativeApron']): BoardGeneratedRegion[] {
  if (!Array.isArray(value)) return [];
  const out: BoardGeneratedRegion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const id = typeof rec.i === 'string' && rec.i.trim() ? rec.i : `region-${out.length + 1}`;
    const name = typeof rec.n === 'string' && rec.n.trim() ? rec.n : `Region ${out.length + 1}`;
    const cells = Array.isArray(rec.c)
      ? [...new Set(rec.c.map(String).filter((key) => isInScenicBoundsCellKey(key, cols, rows, apron)))]
      : [];
    if (!cells.length) continue;
    const sections: BoardGeneratedRegionSection[] = [];
    if (Array.isArray(rec.s)) {
      for (const rawSection of rec.s) {
        if (!Array.isArray(rawSection)) continue;
        const covers: BoardGeneratedRegionCover[] = [];
        if (Array.isArray(rawSection[3])) {
          for (const rawCover of rawSection[3]) {
            if (!Array.isArray(rawCover)) continue;
            covers.push({
              type: String(rawCover[0]) as TileFamilyId,
              knobs: {
                amount: clampNumber(rawCover[1], 0.6, 0, 1),
                amountRandom: clampNumber(rawCover[2], 0.3, 0, 1),
                density: clampNumber(rawCover[3], 0.4, 0, 1),
                densityRandom: clampNumber(rawCover[4], 0.3, 0, 1),
              },
            });
          }
        }
        const section: BoardGeneratedRegionSection = {
          terrain: String(rawSection[0]) as TileFamilyId,
          share: Math.max(0, Math.min(100, Math.round(Number(rawSection[1]) || 0))),
          covers,
          ...(typeof rawSection[4] === 'number' ? { macroTileDensity: clamp01(rawSection[4]) } : {}),
          ...(typeof rawSection[5] === 'number' ? { macroTileBreakup: clamp01(rawSection[5]) } : {}),
        };
        if (rawSection[2] === 1 || rawSection[2] === true) section.locked = true;
        sections.push(section);
      }
    }
    out.push({
      id,
      name,
      cells,
      sections: sections.length ? sections : [{ terrain: 'grass' as TileFamilyId, share: 100, covers: [] }],
      buffer: Math.round(clampNumber(rec.b, 0, 0, 60)),
      wiggle: clamp01(clampNumber(rec.w, 0.5, 0, 1)),
      ...(typeof rec.m === 'number' ? { macroTileDensity: clamp01(rec.m) } : {}),
    });
  }
  return out;
}

export function encodeBoard(b: EditorBoard): string {
  const totalCells = Math.max(0, b.cols * b.rows);
  const paintedCells = Object.keys(b.cells).length;
  const fillCandidate = dominantTile(b.cells);
  // Sparse boards are often intentional gaps. Only use the fill shortcut once painted cells are
  // the majority; otherwise the explicit sparse `t` map is smaller and preserves holes naturally.
  const fill = fillCandidate && paintedCells > totalCells / 2 ? fillCandidate : undefined;
  const t: Record<string, string> = {};
  for (const [k, id] of Object.entries(b.cells)) if (id !== fill) t[k] = id;
  const h: string[] = [];
  if (fill) for (let y = 0; y < b.rows; y += 1) for (let x = 0; x < b.cols; x += 1) {
    const key = `${x},${y}`;
    if (!(key in b.cells)) h.push(key);
  }
  const wire: Record<string, unknown> = {
    c: b.cols,
    r: b.rows,
    bm: boardBackgroundMode(b),
  };
  // Only ever encoded when set, so every board that never left the artwork's own geometry keeps
  // byte-identical code and no existing level gains a field it did not have.
  if (b.predrawnGridDetached) wire.pgd = 1;
  if (b.predrawnPlateOffset && (b.predrawnPlateOffset.left !== 0 || b.predrawnPlateOffset.top !== 0)) {
    wire.ppo = [b.predrawnPlateOffset.left, b.predrawnPlateOffset.top];
  }
  const surface = normalizePredrawnBoardSurface(b.surface);
  if (surface) {
    wire.pd = isVersionedPredrawnBoardSurface(surface)
      ? [
          surface.schemaVersion,
          surface.backgroundVersionId,
          surface.occlusionVersionId ?? null,
          surface.frameWidth,
          surface.frameHeight,
          surface.worldBounds.minX,
          surface.worldBounds.minY,
          surface.worldBounds.width,
          surface.worldBounds.height,
          ...(surface.schemaVersion === 3
            ? [[
                surface.moveHighlightProfile.environmentGeometrySha256,
                surface.moveHighlightProfile.profileSha256,
                Object.entries(surface.moveHighlightProfile.cells)
                  .sort(([a], [b]) => comparePredrawnMoveHighlightCellKeys(a, b))
                  .map(([key, footprint]) => [key, ...footprint]),
              ]]
            : []),
        ]
      : [
          surface.slot,
          surface.frameWidth,
          surface.frameHeight,
          ...(surface.registration
            ? [serializePredrawnBoardPreviewRegistration(surface.registration)]
            : []),
        ];
  }
  const predrawnGenerationFrame = normalizePredrawnGenerationFrame(b.predrawnGenerationFrame);
  if (predrawnGenerationFrame) wire.pgf = [
    predrawnGenerationFrame.version,
    predrawnGenerationFrame.x,
    predrawnGenerationFrame.y,
    predrawnGenerationFrame.width,
    predrawnGenerationFrame.height,
  ];
  const cameraBounds = normalizeBoardCameraBounds(b.cameraBounds, b);
  if (cameraBounds) wire.cam = [
    cameraBounds.minX,
    cameraBounds.minY,
    cameraBounds.width,
    cameraBounds.height,
  ];
  const cameraZoomIn = normalizeCameraZoomIn(b.cameraZoomIn);
  if (cameraZoomIn !== undefined) wire.czi = cameraZoomIn;
  if (b.decorativeApron && Object.values(b.decorativeApron).some((value) => value > 0)) {
    wire.da = [b.decorativeApron.top, b.decorativeApron.right, b.decorativeApron.bottom, b.decorativeApron.left];
  }
  const decorativeFootprint = cleanDecorativeFootprint(b.decorativeFootprint, b.cols, b.rows);
  if (decorativeFootprint.length) wire.df = decorativeFootprint;
  if (b.decorativeCells && nonEmpty(b.decorativeCells)) wire.dt = b.decorativeCells;
  if (b.decorativeFeatures && nonEmpty(b.decorativeFeatures)) wire.dr = b.decorativeFeatures;
  if (b.decorativeFences && nonEmpty(b.decorativeFences)) wire.dfe = b.decorativeFences;
  if (b.decorativeFencePosts && nonEmpty(b.decorativeFencePosts)) wire.dfp = b.decorativeFencePosts;
  if (b.decorativeWalls && nonEmpty(b.decorativeWalls)) wire.dwl = b.decorativeWalls;
  if (b.playerFaction) wire.pf = b.playerFaction;
  if (b.enemyFaction) wire.ef = b.enemyFaction;
  const fd = cleanFactionDirections(b.factionDirections);
  if (nonEmpty(fd)) wire.fd = fd;
  if (fill) wire.f = fill;
  if (nonEmpty(t)) wire.t = t;
  if (h.length) wire.h = h;
  if (nonEmpty(b.units)) wire.u = Object.fromEntries(Object.entries(b.units).map(([k, v]) => [k, [v.unitId, v.direction, v.faction]]));
  if (nonEmpty(b.doodads)) wire.d = Object.fromEntries(Object.entries(b.doodads).map(([k, v]) => [k, v.doodadId]));
  // Props mirror doodads on the wire: anchor cell -> bare propId. Emitted only when nonEmpty so a
  // prop-free board encodes byte-identically to a pre-props board.
  if (b.props && nonEmpty(b.props)) wire.p = Object.fromEntries(Object.entries(b.props).map(([k, v]) => [k, v.propId]));
  // Sorted so the same set of live anchors always encodes to the same bytes. Emitted only when the
  // board actually has one, so no existing board code changes (ADR-0537).
  const liveProps = [...new Set(b.liveProps ?? [])].filter((key) => b.props?.[key]).sort();
  if (liveProps.length) wire.lp = liveProps;
  const floatingArtwork = cleanFloatingArtwork(b.floatingArtwork);
  if (floatingArtwork.length) {
    wire.fa = floatingArtwork.map((placement) => [
      placement.id,
      placement.sourceArtId,
      placement.pixelX,
      placement.pixelY,
      placement.direction,
      placement.scale,
    ]);
  }
  const macroTiles = encodeMacroTiles(b.macroTiles, b.cols, b.rows);
  if (macroTiles.length) wire.mt = macroTiles;
  if (nonEmpty(b.cover)) wire.v = b.cover;
  // Cover-set overrides ride a separate channel, emitted only when non-empty so a board that never
  // decouples cover from terrain encodes byte-identically to a pre-override code.
  if (b.coverTypes && nonEmpty(b.coverTypes)) wire.ct = b.coverTypes;
  // Baked cover seeds ride their own channel, emitted only when present so a board authored
  // before baking encodes byte-identically to its old code.
  const coverSeeds = cleanCoverSeeds(b.coverSeeds, b.cover);
  if (nonEmpty(coverSeeds)) wire.vs = coverSeeds;
  // Split the autotiling ribbon features by kind so each map's values are bare materials
  // (rd=roads, rv=rivers). Fences ride separately in `fe` (edge-keyed), below.
  const rd: Record<string, RoadMaterial> = {};
  const rv: Record<string, RiverMaterial> = {};
  for (const [k, f] of Object.entries(b.features)) {
    if (f.kind === 'river') rv[k] = f.material as RiverMaterial;
    else rd[k] = f.material as RoadMaterial;
  }
  if (nonEmpty(rd)) wire.rd = rd;
  if (nonEmpty(rv)) wire.rv = rv;
  // Fences: an edge-key -> material map (emitted only when non-empty, back-compat like `z`/`p`).
  if (b.fences && nonEmpty(b.fences)) wire.fe = b.fences;
  // Author-added posts are vertex-keyed and visual-only. Empty maps stay absent so post-free boards
  // retain byte-identical codes; automatic degree-one endings continue to derive from `fe`.
  const fencePosts = cleanFencePosts(b.fencePosts, b.cols, b.rows);
  if (nonEmpty(fencePosts)) wire.fp = fencePosts;
  // Walls: edge-key -> material map. Separate from fences visually, but gameplay blocks the
  // same edge when the board is projected to a Level.
  if (b.walls && nonEmpty(b.walls)) wire.wl = b.walls;
  if (b.wallArt && nonEmpty(b.wallArt)) wire.wa = b.wallArt;
  const subterrain = cleanSubterrainPlacements(
    b.subterrain,
    visualTerrainSurfaceKeys(b.cells, b.cols, b.rows, b.decorativeApron, decorativeFootprint),
  );
  if (nonEmpty(subterrain)) wire.st = subterrain;
  if (nonEmpty(b.featureCuts)) wire.rc = Object.keys(b.featureCuts);
  if (nonEmpty(b.featureExits)) wire.rx = Object.keys(b.featureExits);
  // Zones ride primarily as entries so same-type zones and empty authored zones survive a reopen.
  // A collapsed `z` map is also emitted when cells exist so older code can still render/consume
  // a best-effort zone overlay. Zone-free boards still omit both keys.
  const zoneEntries = normalizeZoneEntries(b.zoneEntries ?? zoneEntriesFromCellMap(b.zones, b.cols, b.rows), b.cols, b.rows);
  const zones = zoneCellMapFromEntries(zoneEntries);
  if (zoneEntries.length) wire.zn = zoneEntries.map((z) => {
    const name = z.name?.trim();
    const color = z.color && validZoneColors.has(z.color) ? z.color : undefined;
    // The barred-type list rides a trailing element so every zone without one keeps its historical
    // 3- or 5-element tuple and its board code stays byte-identical.
    if (z.excludedPieceTypes?.length) return [z.id, z.type, z.tiles, name ?? '', color ?? '', z.excludedPieceTypes];
    return name || color ? [z.id, z.type, z.tiles, name ?? '', color ?? ''] : [z.id, z.type, z.tiles];
  });
  if (nonEmpty(zones)) wire.z = zones;
  const towns = cleanTowns(b.towns);
  if (towns.length) wire.tw = towns;
  const forests = cleanForests(b.forests);
  if (forests.length) wire.fr = forests;
  const gr = encodeGeneratedRegions(b.generatedRegions, b.cols, b.rows, b.decorativeApron);
  if (gr.length) wire.gr = gr;
  return enc(JSON.stringify(wire));
}

function decodeMoveHighlightProfileWire(
  value: unknown,
  backgroundVersionId: unknown,
): PredrawnMoveHighlightProfile | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !Array.isArray(value[2])) return undefined;
  const cells: Record<string, unknown> = {};
  for (const row of value[2]) {
    if (!Array.isArray(row) || row.length !== 9 || typeof row[0] !== 'string') return undefined;
    if (Object.prototype.hasOwnProperty.call(cells, row[0])) return undefined;
    cells[row[0]] = row.slice(1);
  }
  return normalizePredrawnMoveHighlightProfile({
    schema: PREDRAWN_MOVE_HIGHLIGHT_PROFILE_SCHEMA,
    backgroundVersionId,
    coordinateBasis: PREDRAWN_MOVE_HIGHLIGHT_COORDINATE_BASIS,
    environmentGeometrySha256: value[0],
    profileSha256: value[1],
    cells,
  });
}

/**
 * Read only the authored faction orientation out of an encoded board.
 *
 * Like `withoutPredrawnBoardSurfaceCode`, this reads the compact wire object rather than
 * decoding: callers outside the editor (the Run's deployment axis) want two authored fields
 * and must not pay for — or fail on — resolving database-owned catalogs to get them.
 */
export function readBoardFactionOrientation(
  code: string,
): { playerFaction?: string; enemyFaction?: string; factionDirections: BoardFactionDirections } | null {
  try {
    const value = JSON.parse(dec(code)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const wire = value as Record<string, unknown>;
    return {
      ...(typeof wire.pf === 'string' ? { playerFaction: wire.pf } : {}),
      ...(typeof wire.ef === 'string' ? { enemyFaction: wire.ef } : {}),
      factionDirections: cleanFactionDirections(wire.fd),
    };
  } catch {
    return null;
  }
}

/**
 * Remove only the remembered pre-drawn surface from an encoded board.
 *
 * This intentionally edits the compact wire object instead of decode/encode round-tripping it.
 * Decoding resolves database-owned catalogs and may omit an unavailable retired material; archive
 * detach must preserve every unrelated authored wire field even when that catalog entry is absent.
 */
export function withoutPredrawnBoardSurfaceCode(code: string): string | null {
  try {
    const value = JSON.parse(dec(code)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const wire = value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(wire, 'pd')) return code;
    delete wire.pd;
    return enc(JSON.stringify(wire));
  } catch {
    return null;
  }
}

/**
 * Remove only one exact occlusion-mask reference from an encoded versioned surface.
 *
 * Like `withoutPredrawnBoardSurfaceCode`, this edits the compact wire object directly so
 * unrelated authored values survive even when their database-owned catalog entries are not
 * currently installed. Background mode, base artwork, dimensions, bounds, and schema-v3 move
 * highlight calibration remain byte-for-byte represented by their original wire values.
 */
export function withoutPredrawnBoardOcclusionMaskCode(
  code: string,
  expectedBackgroundVersionId: string,
  expectedOcclusionVersionId: string,
): string | null {
  try {
    const value = JSON.parse(dec(code)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const wire = value as Record<string, unknown>;
    const surface = wire.pd;
    if (
      !Array.isArray(surface)
      || (surface[0] !== 2 && surface[0] !== 3)
      || String(surface[1] || '').trim().toLowerCase()
        !== expectedBackgroundVersionId.trim().toLowerCase()
      || String(surface[2] || '').trim().toLowerCase()
        !== expectedOcclusionVersionId.trim().toLowerCase()
    ) return null;
    wire.pd = surface.map((entry, index) => (index === 2 ? null : entry));
    return enc(JSON.stringify(wire));
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function decodeBoard(code: string): EditorBoard | null {
  try {
    const w = JSON.parse(dec(code)) as any;
    const cols = w.c | 0, rows = w.r | 0;
    if (cols < 1 || rows < 1 || cols > 64 || rows > 64) return null;
    const cells: Record<string, string> = {};
    if (w.f) for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells[`${x},${y}`] = w.f;
    if (w.t) Object.assign(cells, w.t);
    if (Array.isArray(w.h)) for (const key of w.h) delete cells[String(key)];
    const units: EditorBoard['units'] = {};
    if (w.u) for (const [k, a] of Object.entries(w.u as Record<string, [string, string, string]>)) units[k] = { unitId: a[0], direction: a[1], faction: a[2] };
    const factionDirections = cleanFactionDirections(w.fd);
    const doodads: EditorBoard['doodads'] = {};
    if (w.d) for (const [k, id] of Object.entries(w.d as Record<string, string>)) doodads[k] = { doodadId: id };
    const props: EditorBoard['props'] = {};
    if (w.p) for (const [k, id] of Object.entries(w.p as Record<string, string>)) props[k] = { propId: id };
    // A live marker only means anything while its prop is still placed; a dangling one is dropped
    // rather than retained, so erasing the rock forgets that it was ever live.
    const liveProps: string[] = Array.isArray(w.lp)
      ? [...new Set((w.lp as unknown[]).filter(
          (key): key is string => typeof key === 'string' && !!props[key],
        ))].sort()
      : [];
    const macroTiles = cleanMacroTiles(w.mt, cols, rows);
    const featureCuts: Record<string, true> = {};
    if (Array.isArray(w.rc)) for (const e of w.rc) featureCuts[e] = true;
    const featureExits: Record<string, true> = {};
    if (Array.isArray(w.rx)) for (const e of w.rx) featureExits[e] = true;
    // Merge the per-kind wire maps back into one features map (rd=roads, rv=rivers).
    const features: Record<string, FeatureCell> = {};
    if (w.rd) for (const [k, m] of Object.entries(w.rd as Record<string, RoadMaterial>)) features[k] = { kind: 'road', material: m };
    if (w.rv) for (const [k, m] of Object.entries(w.rv as Record<string, RiverMaterial>)) features[k] = { kind: 'river', material: m };
    // Fences: edge-key -> material (an OLD code without `fe` yields an empty map — back-compat).
    const fences: Record<string, FenceMaterial> = {};
    if (w.fe) for (const [k, m] of Object.entries(w.fe as Record<string, FenceMaterial>)) fences[k] = m;
    // Authored posts supplement derived fence endings. Old codes have no `fp` and decode empty.
    const fencePosts = cleanFencePosts(w.fp, cols, rows);
    // Walls: edge-key -> material (an OLD code without `wl` yields an empty map — back-compat).
    // Legacy draft links briefly stored wall-art ids in `wl`; migrate those to `wa` while
    // leaving a default wall under them so they still render as mounted art.
    const walls: Record<string, WallMaterial> = {};
    const wallArtPlacements: Record<string, WallArtId> = {};
    if (w.wl) {
      for (const [k, raw] of Object.entries(w.wl as Record<string, string>)) {
        if (validWallMaterial(raw)) walls[k] = raw as WallMaterial;
        else if (wallArt(raw)) {
          walls[k] = defaultWallMaterial();
          if (!wallArtAtEdge(k, wallArtPlacements, { cols, rows })) wallArtPlacements[k] = raw;
        }
      }
    }
    if (w.wa) {
      for (const [k, raw] of Object.entries(w.wa as Record<string, string>)) {
        if (wallArt(raw)) wallArtPlacements[k] = raw;
      }
    }
    // Zones: `zn` carries authored entries; old codes only have `z`, which is grouped back into
    // one entry per type so the editor still opens them in the new dropdown model.
    let zoneEntries: EditorZoneEntry[] = [];
    if (Array.isArray(w.zn)) {
      zoneEntries = normalizeZoneEntries(
        (w.zn as Array<[unknown, unknown, unknown, unknown?, unknown?, unknown?]>).map(([id, type, tiles, name, color, excluded]) => ({
          id: String(id ?? ''),
          name: typeof name === 'string' ? name : undefined,
          color: typeof color === 'string' ? color as ZoneColor : undefined,
          type: type as ZoneType,
          excludedPieceTypes: cleanExcludedPieceTypes(excluded),
          tiles: Array.isArray(tiles) ? tiles.map(String) : [],
        })),
        cols,
        rows,
      );
    }
    const legacyZones: EditorBoard['zones'] = {};
    if (w.z) {
      for (const [k, type] of Object.entries(w.z as Record<string, ZoneType>)) {
        if (validZoneTypes.has(type) && inBoardKey(k, cols, rows)) legacyZones[k] = type;
      }
    }
    if (!zoneEntries.length && nonEmpty(legacyZones)) zoneEntries = zoneEntriesFromCellMap(legacyZones, cols, rows);
    const zones = zoneCellMapFromEntries(zoneEntries);
    const apronValues = Array.isArray(w.da) ? w.da : (w.da === 1 || w.da === true ? [4, 4, 4, 4] : [0, 0, 0, 0]);
    const decorativeApron = {
      top: Math.max(0, Math.min(16, Math.round(Number(apronValues[0]) || 0))),
      right: Math.max(0, Math.min(16, Math.round(Number(apronValues[1]) || 0))),
      bottom: Math.max(0, Math.min(16, Math.round(Number(apronValues[2]) || 0))),
      left: Math.max(0, Math.min(16, Math.round(Number(apronValues[3]) || 0))),
    };
    const floatingArtwork = cleanFloatingArtwork(w.fa);
    const generatedRegions = decodeGeneratedRegions(w.gr, cols, rows, decorativeApron);
    const towns = cleanTowns(w.tw);
    const forests = cleanForests(w.fr);
    const surface = Array.isArray(w.pd)
      ? w.pd[0] === 2 || w.pd[0] === 3
        ? normalizePredrawnBoardSurface({
            kind: 'predrawn',
            schemaVersion: w.pd[0],
            backgroundVersionId: w.pd[1],
            occlusionVersionId: w.pd[2],
            frameWidth: w.pd[3],
            frameHeight: w.pd[4],
            worldBounds: {
              minX: w.pd[5],
              minY: w.pd[6],
              width: w.pd[7],
              height: w.pd[8],
            },
            ...(w.pd[0] === 3
              ? { moveHighlightProfile: decodeMoveHighlightProfileWire(w.pd[9], w.pd[1]) }
              : {}),
          })
        : normalizePredrawnBoardSurface({
            kind: 'predrawn',
            slot: w.pd[0],
            frameWidth: w.pd[1],
            frameHeight: w.pd[2],
            registration: typeof w.pd[3] === 'string'
              ? parsePredrawnBoardRegistration(w.pd[3])
              : undefined,
          })
      : undefined;
    const explicitBackgroundMode: BoardBackgroundMode | undefined = w.bm === 'ai' || w.bm === 'legacy'
      ? w.bm
      : w.bm === undefined
        ? undefined
        : 'legacy';
    const backgroundMode = boardBackgroundMode({
      backgroundMode: explicitBackgroundMode,
      surface,
    });
    const predrawnGenerationFrame = Array.isArray(w.pgf) && w.pgf.length === 5
      ? normalizePredrawnGenerationFrame({
        version: w.pgf[0],
        x: w.pgf[1],
        y: w.pgf[2],
        width: w.pgf[3],
        height: w.pgf[4],
      })
      : undefined;
    const cameraBounds = Array.isArray(w.cam) && w.cam.length === 4
      ? normalizeBoardCameraBounds({
          minX: w.cam[0],
          minY: w.cam[1],
          width: w.cam[2],
          height: w.cam[3],
        }, { cols, rows })
      : undefined;
    const decodedDecorativeFootprint = cleanDecorativeFootprint(w.df, cols, rows);
    const subterrain = cleanSubterrainPlacements(
      w.st,
      visualTerrainSurfaceKeys(cells, cols, rows, decorativeApron, decodedDecorativeFootprint),
    );
    return {
      cols, rows, cameraBounds, cameraZoomIn: normalizeCameraZoomIn(w.czi),
      decorativeApron, backgroundMode, surface, predrawnGenerationFrame,
      predrawnGridDetached: w.pgd === 1 || w.pgd === true,
      predrawnPlateOffset: Array.isArray(w.ppo)
        && w.ppo.length === 2
        && Number.isFinite(Number(w.ppo[0]))
        && Number.isFinite(Number(w.ppo[1]))
        ? { left: Number(w.ppo[0]), top: Number(w.ppo[1]) }
        : undefined,
      decorativeFootprint: decodedDecorativeFootprint,
      decorativeCells: (w.dt && typeof w.dt === 'object' && !Array.isArray(w.dt) ? w.dt : {}) as Record<string, string>,
      decorativeFeatures: (w.dr && typeof w.dr === 'object' && !Array.isArray(w.dr) ? w.dr : {}) as Record<string, FeatureCell>,
      decorativeFences: (w.dfe && typeof w.dfe === 'object' && !Array.isArray(w.dfe) ? w.dfe : {}) as Record<string, FenceMaterial>,
      decorativeFencePosts: (w.dfp && typeof w.dfp === 'object' && !Array.isArray(w.dfp) ? w.dfp : {}) as Record<string, FenceMaterial>,
      decorativeWalls: (w.dwl && typeof w.dwl === 'object' && !Array.isArray(w.dwl) ? w.dwl : {}) as Record<string, WallMaterial>,
      playerFaction: typeof w.pf === 'string' ? w.pf : undefined,
      enemyFaction: typeof w.ef === 'string' ? w.ef : undefined,
      factionDirections, cells, macroTiles, units, doodads, props, floatingArtwork,
      ...(liveProps.length ? { liveProps } : {}),
      cover: (w.v ?? {}) as Record<string, GroundCoverDensity>,
      coverTypes: (w.ct ?? {}) as Record<string, TileFamilyId>,
      coverSeeds: cleanCoverSeeds(w.vs, (w.v ?? {}) as Record<string, GroundCoverDensity>),
      features,
      fences,
      fencePosts,
      walls,
      wallArt: wallArtPlacements,
      subterrain,
      featureCuts,
      featureExits,
      zoneEntries,
      zones,
      generatedRegions,
      towns,
      forests,
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Accept either a full `/editor/level?board=...` URL, a query string, or the raw board code. */
export function decodeBoardLinkInput(input: string): EditorBoard | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let code: string | null = null;
  try {
    const url = new URL(trimmed, typeof window === 'undefined' ? 'http://local.test' : window.location.origin);
    code = url.searchParams.get('board');
  } catch {
    // Fall through to query-string/raw-code parsing below.
  }
  if (!code) {
    const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed;
    const params = new URLSearchParams(query);
    code = params.get('board') ?? (trimmed.startsWith('board=') ? params.get('board') : trimmed);
  }
  return code ? decodeBoard(code) : null;
}

/** Decode the `?board=` URL param at editor mount, if present and valid. */
export function readBoardParam(): EditorBoard | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('board');
  return code ? decodeBoard(code) : null;
}
