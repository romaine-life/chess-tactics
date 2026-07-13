import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { edgeTiles, muralTiles, tileAssets, tileFamilies, wallFrameSrc, type TileAsset } from '../art/tileset';
import { DEFAULT_WALL_MATERIAL, roadEdgeKey } from '../core/featureAutotile';
import {
  applyLiveWallArt,
  currentWallArt,
  normalizeWallArtReflection,
  slotSource,
  wallArt,
  type WallArt,
  type WallArtMap,
  type WallArtReflectionConfig,
  type WallArtSlot,
} from '../core/wallArt';
import { WALL_DECOR_ASSETS, wallDecorAsset, type WallDecorFaceId } from '../core/wallDecor';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { BoardCanvasLayer, boundsForOps, loadCanvasImage } from '../render/BoardCanvasLayer';
import {
  buildMirrorLosProofPlan,
  type MirrorLosClassification,
  type MirrorLosProofPlan,
  type RasterAlphaMask,
} from '../render/mirrorLosProof';
import {
  activeUnitFamilies,
  hasDirectionSprite,
  unitArtForId,
  type Direction,
  type Faction,
} from './unitCatalog';
import {
  boardBounds as renderedBoardBounds,
  boardDrawOps,
  WALL_ART_SLOT_DATUM,
  WALL_FRAME_GEOMETRY,
  mirrorGlassOpsForSurfaces,
  mirrorSurfacesForArt,
  reflectedOpsForSubjects,
  wallArtFrameOpsForArt,
  wallArtOverlayZIndex,
  type BoardDrawOp,
  type EditorBoard,
  type MirrorReflectionSubject,
  type MirrorSurface,
} from '@chess-tactics/board-render';
import { saveLiveWallArt } from '../net/wallArt';
import { mapSaveError } from '../campaign/save';
import { SliderRow } from './dressing/SliderRow';
import { ViewPane } from './shared/ViewPane';

const WALL_FRAME_W = WALL_FRAME_GEOMETRY.width;
const WALL_FRAME_H = WALL_FRAME_GEOMETRY.height;
const WALL_FRAME_LEFT = -WALL_FRAME_GEOMETRY.anchorX;
const WALL_FRAME_TOP = -WALL_FRAME_GEOMETRY.anchorY;
const WALL_ART_DATUM_LEFT = -WALL_ART_SLOT_DATUM.anchorX;
const WALL_ART_DATUM_TOP = -WALL_ART_SLOT_DATUM.anchorY;
const WALL_STEP_X = 48;
const WALL_STEP_Y = 27;
const LAB_WEST_Y = 1;
const LAB_NORTH_X = 1;
const FAMILIES = ['grass', 'dirt', 'stone'] as const;
type Family = (typeof FAMILIES)[number];
type TestPiece = {
  id: string;
  unitId: (typeof activeUnitFamilies)[number];
  x: number;
  y: number;
  direction: Direction;
  faction: Faction;
};

