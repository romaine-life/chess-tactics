import { drawableAssets } from '@chess-tactics/board-render';
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
import type { EditorBoard } from './boardCode';

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

export const RUN_CARD_SCENE_CAMERA = {
  zoom: 1.15,
  // TileGrid centres the full sprite frames; the visible massing of a 3×3 scene sits
  // one canonical half-step above that centre, mirroring the unit-profile framing.
  pan: { x: 0, y: TILE_STEP_Y * 1.15 },
} as const;

// The enriched-art contract: every scene slot is captured (and installed) at exactly
// this stage size and framing. The same world pan rule as the card camera keeps the
// two framings concentric, so a card window can mount the art as a board-registered
// plate — scaled by the zoom ratio — with the live units seated exactly on top.
export const RUN_CARD_SCENE_CAPTURE = {
  width: 480,
  height: 360,
  camera: {
    zoom: 1.9,
    pan: { x: 0, y: TILE_STEP_Y * 1.9 },
  },
} as const;

const CARD_FACTION = paletteForSide('player');
const CARD_FACING = 'south' as const;

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
    .filter((def) => (def.kind === 'tree' || def.kind === 'rock') && def.terrains.includes(familyId))
    .filter((def) => def.w <= RUN_CARD_SCENE_COLS && def.h <= RUN_CARD_SCENE_ROWS)
    .sort((left, right) => left.id.localeCompare(right.id));
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
}

/**
 * Turns one bundle into its deterministic battlefield vignette. The canonical card id
 * (the piece composition) is the only seed input, so the same card always shows the
 * same scene everywhere it appears — draft offer, shop bundle, Enchiridion record, art
 * capture — while live catalog art can still update.
 */
export function runCardScenePlan(bundle: Pick<PieceBundle, 'pieces'>): RunCardScenePlan {
  const families = walkableFamilies();
  if (!families.length) {
    throw new Error('Run card scenes require at least one installed walkable terrain family.');
  }
  const sceneId = canonicalCardId(bundle);
  const rng = createRng(mixSeed(0x9c42d5, `run-card-scene:${sceneId}`));
  const family = families[rng.int(families.length)];

  const cells: Record<string, string> = {};
  for (let y = 0; y < RUN_CARD_SCENE_ROWS; y += 1) {
    for (let x = 0; x < RUN_CARD_SCENE_COLS; x += 1) {
      cells[`${x},${y}`] = family.tileIds[rng.int(family.tileIds.length)];
    }
  }

  // Highest-value piece takes the hero seat; ties keep the bundle's own order.
  const mustered = bundle.pieces
    .map((piece, index) => ({ piece, index }))
    .sort((left, right) => (
      (PIECE_VALUE[right.piece] ?? 0) - (PIECE_VALUE[left.piece] ?? 0) || left.index - right.index
    ))
    .slice(0, FORMATION_SEATS.length);
  const units: EditorBoard['units'] = {};
  const free = new Set(Object.keys(cells));
  mustered.forEach(({ piece }, seatIndex) => {
    const seat = FORMATION_SEATS[seatIndex];
    units[`${seat.x},${seat.y}`] = { unitId: piece, direction: CARD_FACING, faction: CARD_FACTION };
    free.delete(`${seat.x},${seat.y}`);
  });

  const props = placeProps(rng, family.familyId, free);

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
    doodads: {},
    props,
    cover,
    coverTypes,
    features: {},
    featureCuts: {},
    featureExits: {},
  };
  return {
    board,
    coverSeed: mixSeed(mixSeed(0x9c42d5, `run-card-scene:${sceneId}`), 'run-card-scene-cover'),
    familyId: family.familyId,
    sceneId,
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
  camera = RUN_CARD_SCENE_CAMERA,
  onLayerFirstFrame,
  onFrameError,
}: {
  bundle: Pick<PieceBundle, 'pieces'>;
  className?: string;
  /**
   * 'live' is the card face: installed enriched artwork under the mustered units when a
   * scene slot is accepted, else the full live tile scene. 'source' is the unit-less
   * tile scene — the deterministic art-generation input captured for restyling.
   */
  variant?: 'live' | 'source';
  /** Card-window framing by default; the capture stage passes its wider framing. */
  camera?: { zoom: number; pan: { x: number; y: number } };
  /** First completed paint of each canvas layer — a staging host's readiness gate. */
  onLayerFirstFrame?: (layer: 'terrain' | 'scene') => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  // The canonical composition id is the complete plan input, so it is the memo key.
  const cardId = canonicalCardId(bundle);
  const plan = useMemo(() => runCardScenePlan(bundle), [cardId]);
  const artwork = variant === 'live' ? installedRunCardSceneArt(plan.sceneId) : null;

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
      : artwork
        // Installed artwork already contains terrain, cover, and props; the live render
        // contributes only the units so sprites stay crisp above the painted scene.
        ? { ...plan.board, cover: {}, coverTypes: {}, props: {}, doodads: {} }
        : plan.board
  ), [artwork, plan.board, variant]);
  return (
    <span
      className={`run-card-scene-viewport ${className}`.trim()}
      data-scene-art={artwork ? 'installed' : 'live'}
      aria-hidden="true"
    >
      <span className={`painted-surface run-card-scene-surface ${revealed ? 'is-ready' : 'is-loading'}`}>
        <span className="painted-surface-content">
          {artwork ? (
            // A board-registered plate, not a cover-fit background: both framings share
            // one world centre and pan rule, so scaling by the zoom ratio seats the live
            // unit sprites exactly where the captured terrain stood.
            <img
              className="run-card-scene-art"
              src={artwork.src}
              width={artwork.width}
              height={artwork.height}
              style={{
                transform: `translate(-50%, -50%) scale(${camera.zoom / RUN_CARD_SCENE_CAPTURE.camera.zoom})`,
              }}
              alt=""
              draggable={false}
              ref={markArtGate}
              onLoad={(event) => markArtGate(event.currentTarget)}
              onError={() => handleFrameError(new Error(`Run card scene art failed: ${plan.sceneId}`))}
            />
          ) : null}
          {/* A card is a still: one authored frame, no sway, no repaint clock. The living
              version of this scene belongs to gameplay boards, not to a card painting. */}
          <StudioReadOnlyBoard
            board={board}
            hidden={artwork ? { tile: true, unit: false, doodad: true } : undefined}
            still
            boardZoom={camera.zoom}
            boardPan={camera.pan}
            coverSeed={plan.coverSeed}
            className="run-card-scene-board"
            ariaLabel=""
            onTerrainFirstFrame={handleTerrainFirstFrame}
            onSceneFirstFrame={handleSceneFirstFrame}
            onFrameError={handleFrameError}
          />
        </span>
      </span>
    </span>
  );
}