const TEST_PIECE_BASELINE: readonly TestPiece[] = [
  { id: 'test-queen', unitId: 'queen', x: 0, y: 0, direction: 'north-west', faction: 'crimson' },
  { id: 'test-knight', unitId: 'knight', x: 1, y: 1, direction: 'west', faction: 'navy-blue' },
];
const DEFAULT_AXIS_PROOF_PIECE_ID = 'test-knight';
const TEST_DIRECTIONS: readonly Direction[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const TEST_FACTIONS: readonly Faction[] = ['navy-blue', 'crimson'];
const cap = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const round2 = (value: number): number => Math.round(value * 100) / 100;

const NUDGE_PAD: Array<{ key: string; name: string; vx: number; vy: number; deg: number } | null> = [
  { key: 'nw', name: 'up-left', vx: -1, vy: -1, deg: 315 },
  { key: 'n', name: 'up', vx: 0, vy: -1, deg: 0 },
  { key: 'ne', name: 'up-right', vx: 1, vy: -1, deg: 45 },
  { key: 'w', name: 'left', vx: -1, vy: 0, deg: 270 },
  null,
  { key: 'e', name: 'right', vx: 1, vy: 0, deg: 90 },
  { key: 'sw', name: 'down-left', vx: -1, vy: 1, deg: 225 },
  { key: 's', name: 'down', vx: 0, vy: 1, deg: 180 },
  { key: 'se', name: 'down-right', vx: 1, vy: 1, deg: 135 },
];

const cloneMap = (map: WallArtMap): WallArtMap => JSON.parse(JSON.stringify(map)) as WallArtMap;
const slugify = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

function entryAsWallArt(id: string, entry: WallArtMap[string]): WallArt {
  const span = Number.isFinite(entry?.span) ? Math.max(1, Math.min(16, Math.round(Number(entry.span)))) : 1;
  const slots = Array.isArray(entry?.slots) ? entry.slots : [];
  const hasMirror = slots.some((slot) => wallDecorAsset(slot.sourceId)?.kind === 'mirror');
  return {
    id,
    label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : id,
    span,
    slots,
    ...((hasMirror || entry.reflection) ? { reflection: normalizeWallArtReflection(entry.reflection) } : {}),
  };
}

function uniqueWallArtId(map: WallArtMap, base: string): string {
  const clean = slugify(base) || 'new-wall-art';
  if (!map[clean]) return clean;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${clean}-${i}`;
    if (!map[candidate]) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

function uniqueSlotId(slots: readonly WallArtSlot[], base: string): string {
  const used = new Set(slots.map((slot) => slot.id));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function defaultSlot(sourceId: string, face: WallDecorFaceId, slots: readonly WallArtSlot[]): WallArtSlot | undefined {
  const source = wallDecorAsset(sourceId);
  if (!source) return undefined;
  const faceAsset = source.faces[face];
  return {
    id: uniqueSlotId(slots, `${source.id}-${face}`),
    sourceId: source.id,
    face,
    x: faceAsset.previewX,
    y: faceAsset.previewY,
    scale: 1,
  };
}

function slotLabel(slot: WallArtSlot, index: number): string {
  return `Slot ${index + 1} - ${wallDecorAsset(slot.sourceId)?.label ?? 'Unavailable source'} (${slot.face})`;
}

function slotLayerSrcs(slot: WallArtSlot): string[] {
  const source = slotSource(slot);
  if (!source) return [];
  if (source.kind === 'mirror') {
    const face = source.faces[slot.face];
    return [face.glassSrc, face.src];
  }
  return [source.faces[slot.face].src];
}

function slotPreviewStyle(slot: WallArtSlot, wallLeft: number, wallTop: number, scale: number, offsetX = 0, offsetY = 0): CSSProperties | undefined {
  const source = slotSource(slot);
  if (!source) return undefined;
  const face = source.faces[slot.face];
  const slotScale = slot.scale * scale;
  return {
    left: offsetX + (wallLeft + slot.x - face.mountX * slot.scale) * scale,
    top: offsetY + (wallTop + slot.y - face.mountY * slot.scale) * scale,
    width: face.width * slotScale,
    height: face.height * slotScale,
  };
}

function DirArrow({ deg }: { deg: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ display: 'block', transform: `rotate(${deg}deg)` }}>
      <path d="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z" fill="currentColor" />
    </svg>
  );
}

function labAnchorCell(face: WallDecorFaceId): { x: number; y: number } {
  return face === 'west' ? { x: 0, y: LAB_WEST_Y } : { x: LAB_NORTH_X, y: 0 };
}

function wallArtBoardSlotRect(slot: WallArtSlot): (CSSProperties & { src: string }) | undefined {
  const op = wallArtBoardSlotOp(slot);
  if (!op) return undefined;
  return {
    src: op.src,
    left: op.dx,
    top: op.dy,
    width: op.dw,
    height: op.dh,
    zIndex: op.z,
  };
}

function wallArtBoardSlotOp(slot: WallArtSlot): BoardDrawOp | undefined {
  const source = slotSource(slot);
  if (!source) return undefined;
  const face = source.faces[slot.face];
  const anchor = labAnchorCell(slot.face);
  const { left, top } = boardLabCellPosition(anchor);
  return {
    src: face.src,
    dx: left + WALL_ART_DATUM_LEFT + slot.x - face.mountX * slot.scale,
    dy: top + WALL_ART_DATUM_TOP + slot.y - face.mountY * slot.scale,
    dw: face.width * slot.scale,
    dh: face.height * slot.scale,
    z: wallArtOverlayZIndex(anchor),
  };
}

function mirrorPreviewMaterialOps(art: WallArt, surfaces: readonly MirrorSurface[]): BoardDrawOp[] {
  const frames = (['west', 'north'] as const).flatMap((face) => {
    const anchor = labAnchorCell(face);
    return wallArtFrameOpsForArt(art, { ...anchor, face });
  });
  return [...mirrorGlassOpsForSurfaces(surfaces), ...frames];
}

function emptyPreviewBoard(
  bounds: { cols: number; rows: number },
  walls: EditorBoard['walls'],
  pieces: readonly TestPiece[],
): EditorBoard {
  return {
    cols: bounds.cols,
    rows: bounds.rows,
    cells: {},
    units: Object.fromEntries(pieces.map((piece) => [
      `${piece.x},${piece.y}`,
      { unitId: piece.unitId, direction: piece.direction, faction: piece.faction },
    ])),
    doodads: {},
    props: {},
    cover: {},
    features: {},
    fences: {},
    walls,
    wallArt: {},
    featureCuts: {},
    featureExits: {},
    zones: {},
  };
}

function testPieceSubjects(pieces: readonly TestPiece[], bounds: { cols: number; rows: number }): MirrorReflectionSubject[] {
  return pieces.flatMap((piece) => {
    const seat = boardLabCellPosition(piece);
    const board = emptyPreviewBoard(bounds, {}, [piece]);
    const op = boardDrawOps(board).find((candidate) => candidate.contain);
    const unit = unitArtForId(piece.unitId);
    if (!op || !unit) return [];
    return [{
      op,
      grid: { x: piece.x, y: piece.y },
      seat,
      facing: piece.direction,
      spriteForFacing: (facing) => hasDirectionSprite(unit, facing)
        ? unit.sprite(piece.faction, facing) ?? op.src
        : op.src,
    } satisfies MirrorReflectionSubject];
  });
}

const rasterAlphaMaskCache = new Map<string, Promise<RasterAlphaMask | null>>();

function loadRasterAlphaMask(src: string): Promise<RasterAlphaMask | null> {
  const cached = rasterAlphaMaskCache.get(src);
  if (cached) return cached;
  const promise = loadCanvasImage(src).then((image) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return { rgba: context.getImageData(0, 0, width, height).data, width, height };
  });
  rasterAlphaMaskCache.set(src, promise);
  return promise;
}

function useMirrorLosProofPlans(
  surfaces: readonly MirrorSurface[],
  subject: MirrorReflectionSubject | undefined,
): MirrorLosProofPlan[] {
  const [plans, setPlans] = useState<MirrorLosProofPlan[]>([]);
  const surfaceKey = JSON.stringify(surfaces.map((surface) => ({
    id: surface.id,
    face: surface.face,
    anchor: surface.anchor,
    span: surface.span,
    aperture: surface.aperture,
    segments: surface.segments.map((segment) => segment.apertureClip),
  })));
  const subjectKey = subject ? JSON.stringify({
    src: subject.op.src,
    dx: subject.op.dx,
    dy: subject.op.dy,
    dw: subject.op.dw,
    dh: subject.op.dh,
    contain: subject.op.contain,
    grid: subject.grid,
    seat: subject.seat,
  }) : '';

  useEffect(() => {
    let cancelled = false;
    setPlans([]);
    if (!subject || !surfaces.length) return () => { cancelled = true; };
    void loadRasterAlphaMask(subject.op.src).then((source) => {
      if (cancelled || !source) return;
      setPlans(surfaces.map((surface) => buildMirrorLosProofPlan({ surface, subject, source })));
    });
    return () => { cancelled = true; };
  }, [subjectKey, surfaceKey]);

  return plans;
}

function WallArtBoardSlots({
  art,
  activeSlotIndex,
  ghost = false,
  hitboxOnly = false,
  onSelectSlot,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  art: WallArt;
  activeSlotIndex: number;
  ghost?: boolean;
  hitboxOnly?: boolean;
  onSelectSlot?: (index: number) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>, index: number) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
}): ReactElement {
  return (
    <>
      {art.slots.map((slot, index) => {
        const rect = wallArtBoardSlotRect(slot);
        if (!rect) return null;
        const { src, ...style } = rect;
        const className = `wall-art-board-slot${index === activeSlotIndex ? ' is-active' : ''}${ghost ? ' is-ghost' : ''}`;
        if (ghost) {
          return (
            <span key={`${art.id}-${slot.id}-ghost`} className={className} style={style}>
              {slotLayerSrcs(slot).map((layerSrc) => <img key={layerSrc} src={layerSrc} alt="" draggable={false} />)}
            </span>
          );
        }
        return (
          <button
            key={`${art.id}-${slot.id}`}
            type="button"
            className={className}
            style={hitboxOnly ? { ...style, zIndex: 40000 } : style}
            onClick={() => onSelectSlot?.(index)}
            onPointerDown={(event) => onPointerDown?.(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={`Edit wall art slot ${index + 1}`}
            title="Drag to move this artwork slot"
          >
            {hitboxOnly ? null : slotLayerSrcs(slot).map((layerSrc) => <img key={layerSrc} src={layerSrc} alt="" draggable={false} />)}
          </button>
        );
      })}
    </>
  );
}

function MirrorApertureInspector({ surfaces }: { surfaces: readonly MirrorSurface[] }): ReactElement | null {
  if (!surfaces.length) return null;
  return (
    <svg className="mirror-aperture-inspector" width="1" height="1" aria-label="Mirror glass aperture outline">
      {surfaces.map((surface) => (
        <g key={surface.id}>
          {surface.segments.map((segment) => (
            <polygon
              key={segment.index}
              points={segment.apertureClip.reduce<string[]>((points, value, index) => {
                if (index % 2 === 0) points.push(`${value},${segment.apertureClip[index + 1]}`);
                return points;
              }, []).join(' ')}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function losMaskPath(plan: MirrorLosProofPlan, classification: MirrorLosClassification): string {
  return plan.samples
    .filter((sample) => sample.classification === classification)
    .map((sample) => `M${(sample.wallHit.x - 0.5).toFixed(2)} ${(sample.wallHit.y - 0.5).toFixed(2)}h1v1h-1z`)
    .join('');
}

function losClass(classification: MirrorLosClassification): string {
  return classification === 'pass' ? 'is-pass' : `is-${classification}`;
}

function MirrorLosProofOverlay({ plans }: { plans: readonly MirrorLosProofPlan[] }): ReactElement {
  const label = plans.map((plan) =>
    `${plan.face} ${plan.status}, ${plan.counts.passed} silhouette pixels cross supported glass and ${plan.counts.floorOccluded} are hidden by the floor boundary`).join('; ');
  return (
    <svg
      className="mirror-los-proof"
      width="1"
      height="1"
      aria-label={`Mirror semantic line-of-sight proof: ${label}`}
    >
      {plans.map((plan) => {
        const aperturePoints = plan.aperture.reduce<string[]>((points, value, index) => {
          if (index % 2 === 0) points.push(`${value},${plan.aperture[index + 1]}`);
          return points;
        }, []).join(' ');
        const xs = plan.aperture.filter((_, index) => index % 2 === 0);
        const ys = plan.aperture.filter((_, index) => index % 2 === 1);
        const labelX = Math.min(...xs) + 4;
        const labelY = Math.min(...ys) + 12;
        return (
          <g key={plan.face} data-los-face={plan.face} data-los-status={plan.status}>
            <polygon className="mirror-los-aperture" points={aperturePoints} />
            {plan.supportedApertures.map((polygon, index) => (
              <polygon
                key={`support-${index}`}
                className="mirror-los-supported-aperture"
                points={polygon.reduce<string[]>((points, value, pointIndex) => {
                  if (pointIndex % 2 === 0) points.push(`${value},${polygon[pointIndex + 1]}`);
                  return points;
                }, []).join(' ')}
              />
            ))}
            {plan.representativeRays.map((ray, index) => (
              <g key={`${plan.face}-${ray.physical.x}-${ray.physical.y}`} className={losClass(ray.classification)}>
                <line
                  className="mirror-los-ray is-physical"
                  data-proof-segment={`${plan.face}-physical-to-wall-${index}`}
                  x1={ray.physical.x}
                  y1={ray.physical.y}
                  x2={ray.wallHit.x}
                  y2={ray.wallHit.y}
                />
                <line
                  className="mirror-los-ray is-virtual"
                  x1={ray.wallHit.x}
                  y1={ray.wallHit.y}
                  x2={ray.virtual.x}
                  y2={ray.virtual.y}
                />
                <rect
                  className="mirror-los-hit"
                  x={ray.wallHit.x - 1.6}
                  y={ray.wallHit.y - 1.6}
                  width="3.2"
                  height="3.2"
                  transform={`rotate(45 ${ray.wallHit.x} ${ray.wallHit.y})`}
                />
              </g>
            ))}
            {(['pass', 'floor-occluded', 'outside-glass', 'unsupported', 'invalid'] as const).map((classification) => {
              const path = losMaskPath(plan, classification);
              return path ? <path key={classification} className={`mirror-los-mask ${losClass(classification)}`} d={path} /> : null;
            })}
            <text className={`mirror-los-label ${plan.status === 'pass' ? 'is-pass' : 'is-fail'}`} x={labelX} y={labelY}>
              {plan.face} LOS {plan.status.toUpperCase()} · glass {plan.counts.passed} · floor {plan.counts.floorOccluded}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function WallArtPreview({ art, zoom = 1 }: { art: WallArt; zoom?: number }): ReactElement {
  const boxW = 152 * zoom;
  const boxH = 132 * zoom;
  const supportingWall = WALL_FRAME_GEOMETRY;
  const supportingWallTop = WALL_FRAME_TOP;
  const visibleFaces = new Set<WallDecorFaceId>(art.slots.map((slot) => slot.face));
  if (!visibleFaces.size) visibleFaces.add('west');
  const nativeFrames: Array<{ key: string; left: number; top: number }> = [];
  for (const face of visibleFaces) {
    for (let i = 0; i < art.span; i += 1) {
      nativeFrames.push({
        key: `${face}-${i}`,
        left: WALL_FRAME_LEFT + (face === 'west' ? -WALL_STEP_X * i : WALL_STEP_X * i),
        top: supportingWallTop + WALL_STEP_Y * i,
      });
    }
  }
  const rects = [
    ...nativeFrames.map((frame) => ({ left: frame.left, top: frame.top, right: frame.left + supportingWall.width, bottom: frame.top + supportingWall.height })),
    ...art.slots.map((slot) => {
      const source = slotSource(slot);
      if (!source) return { left: 0, top: 0, right: 0, bottom: 0 };
      const face = source.faces[slot.face];
      const left = WALL_ART_DATUM_LEFT + slot.x - face.mountX * slot.scale;
      const top = WALL_ART_DATUM_TOP + slot.y - face.mountY * slot.scale;
      return { left, top, right: left + face.width * slot.scale, bottom: top + face.height * slot.scale };
    }),
  ];
  const minX = Math.min(...rects.map((rect) => rect.left));
  const minY = Math.min(...rects.map((rect) => rect.top));
  const maxX = Math.max(...rects.map((rect) => rect.right));
  const maxY = Math.max(...rects.map((rect) => rect.bottom));
  const nativeW = Math.max(1, maxX - minX);
  const nativeH = Math.max(1, maxY - minY);
  const scale = Math.min(0.72 * zoom, (boxW - 12 * zoom) / nativeW, (boxH - 12 * zoom) / nativeH);
  const offsetX = (boxW - nativeW * scale) / 2 - minX * scale;
  const offsetY = (boxH - nativeH * scale) / 2 - minY * scale;
  return (
    <span className="wall-asset-preview" style={{ width: boxW, height: boxH }} aria-hidden="true">
      {nativeFrames.map((frame) => (
        <img
          key={frame.key}
          className="wall-asset-preview-wall"
          src={wallFrameSrc(DEFAULT_WALL_MATERIAL, 9)}
          alt=""
          draggable={false}
          style={{ left: offsetX + frame.left * scale, top: offsetY + frame.top * scale, width: supportingWall.width * scale, height: supportingWall.height * scale }}
        />
      ))}
      {art.slots.flatMap((slot) => slotLayerSrcs(slot).map((src, layer) => (
        <img
          key={`${art.id}-${slot.id}-${layer}`}
          className="wall-asset-preview-sprite"
          src={src}
          alt=""
          draggable={false}
          style={slotPreviewStyle(slot, WALL_ART_DATUM_LEFT, WALL_ART_DATUM_TOP, scale, offsetX, offsetY)}
        />
      )))}
    </span>
  );
}

export function WallArtLab({ artId, onArtId, header, draftSourceId, onDraftSourceConsumed }: {
  artId: string | undefined;
  onArtId: (id: string) => void;
  header?: ReactNode;
  draftSourceId?: string | null;
  onDraftSourceConsumed?: () => void;
}): ReactElement {
  const [draftMap, setDraftMap] = useState<WallArtMap>(() => cloneMap(currentWallArt()));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [newArtName, setNewArtName] = useState('New Wall Art');
  const [newArtId, setNewArtId] = useState('new-wall-art');
  const [family, setFamily] = useState<Family>('stone');
  const [seed, setSeed] = useState(11);
  const [zoom, setZoom] = useState(1.45);
  // Full-body mirrors deliberately rise above the ordinary board silhouette. Give the Studio
  // instrument enough default headroom to show the complete generated wall and frame.
  const [pan, setPan] = useState({ x: 0, y: 72 });
  const [showSavedGhost, setShowSavedGhost] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAperture, setShowAperture] = useState(false);
  const [showLosProof, setShowLosProof] = useState(true);
  const [testPieces, setTestPieces] = useState<TestPiece[]>(() => TEST_PIECE_BASELINE.map((piece) => ({ ...piece })));
  const [selectedTestPieceId, setSelectedTestPieceId] = useState(DEFAULT_AXIS_PROOF_PIECE_ID);
  const drag = useRef<{ pointerId: number; index: number; px: number; py: number; x: number; y: number } | null>(null);
  const committedMap = currentWallArt();
  const ids = useMemo(() => Object.keys(draftMap).sort(), [draftMap]);
  const activeId = ids.includes(artId ?? '') ? artId! : ids[0] ?? 'banner-stone-wall';
  const activeEntry = draftMap[activeId] ?? { label: activeId, slots: [] };
  const art = entryAsWallArt(activeId, activeEntry);
  const activeSlotIndex = Math.min(selectedSlotIndex, Math.max(0, art.slots.length - 1));
  const activeSlot = art.slots[activeSlotIndex];
  const dirty = JSON.stringify(draftMap) !== JSON.stringify(committedMap);
  const boardBounds = useMemo(() => ({
    cols: Math.max(4, art.span + LAB_NORTH_X + 2),
    rows: Math.max(4, art.span + LAB_WEST_Y + 2),
  }), [art.span]);
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: boardBounds.cols * boardBounds.rows }, () => family),
      seed,
      columns: boardBounds.cols,
      rows: boardBounds.rows,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
    }),
    [boardBounds.cols, boardBounds.rows, family, seed],
  );
  const walls = useMemo(() => {
    const walls: Record<string, typeof DEFAULT_WALL_MATERIAL> = {};
    for (let i = 0; i < art.span; i += 1) {
      walls[roadEdgeKey(0, LAB_WEST_Y + i, -1, LAB_WEST_Y + i)] = DEFAULT_WALL_MATERIAL;
      walls[roadEdgeKey(LAB_NORTH_X + i, 0, LAB_NORTH_X + i, -1)] = DEFAULT_WALL_MATERIAL;
    }
    return walls;
  }, [art.span, boardBounds]);
  const mirrorSurfaces = useMemo(
    () => (['west', 'north'] as const).flatMap((face) => {
      const anchor = labAnchorCell(face);
      return mirrorSurfacesForArt(art, { ...anchor, face });
    }),
    [art],
  );
  const previewBoard = useMemo(
    () => emptyPreviewBoard(boardBounds, walls, testPieces),
    [boardBounds, testPieces, walls],
  );
  const reflectionSubjects = useMemo(
    () => testPieceSubjects(testPieces, boardBounds),
    [boardBounds, testPieces],
  );
  const previewOps = useMemo(() => {
    const physical = boardDrawOps(previewBoard);
    return [
      ...physical,
      ...mirrorPreviewMaterialOps(art, mirrorSurfaces),
      ...reflectedOpsForSubjects(mirrorSurfaces, reflectionSubjects),
    ];
  }, [art, mirrorSurfaces, previewBoard, reflectionSubjects]);
  const previewBounds = useMemo(
    () => boundsForOps(previewOps, renderedBoardBounds(previewBoard)),
    [previewBoard, previewOps],
  );
  const selectedTestPiece = testPieces.find((piece) => piece.id === selectedTestPieceId) ?? testPieces[0];
  const selectedReflectionSubject = selectedTestPiece
    ? reflectionSubjects.find((subject) =>
      subject.grid.x === selectedTestPiece.x &&
      subject.grid.y === selectedTestPiece.y &&
      subject.facing === selectedTestPiece.direction)
    : undefined;
  const fullBodyMirrorSurfaces = useMemo(
    () => mirrorSurfaces.filter((surface) => {
      const source = wallDecorAsset(surface.sourceId);
      return source?.kind === 'mirror' && source.mirrorCoverage === 'full-body';
    }),
    [mirrorSurfaces],
  );
  const losProofPlans = useMirrorLosProofPlans(fullBodyMirrorSurfaces, selectedReflectionSubject);

  const setArtEntry = (patch: Partial<WallArtMap[string]>): void => {
    setStatus('');
    setDraftMap((cur) => ({
      ...cur,
      [activeId]: {
        ...(cur[activeId] ?? activeEntry),
        ...patch,
      },
    }));
  };

  const setReflection = (patch: Partial<WallArtReflectionConfig>): void => {
    if (!art.reflection) return;
    setArtEntry({ reflection: { ...art.reflection, ...patch } });
  };

  const setSelectedTestPiece = (patch: Partial<TestPiece>): void => {
    setTestPieces((current) => {
      const selected = current.find((piece) => piece.id === selectedTestPiece?.id);
      if (!selected) return current;
      const nextSelected = { ...selected, ...patch };
      const collision = current.find((piece) => piece.id !== selected.id && piece.x === nextSelected.x && piece.y === nextSelected.y);
      return current.map((piece) => {
        if (piece.id === selected.id) return nextSelected;
        if (piece.id === collision?.id) return { ...piece, x: selected.x, y: selected.y };
        return piece;
      });
    });
  };

  const setSlotAtIndex = (index: number, patch: Partial<WallArtSlot>): void => {
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = [...(entry.slots ?? [])];
      const slot = slots[index];
      if (!slot) return cur;
      slots[index] = { ...slot, ...patch };
      return { ...cur, [activeId]: { ...entry, slots } };
    });
  };

  const setSlot = (patch: Partial<WallArtSlot>): void => {
    if (!activeSlot) return;
    setSlotAtIndex(activeSlotIndex, patch);
  };

  const nudgeSlot = (vx: number, vy: number, step: number): void => {
    if (!activeSlot) return;
    setSlotAtIndex(activeSlotIndex, { x: Math.round(activeSlot.x + vx * step), y: Math.round(activeSlot.y + vy * step) });
  };

  const addSlot = (): void => {
    const face = activeSlot?.face ?? 'west';
    const sourceId = wallDecorAsset(activeSlot?.sourceId)?.id ?? WALL_DECOR_ASSETS[0]?.id;
    if (!sourceId) {
      setStatus('no complete live wall-decoration source is available');
      return;
    }
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = [...(entry.slots ?? [])];
      const slot = defaultSlot(sourceId, face, slots);
      if (slot) slots.push(slot);
      return { ...cur, [activeId]: { ...entry, slots } };
    });
    setSelectedSlotIndex(art.slots.length);
  };

  const createArt = (sourceId?: string): void => {
    const source = wallDecorAsset(sourceId ?? activeSlot?.sourceId);
    if (!source) {
      setStatus('no complete live wall-decoration source is available');
      return;
    }
    const id = uniqueWallArtId(draftMap, newArtId || newArtName);
    const label = newArtName.trim() || id;
    const slot = defaultSlot(source.id, 'west', []);
    if (!slot) return;
    setDraftMap((cur) => ({
      ...cur,
      [id]: {
        label,
        span: 1,
        slots: [slot],
        ...(source.kind === 'mirror' ? { reflection: normalizeWallArtReflection(undefined) } : {}),
      },
    }));
    onArtId(id);
    setSelectedSlotIndex(0);
    setNewArtName('New Wall Art');
    setNewArtId(uniqueWallArtId({ ...draftMap, [id]: { label, slots: [slot] } }, 'new-wall-art'));
    setStatus(`created draft "${id}"`);
  };

  useEffect(() => {
    if (!draftSourceId) return;
    const source = wallDecorAsset(draftSourceId);
    if (!source) {
      setStatus('the requested wall-decoration source is unavailable');
      onDraftSourceConsumed?.();
      return;
    }
    const label = `${source.label} wall art`;
    const id = uniqueWallArtId(draftMap, label);
    const slot = defaultSlot(source.id, 'west', []);
    if (!slot) return;
    setDraftMap((cur) => ({
      ...cur,
      [id]: {
        label,
        span: 1,
        slots: [slot],
        ...(source.kind === 'mirror' ? { reflection: normalizeWallArtReflection(undefined) } : {}),
      },
    }));
    onArtId(id);
    setSelectedSlotIndex(0);
    setNewArtName('New Wall Art');
    setNewArtId(uniqueWallArtId({ ...draftMap, [id]: { label, slots: [slot] } }, 'new-wall-art'));
    setStatus(`created draft "${id}" from ${source.label}`);
    onDraftSourceConsumed?.();
    // The source draft is a one-shot command from the catalog; keep this effect keyed to that command only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSourceId]);

  const removeSlot = (): void => {
    if (!activeSlot) return;
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = (entry.slots ?? []).filter((_, index) => index !== activeSlotIndex);
      return { ...cur, [activeId]: { ...entry, slots } };
    });
    setSelectedSlotIndex(Math.max(0, activeSlotIndex - 1));
  };

  const startSlotDrag = (event: PointerEvent<HTMLButtonElement>, index: number): void => {
    const slot = art.slots[index];
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedSlotIndex(index);
    drag.current = { pointerId: event.pointerId, index, px: event.clientX, py: event.clientY, x: slot.x, y: slot.y };
  };

  const moveSlotDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setSlotAtIndex(current.index, {
      x: Math.round(current.x + (event.clientX - current.px) / zoom),
      y: Math.round(current.y + (event.clientY - current.py) / zoom),
    });
  };

  const endSlotDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be gone after a cancel; nothing else to clean up.
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = move[event.key];
      if (!dir || !activeSlot) return;
      event.preventDefault();
      nudgeSlot(dir[0], dir[1], event.shiftKey ? 10 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSlot?.id, activeSlot?.x, activeSlot?.y, activeSlotIndex]);

  const save = async (): Promise<void> => {
    if (!dirty) return;
    setStatus('saving...');
    try {
      await saveLiveWallArt(draftMap);
      applyLiveWallArt(draftMap);
      setStatus('saved - live now');
    } catch (err) {
      const result = mapSaveError(err);
      setStatus(`error: ${'action' in result ? 'sign in required' : result.message}`);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(`${JSON.stringify(draftMap, null, 2)}\n`);
    setStatus('copied wall art JSON');
  };

  const reset = (): void => {
    setDraftMap(cloneMap(currentWallArt()));
    setStatus('reset to saved');
  };

  const committedArt = wallArt(activeId) ?? art;
  const slotMinY = art.reflection ? -96 : 0;
  const slotBounds = activeSlot?.face === 'north'
    ? { minX: 0, maxX: WALL_FRAME_W + WALL_STEP_X * (art.span - 1), minY: slotMinY, maxY: 180 + WALL_STEP_Y * (art.span - 1) }
    : { minX: -WALL_STEP_X * (art.span - 1), maxX: WALL_FRAME_W, minY: slotMinY, maxY: 180 + WALL_STEP_Y * (art.span - 1) };

  return (
    <>
      <section className="al-lab-main wall-asset-lab-main" aria-label="Wall art preview">
        <ViewPane kind="board" ariaLabel="Wall art board preview" zoom={zoom} pan={pan} minZoom={0.65} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard
            board={board}
            assetFrameSrc={(asset) => asset.src}
            boardZoom={zoom}
            boardPan={pan}
            className="wall-art-board-surface"
            ariaLabel="Wall art board preview"
            showGrid={showGrid}
            sceneLayer={<BoardCanvasLayer ops={previewOps} bounds={previewBounds} />}
            renderCellOverlay={({ cell }) => (
              <button
                type="button"
                className={`mirror-test-cell-hit${selectedTestPiece && selectedTestPiece.x === cell.x && selectedTestPiece.y === cell.y ? ' is-selected' : ''}`}
                onClick={() => setSelectedTestPiece({ x: cell.x, y: cell.y })}
                aria-label={`Move selected test piece to ${cell.x},${cell.y}`}
                title="Move the selected reflection test piece here"
              />
            )}
          >
            {showSavedGhost ? <WallArtBoardSlots art={committedArt} activeSlotIndex={-1} ghost /> : null}
            {showAperture ? <MirrorApertureInspector surfaces={mirrorSurfaces} /> : null}
            {showLosProof && losProofPlans.length ? <MirrorLosProofOverlay plans={losProofPlans} /> : null}
            <WallArtBoardSlots
              art={art}
              activeSlotIndex={activeSlotIndex}
              hitboxOnly
              onSelectSlot={setSelectedSlotIndex}
              onPointerDown={startSlotDrag}
              onPointerMove={moveSlotDrag}
              onPointerUp={endSlotDrag}
            />
          </BoardLabBoard>
        </ViewPane>
      </section>
      <aside className="tileset-view-controls" aria-label="Wall art controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="ps-variant wall-art-source-slots">
              <span className="ps-ctl-label">Source artwork slots</span>
              <span className="ps-slot-row">
                <label className="tileset-category-select" title="Which source-art slot the controls below edit.">
                  <span>Source artwork slot</span>
                  <select
                    value={activeSlot ? activeSlotIndex : -1}
                    onChange={(event) => setSelectedSlotIndex(Number(event.target.value))}
                    aria-label="Source artwork slot"
                    disabled={!art.slots.length}
                  >
                    {art.slots.length ? null : <option value={-1}>None</option>}
                    {art.slots.map((slot, index) => (
                      <option key={slot.id} value={index}>{slotLabel(slot, index)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ps-slot-button" onClick={addSlot} disabled={!WALL_DECOR_ASSETS.length} title="Add source artwork slot" aria-label="Add source artwork slot">+</button>
                <button type="button" className="ps-slot-button ps-slot-remove" onClick={removeSlot} disabled={!activeSlot} title="Remove source artwork slot" aria-label="Remove source artwork slot">-</button>
              </span>
              {activeSlot ? (
                <>
                  <label className="tileset-category-select">
                    <span>Source artwork</span>
                    <select value={wallDecorAsset(activeSlot.sourceId)?.id ?? ''} onChange={(event) => {
                      const source = wallDecorAsset(event.target.value);
                      if (source) setSlot({ sourceId: source.id });
                    }} aria-label="Source artwork" disabled={!WALL_DECOR_ASSETS.length}>
                      {wallDecorAsset(activeSlot.sourceId) ? null : <option value="">Unavailable source</option>}
                      {WALL_DECOR_ASSETS.map((decor) => <option key={decor.id} value={decor.id}>Wall art source: {decor.label}</option>)}
                    </select>
                  </label>
                  <label className="tileset-category-select">
                    <span>Face</span>
                    <select value={activeSlot.face} onChange={(event) => setSlot({ face: event.target.value as WallDecorFaceId })} aria-label="Wall face">
                      <option value="west">West</option>
                      <option value="north">North</option>
                    </select>
                  </label>
                  <SliderRow label={`X - ${Math.round(activeSlot.x)}`} value={activeSlot.x} set={(value) => setSlot({ x: Math.round(value) })} min={slotBounds.minX} max={slotBounds.maxX} step={1} nudge={1} dflt={defaultSlot(activeSlot.sourceId, activeSlot.face, [])?.x ?? activeSlot.x} />
                  <SliderRow label={`Y - ${Math.round(activeSlot.y)}`} value={activeSlot.y} set={(value) => setSlot({ y: Math.round(value) })} min={slotBounds.minY} max={slotBounds.maxY} step={1} nudge={1} dflt={defaultSlot(activeSlot.sourceId, activeSlot.face, [])?.y ?? activeSlot.y} />
                  <SliderRow label={`Scale - ${activeSlot.scale.toFixed(2)}x`} value={activeSlot.scale} set={(value) => setSlot({ scale: round2(value) })} min={0.25} max={1.8} step={0.01} nudge={0.05} dflt={1} />
                  <div className="ps-block">
                    <span className="ps-ctl-label">Nudge <em>Shift = x10</em></span>
                    <div className="ps-pad">
                      {NUDGE_PAD.map((direction, index) => direction
                        ? (
                          <button
                            key={direction.key}
                            type="button"
                            className="ps-pad-btn"
                            title={`Nudge ${direction.name} (Shift = x10)`}
                            aria-label={`nudge ${direction.name}`}
                            onClick={(event) => nudgeSlot(direction.vx, direction.vy, event.shiftKey ? 10 : 1)}
                          >
                            <DirArrow deg={direction.deg} />
                          </button>
                        )
                        : <span key={`c${index}`} className="ps-pad-center" aria-hidden="true" />)}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="ps-variant">
              <span className="ps-ctl-label">Wall art definition</span>
              <label className="tileset-category-select" title="Which wall art is being tuned.">
                <span>Wall art</span>
                <select value={activeId} onChange={(event) => { onArtId(event.target.value); setSelectedSlotIndex(0); }} aria-label="Wall art">
                  {ids.map((id) => (
                    <option key={id} value={id}>{entryAsWallArt(id, draftMap[id]).label}</option>
                  ))}
                </select>
              </label>
              <label className="tileset-category-select">
                <span>Name</span>
                <input value={art.label} onChange={(event) => setArtEntry({ label: event.target.value })} />
              </label>
              <SliderRow label={`Span - ${art.span} wall${art.span === 1 ? '' : 's'}`} value={art.span} set={(value) => setArtEntry({ span: Math.round(value) })} min={1} max={8} step={1} nudge={1} dflt={committedArt.span} />
            </div>
            {art.reflection ? (
              <div className="ps-variant mirror-optics-controls">
                <span className="ps-ctl-label">Exact live mirror <em>1:1 always on</em></span>
                <SliderRow label={`Reflection opacity - ${Math.round(art.reflection.opacity * 100)}%`} value={art.reflection.opacity} set={(value) => setReflection({ opacity: round2(value) })} min={0.05} max={1} step={0.01} nudge={0.05} dflt={committedArt.reflection?.opacity ?? normalizeWallArtReflection(undefined).opacity} />
                <button type="button" className={`ps-toggle ${showAperture ? 'is-on' : ''}`} onClick={() => setShowAperture((value) => !value)} title="Show the frame-owned clipping aperture over the live preview">Aperture outline</button>
                <button
                  type="button"
                  className={`ps-toggle ${showLosProof ? 'is-on' : ''}`}
                  aria-pressed={showLosProof}
                  onClick={() => setShowLosProof((value) => !value)}
                  title="Classify every opaque selected-piece pixel where its board-axis ray crosses the supported mirror glass"
                >LOS proof</button>
                {showLosProof ? (
                  <p className="ps-saved mirror-los-proof-readout">
                    {losProofPlans.length
                      ? losProofPlans.map((plan) => `${cap(plan.face)} ${plan.status.toUpperCase()}: ${plan.counts.passed}/${plan.counts.visible} opaque pixels cross supported glass; ${plan.counts.floorOccluded} are correctly hidden behind the floor boundary${plan.counts.outsideGlass ? `; ${plan.counts.outsideGlass} miss glass` : ''}${plan.counts.unsupported ? `; ${plan.counts.unsupported} cross unsupported overhang` : ''}`).join(' · ')
                      : 'The exhaustive silhouette crossing proof appears for the selected piece in the Grand Gallery mirrors.'}
                  </p>
                ) : null}
                <p className="ps-saved">Visibility, placement, size, and facing follow the board grid exactly. West mirrors cast each physical silhouette pixel along grid X to x=-0.5; north mirrors cast along grid Y to y=-0.5. A pixel is semantically visible only when that wall crossing lies inside both the authored glass and the finite wall face; the boundary tile hides crossings below its back edge. Exact virtual positions remain (-1 - x, y) west or (x, -1 - y) north, with unchanged raster size and floor contact.</p>
              </div>
            ) : null}
            {art.reflection && selectedTestPiece ? (
              <div className="ps-variant mirror-test-piece-controls">
                <span className="ps-ctl-label">Reflection test pieces <em>click a tile to move</em></span>
                <label className="tileset-category-select">
                  <span>Test piece</span>
                  <select value={selectedTestPiece.id} onChange={(event) => setSelectedTestPieceId(event.target.value)} aria-label="Reflection test piece">
                    {testPieces.map((piece, index) => <option key={piece.id} value={piece.id}>Piece {index + 1}: {cap(piece.unitId)}</option>)}
                  </select>
                </label>
                <label className="tileset-category-select">
                  <span>Piece family</span>
                  <select value={selectedTestPiece.unitId} onChange={(event) => setSelectedTestPiece({ unitId: event.target.value as TestPiece['unitId'] })} aria-label="Reflection test piece family">
                    {activeUnitFamilies.map((unitId) => <option key={unitId} value={unitId}>{cap(unitId)}</option>)}
                  </select>
                </label>
                <label className="tileset-category-select">
                  <span>Facing</span>
                  <select value={selectedTestPiece.direction} onChange={(event) => setSelectedTestPiece({ direction: event.target.value as Direction })} aria-label="Reflection test piece facing">
                    {TEST_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{cap(direction)}</option>)}
                  </select>
                </label>
                <label className="tileset-category-select">
                  <span>Faction</span>
                  <select value={selectedTestPiece.faction} onChange={(event) => setSelectedTestPiece({ faction: event.target.value as Faction })} aria-label="Reflection test piece faction">
                    {TEST_FACTIONS.map((faction) => <option key={faction} value={faction}>{cap(faction)}</option>)}
                  </select>
                </label>
                <SliderRow label={`Board X - ${selectedTestPiece.x}`} value={selectedTestPiece.x} set={(value) => setSelectedTestPiece({ x: Math.round(value) })} min={0} max={boardBounds.cols - 1} step={1} nudge={1} dflt={TEST_PIECE_BASELINE.find((piece) => piece.id === selectedTestPiece.id)?.x ?? 1} />
                <SliderRow label={`Board Y - ${selectedTestPiece.y}`} value={selectedTestPiece.y} set={(value) => setSelectedTestPiece({ y: Math.round(value) })} min={0} max={boardBounds.rows - 1} step={1} nudge={1} dflt={TEST_PIECE_BASELINE.find((piece) => piece.id === selectedTestPiece.id)?.y ?? 1} />
                <button type="button" className="tileset-view-action" onClick={() => setTestPieces(TEST_PIECE_BASELINE.map((piece) => ({ ...piece })))}>Reset test pieces</button>
              </div>
            ) : null}
            <div className="ps-variant">
              <span className="ps-ctl-label">New wall art</span>
              <label className="tileset-category-select">
                <span>Name</span>
                <input value={newArtName} onChange={(event) => { setNewArtName(event.target.value); setNewArtId(slugify(event.target.value)); }} />
              </label>
              <label className="tileset-category-select">
                <span>ID</span>
                <input value={newArtId} onChange={(event) => setNewArtId(slugify(event.target.value))} />
              </label>
              <button type="button" className="tileset-view-action" onClick={() => createArt()} disabled={!WALL_DECOR_ASSETS.length} title="Create a new wall art definition from the current source artwork slot">Create new from slot</button>
            </div>
            {activeSlot ? <p className="ps-saved">draft: wall art · source slot {activeSlotIndex + 1}/{art.slots.length} from {wallDecorAsset(activeSlot.sourceId)?.label ?? 'unavailable live source'}</p> : null}
            <label className="tileset-category-select" title="The ground family under the preview board.">
              <span>Ground</span>
              <select value={family} onChange={(event) => setFamily(event.target.value as Family)} aria-label="Ground family">
                {FAMILIES.map((item) => <option key={item} value={item}>{cap(item)}</option>)}
              </select>
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom</span>
              <input type="range" min={0.65} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <div className="ps-toggles">
              <button
                type="button"
                className={`ps-toggle ${showGrid ? 'is-on' : ''}`}
                aria-pressed={showGrid}
                onClick={() => setShowGrid((value) => !value)}
                title="Show the canonical board-cell grid over the preview"
              >Grid overlay</button>
              <button type="button" className={`ps-toggle ${showSavedGhost ? 'is-on' : ''}`} onClick={() => setShowSavedGhost((value) => !value)} title="Overlay the saved wall art for comparison">Ghost</button>
              <button type="button" className="ps-toggle" onClick={() => setSeed((value) => (value % 9999) + 1)} title="Re-roll the board tiles">Re-roll</button>
            </div>
            <dl className="al-meta">
              <div><dt>ID</dt><dd>{activeId}</dd></div>
              <div><dt>Slots</dt><dd>{art.slots.length}</dd></div>
              <div><dt>Span</dt><dd>{art.span} wall{art.span === 1 ? '' : 's'}</dd></div>
            </dl>
            <div className="ps-actions">
              <button type="button" className="tileset-view-action ps-primary" onClick={() => void save()} disabled={!dirty}>Save live</button>
              <button type="button" className="tileset-view-action" onClick={() => void copy()}>Copy JSON</button>
              <button type="button" className="tileset-view-action" onClick={reset} disabled={!dirty}>Reset</button>
            </div>
            {status ? <p className={`ps-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
            {dirty && !status ? <p className="ps-status">unsaved changes</p> : null}
          </div>
        </section>
      </aside>
    </>
  );
}
