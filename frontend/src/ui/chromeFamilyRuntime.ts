import {
  chromeSourceById,
  type ChromeCandidateSource,
  type ChromeRole,
} from './chromeCandidateSources';
import committedChromeLabDefaults from '../../config/chrome-lab-defaults.json';

export type RailFit = 'stretch' | 'tile';
export type AtomAlignmentMode = 'manual' | 'rail-center' | 'anchor' | 'edge-cover';
export type AtomPreviewMode = 'live' | 'baked' | 'debug';
export type ChromeFillMode = 'none' | 'tint' | 'surface';
export type TitleVerticalAlign = 'manual' | 'center';
export type TitleHorizontalAlign = 'manual' | 'content-inset';
export type ChromeFillTintId = 'night' | 'blue' | 'steel' | 'oak' | 'ember';
export type ChromeFillSurfaceId =
  | 'hybrid-stone-blue'
  | 'hybrid-wood-oak'
  | 'baseline-stone-blue'
  | 'baseline-wood-oak'
  | 'stone-slate-blue'
  | 'stone-grey';

export const NO_ATOM_SOURCE_ID = 'none';
export const DIVIDER_H = 34;
export const DEFAULT_DIVIDER_ATOM_SIZE = 17;
export const EMPTY_FRAME: FrameRender = { url: '', slice: 1, size: 3, atomOverlay: null };
export const EMPTY_DIVIDER: DividerRender = { railUrl: '', railHeight: 1, railTileWidth: 1, height: DIVIDER_H, atomOverlay: null };
export const ATOM_TURNS = [0, 1, 2, 3] as const;
export const ATOM_TURN_LABELS = ['0 deg', '90 deg', '180 deg', '270 deg'] as const;
export const ATOM_ALIGNMENT_MODES = ['manual', 'rail-center', 'anchor', 'edge-cover'] as const;
export const ATOM_PREVIEW_MODES = ['live', 'baked', 'debug'] as const;
export const CHROME_FILL_MODE_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'tint', label: 'Tint' },
  { id: 'surface', label: 'Surface' },
] satisfies Array<{ id: ChromeFillMode; label: string }>;
export const CHROME_FILL_TINTS = [
  { id: 'night', label: 'Night', rgb: [4, 13, 20] },
  { id: 'blue', label: 'Deep blue', rgb: [5, 24, 42] },
  { id: 'steel', label: 'Steel', rgb: [28, 42, 58] },
  { id: 'oak', label: 'Oak shadow', rgb: [44, 24, 10] },
  { id: 'ember', label: 'Ember', rgb: [50, 11, 13] },
] satisfies Array<{ id: ChromeFillTintId; label: string; rgb: [number, number, number] }>;
export const CHROME_FILL_SURFACES = [
  { id: 'hybrid-stone-blue', label: 'Hybrid stone blue', src: '/assets/ui/surfaces/hybrid-stone-blue.png' },
  { id: 'hybrid-wood-oak', label: 'Hybrid wood oak', src: '/assets/ui/surfaces/hybrid-wood-oak.png' },
  { id: 'baseline-stone-blue', label: 'Baseline stone blue', src: '/assets/ui/surfaces/baseline-stone-blue.png' },
  { id: 'baseline-wood-oak', label: 'Baseline wood oak', src: '/assets/ui/surfaces/baseline-wood-oak.png' },
  { id: 'stone-slate-blue', label: 'Slate stone blue', src: '/assets/ui/surfaces/stone-slate-blue.png' },
  { id: 'stone-grey', label: 'Grey stone', src: '/assets/ui/surfaces/stone-grey.png' },
] satisfies Array<{ id: ChromeFillSurfaceId; label: string; src: string }>;

export type DividerJointSource = Pick<ChromeCandidateSource, 'id' | 'label' | 'src' | 'width' | 'height'>;
export type SourcePreviewBox = { width: number; height: number };

const PIXELLAB_DIVIDER_COVER_SOURCE_COUNT = 52;
const CODEX_STYLE_DIVIDER_COVER_SOURCE_COUNT = 55;

function dividerCoverSources(setId: string, label: string, count: number): DividerJointSource[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `${setId}-${number}`,
      label: `${label} ${number}`,
      src: `/assets/ui/chrome-candidates/exploded/${setId}/candidate-${number}.png`,
      width: 17,
      height: 17,
    };
  });
}

const PIXELLAB_DIVIDER_COVER_SOURCES = dividerCoverSources(
  'divider-atoms-pixellab-cover-v1',
  'Divider PixelLab cover',
  PIXELLAB_DIVIDER_COVER_SOURCE_COUNT,
);

const CODEX_STYLE_DIVIDER_COVER_SOURCES = dividerCoverSources(
  'divider-atoms-codex-style-cover-v1',
  'Divider Codex-style cover',
  CODEX_STYLE_DIVIDER_COVER_SOURCE_COUNT,
);

const DIVIDER_COVER_SOURCES = [
  ...PIXELLAB_DIVIDER_COVER_SOURCES,
  ...CODEX_STYLE_DIVIDER_COVER_SOURCES,
] satisfies DividerJointSource[];

export const DIVIDER_JOINT_SOURCES = [
  { id: NO_ATOM_SOURCE_ID, label: 'None', src: '', width: 0, height: 0 },
  ...DIVIDER_COVER_SOURCES,
] satisfies DividerJointSource[];

export const DIVIDER_JOINT_PREVIEW_BOX = DIVIDER_JOINT_SOURCES.reduce<{ width: number; height: number }>(
  (box, source) => ({
    width: Math.max(box.width, source.width),
    height: Math.max(box.height, source.height),
  }),
  { width: DEFAULT_DIVIDER_ATOM_SIZE, height: DEFAULT_DIVIDER_ATOM_SIZE },
);

export function sourcePreviewBox(sources: readonly Pick<ChromeCandidateSource, 'width' | 'height'>[], fallback: SourcePreviewBox = { width: 24, height: 24 }): SourcePreviewBox {
  return sources.reduce<SourcePreviewBox>(
    (box, source) => ({
      width: Math.max(box.width, source.width),
      height: Math.max(box.height, source.height),
    }),
    fallback,
  );
}

export type RoleTune = {
  atomSourceId: string;
  railSourceId: string;
  atomTurns: 0 | 1 | 2 | 3;
  atomSize: number;
  railThickness: number;
  atomX: number;
  atomY: number;
  atomLeftX: number;
  atomRightX: number;
  atomTopY: number;
  atomBottomY: number;
  railUnderlap: number;
  railFit: RailFit;
  fillMode: ChromeFillMode;
  fillTintId: ChromeFillTintId;
  fillSurfaceId: ChromeFillSurfaceId;
  fillSurfaceScale: number;
  fillBoxLeft: number;
  fillBoxRight: number;
  fillBoxTop: number;
  fillBoxBottom: number;
  contentPadding: number;
  fillAlpha: number;
  atomAlignMode?: AtomAlignmentMode;
  atomAnchorX?: number;
  atomAnchorY?: number;
  atomCoverX?: number;
  atomCoverY?: number;
  atomPreviewMode?: AtomPreviewMode;
  titleTextX?: number;
  titleTextY?: number;
  titleFontSize?: number;
  titleVerticalAlign?: TitleVerticalAlign;
  titleHorizontalAlign?: TitleHorizontalAlign;
};

export type DividerTune = {
  atomSourceId: string;
  atomTurns: 0 | 1 | 2 | 3;
  atomSize: number;
  atomX: number;
  atomY: number;
  atomLeftX: number;
  atomRightX: number;
  atomLeftY: number;
  atomRightY: number;
  atomAlignMode?: AtomAlignmentMode;
  atomAnchorX?: number;
  atomAnchorY?: number;
  atomCoverX?: number;
  atomCoverY?: number;
  atomPreviewMode?: AtomPreviewMode;
};

export type FrameRender = {
  url: string;
  previewUrl?: string;
  slice: number;
  size: number;
  atomOverlay: AtomOverlayRender | null;
};

export type AtomOverlayRender = {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  size: number;
  outset: number;
  leftFootprint: number;
  rightFootprint: number;
  leftX: number;
  rightX: number;
  topY: number;
  bottomY: number;
};

export type DividerRender = {
  railUrl: string;
  railHeight: number;
  railTileWidth: number;
  height: number;
  atomOverlay: DividerAtomOverlay | null;
};

type CommittedChromeLabDefaults = {
  outer: RoleTune;
  inner: RoleTune;
  divider: DividerTune;
};

const COMMITTED_CHROME_LAB_DEFAULTS = committedChromeLabDefaults as unknown as CommittedChromeLabDefaults;

export type DividerAtomOverlay = {
  left: string;
  right: string;
  width: number;
  height: number;
  outset: number;
  leftX: number;
  rightX: number;
  leftY: number;
  rightY: number;
};

export type AtomAlignmentReadout = {
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  anchorX: number;
  anchorY: number;
  finalLeftX: number;
  finalRightX: number;
  finalTopY: number;
  finalBottomY: number;
};
export function roleDefault(role: ChromeRole): RoleTune {
  return { ...(role === 'outer' ? COMMITTED_CHROME_LAB_DEFAULTS.outer : COMMITTED_CHROME_LAB_DEFAULTS.inner) };
}

export function dividerDefault(): DividerTune {
  return { ...COMMITTED_CHROME_LAB_DEFAULTS.divider };
}
export function defaultRailFitForSource(sourceId: string, fallback: RailFit = 'stretch'): RailFit {
  const source = chromeSourceById(sourceId);
  if (source.kind === 'rail-repeat') return 'tile';
  if (source.kind === 'rail-long') return 'stretch';
  return fallback;
}
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

function imageCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  return canvas;
}

function horizontalRailCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const raw = imageCanvas(image);
  if (raw.width >= raw.height) return raw;
  const canvas = document.createElement('canvas');
  canvas.width = raw.height;
  canvas.height = raw.width;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(raw, 0, 0);
  return canvas;
}

function rotateCanvas(source: HTMLCanvasElement, turns: 0 | 1 | 2 | 3): HTMLCanvasElement {
  if (turns === 0) return source;
  const quarter = turns % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? source.height : source.width;
  canvas.height = quarter ? source.width : source.height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(turns * Math.PI / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function renderCanvasAtSize(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawMirrored(context: CanvasRenderingContext2D, source: HTMLCanvasElement, x: number, y: number, w: number, h: number, flipX: boolean, flipY: boolean): void {
  context.save();
  context.translate(flipX ? x + w : x, flipY ? y + h : y);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, 0, 0, source.width, source.height, 0, 0, w, h);
  context.restore();
}

function drawHorizontalRail(context: CanvasRenderingContext2D, rail: HTMLCanvasElement, x: number, y: number, w: number, h: number, fit: RailFit): void {
  if (fit === 'stretch') {
    context.drawImage(rail, 0, 0, rail.width, rail.height, x, y, w, h);
    return;
  }
  const tileW = Math.max(1, Math.round((rail.width / Math.max(1, rail.height)) * h));
  for (let dx = x; dx < x + w; dx += tileW) {
    const drawW = Math.min(tileW, x + w - dx);
    const sourceW = Math.max(1, Math.min(rail.width, Math.round(rail.width * (drawW / tileW))));
    context.drawImage(rail, 0, 0, sourceW, rail.height, dx, y, drawW, h);
  }
}

function drawVerticalRail(context: CanvasRenderingContext2D, rail: HTMLCanvasElement, x: number, y: number, w: number, h: number, fit: RailFit): void {
  context.save();
  context.translate(x, y + h);
  context.rotate(-Math.PI / 2);
  drawHorizontalRail(context, rail, 0, 0, h, w, fit);
  context.restore();
}

export function renderedRailThickness(tune: Pick<RoleTune, 'railThickness'>): number {
  return clamp(Math.round(tune.railThickness), 1, 96);
}

export function roleContentInset(tune: Pick<RoleTune, 'contentPadding'>): number {
  return Math.max(0, Math.round(tune.contentPadding));
}

function frameSliceForTune(tune: RoleTune): number {
  return renderedRailThickness(tune);
}

function frameCenterLengthForRail(tune: RoleTune, rail: HTMLCanvasElement, slice: number): number {
  const nativePeriod = Math.max(1, Math.round((rail.width / Math.max(1, rail.height)) * slice));
  if (tune.railFit === 'tile' && chromeSourceById(tune.railSourceId).kind !== 'rail-repeat') return slice;
  return Math.max(slice, nativePeriod);
}

function roleRailTarget(tune: RoleTune, slice: number): { x: number; y: number } {
  void tune;
  return {
    x: slice / 2,
    y: slice / 2,
  };
}

function roleAtomBaseOffset(tune: RoleTune, slice: number): { x: number; y: number; anchorX: number; anchorY: number; targetX: number; targetY: number } {
  const atomSize = clamp(Math.round(tune.atomSize), 1, 256);
  const mode = tune.atomAlignMode ?? 'manual';
  const target = roleRailTarget(tune, slice);
  const anchorX = mode === 'rail-center'
    ? atomSize / 2
    : mode === 'edge-cover'
      ? tune.atomCoverX ?? atomSize / 2
      : tune.atomAnchorX ?? atomSize / 2;
  const anchorY = mode === 'rail-center'
    ? atomSize / 2
    : mode === 'edge-cover'
      ? tune.atomCoverY ?? atomSize / 2
      : tune.atomAnchorY ?? atomSize / 2;
  if (mode === 'manual') {
    return {
      x: tune.atomX,
      y: tune.atomY,
      anchorX,
      anchorY,
      targetX: target.x,
      targetY: target.y,
    };
  }
  return {
    x: target.x - anchorX + tune.atomX,
    y: target.y - anchorY + tune.atomY,
    anchorX,
    anchorY,
    targetX: target.x,
    targetY: target.y,
  };
}

function atomSeatOffsets(tune: RoleTune, slice = frameSliceForTune(tune)): { leftX: number; rightX: number; topY: number; bottomY: number } {
  const base = roleAtomBaseOffset(tune, slice);
  return {
    leftX: base.x + tune.atomLeftX,
    rightX: base.x + tune.atomRightX,
    topY: base.y + tune.atomTopY,
    bottomY: base.y + tune.atomBottomY,
  };
}

function sourceAtomSeatOffsets(tune: RoleTune, slice: number): { leftX: number; rightX: number; topY: number; bottomY: number } {
  return atomSeatOffsets(tune, slice);
}

export function roleAtomAlignmentReadout(tune: RoleTune): AtomAlignmentReadout {
  const slice = frameSliceForTune(tune);
  const base = roleAtomBaseOffset(tune, slice);
  const seat = atomSeatOffsets(tune, slice);
  return {
    baseX: base.x,
    baseY: base.y,
    targetX: base.targetX,
    targetY: base.targetY,
    anchorX: base.anchorX,
    anchorY: base.anchorY,
    finalLeftX: seat.leftX,
    finalRightX: seat.rightX,
    finalTopY: seat.topY,
    finalBottomY: seat.bottomY,
  };
}

function withClip(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: () => void): void {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  draw();
  context.restore();
}

function drawFrameBase(context: CanvasRenderingContext2D, tune: RoleTune, rail: HTMLCanvasElement, slice: number, frameSize: number, ox = 0, oy = 0): void {
  const underlap = clamp(Math.round(tune.railUnderlap), 0, 256);
  const railRunStart = slice - underlap;
  const railRunSize = frameSize - slice * 2 + underlap * 2;
  withClip(context, ox, oy, frameSize, slice, () => {
    drawHorizontalRail(context, rail, ox + railRunStart, oy, railRunSize, slice, tune.railFit);
  });
  withClip(context, ox, oy + frameSize - slice, frameSize, slice, () => {
    drawHorizontalRail(context, rail, ox + railRunStart, oy + frameSize - slice, railRunSize, slice, tune.railFit);
  });
  withClip(context, ox, oy, slice, frameSize, () => {
    drawVerticalRail(context, rail, ox, oy + railRunStart, slice, railRunSize, tune.railFit);
  });
  withClip(context, ox + frameSize - slice, oy, slice, frameSize, () => {
    drawVerticalRail(context, rail, ox + frameSize - slice, oy + railRunStart, slice, railRunSize, tune.railFit);
  });
}

function drawFrameAtoms(context: CanvasRenderingContext2D, tune: RoleTune, atom: HTMLCanvasElement, slice: number, frameSize: number, ox = 0, oy = 0): void {
  const seat = sourceAtomSeatOffsets(tune, slice);
  drawMirrored(context, atom, ox + seat.leftX, oy + seat.topY, atom.width, atom.height, false, false);
  drawMirrored(context, atom, ox + frameSize - atom.width - seat.rightX, oy + seat.topY, atom.width, atom.height, true, false);
  drawMirrored(context, atom, ox + seat.leftX, oy + frameSize - atom.height - seat.bottomY, atom.width, atom.height, false, true);
  drawMirrored(context, atom, ox + frameSize - atom.width - seat.rightX, oy + frameSize - atom.height - seat.bottomY, atom.width, atom.height, true, true);
}

function renderCornerAtomDataUrl(atom: HTMLCanvasElement, atomSize: number, flipX: boolean, flipY: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = atomSize;
  canvas.height = atomSize;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  drawMirrored(context, atom, 0, 0, atomSize, atomSize, flipX, flipY);
  return canvas.toDataURL('image/png');
}

export function dividerJointSourceById(id: string): DividerJointSource {
  return DIVIDER_JOINT_SOURCES.find((source) => source.id === id) ?? DIVIDER_JOINT_SOURCES[0];
}

function renderFrameBaseCanvas(tune: RoleTune, rail: HTMLCanvasElement): { canvas: HTMLCanvasElement; slice: number; frameSize: number } {
  const slice = frameSliceForTune(tune);
  // Repeat-safe rails keep one full normalized period between the corner slices.
  // Long/stretch rails keep the same detail budget so they are not reduced to a
  // 16px strip before CSS stretches them across the consumer.
  const frameSize = slice * 2 + frameCenterLengthForRail(tune, rail, slice);
  const canvas = document.createElement('canvas');
  canvas.width = frameSize;
  canvas.height = frameSize;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, frameSize, frameSize);
  drawFrameBase(context, tune, rail, slice, frameSize);
  return { canvas, slice, frameSize };
}

function renderFrameEdgeTileDataUrl(frameBase: HTMLCanvasElement, slice: number): { url: string; width: number; height: number } {
  const edgeH = slice;
  const centerW = Math.max(1, frameBase.width - slice * 2);
  const edgeW = Math.max(1, Math.round(centerW * (edgeH / slice)));
  const canvas = document.createElement('canvas');
  canvas.width = edgeW;
  canvas.height = edgeH;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  // The divider rail must be the same normalized chrome as the panel edge. Use
  // the frame's complete top-center border-image tile instead of resampling the raw rail source.
  context.drawImage(frameBase, slice, 0, centerW, slice, 0, 0, edgeW, edgeH);
  return { url: canvas.toDataURL('image/png'), width: edgeW, height: edgeH };
}

function renderDividerJointDataUrl(atom: HTMLCanvasElement, width: number, height: number, flipX: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  drawMirrored(context, atom, 0, 0, atom.width, atom.height, flipX, false);
  return canvas.toDataURL('image/png');
}

function dividerAtomBaseOffset(divider: DividerTune, atomW: number, atomH: number): { x: number; y: number; anchorX: number; anchorY: number; targetX: number; targetY: number } {
  const mode = divider.atomAlignMode ?? 'manual';
  const targetX = 0;
  const targetY = DIVIDER_H / 2;
  const anchorX = mode === 'rail-center'
    ? atomW / 2
    : mode === 'edge-cover'
      ? divider.atomCoverX ?? atomW / 2
      : divider.atomAnchorX ?? atomW / 2;
  const anchorY = mode === 'rail-center'
    ? atomH / 2
    : mode === 'edge-cover'
      ? divider.atomCoverY ?? atomH / 2
      : divider.atomAnchorY ?? atomH / 2;
  if (mode === 'manual') {
    return {
      x: divider.atomX,
      y: (DIVIDER_H - atomH) / 2 + divider.atomY,
      anchorX,
      anchorY,
      targetX,
      targetY,
    };
  }
  return {
    x: targetX - anchorX + divider.atomX,
    y: targetY - anchorY + divider.atomY,
    anchorX,
    anchorY,
    targetX,
    targetY,
  };
}

export function dividerAtomAlignmentReadout(divider: DividerTune, source?: Pick<DividerJointSource, 'width' | 'height'>): AtomAlignmentReadout {
  const atomH = clamp(Math.round(divider.atomSize), 1, 128);
  const sourceW = Math.max(1, source?.width ?? atomH);
  const sourceH = Math.max(1, source?.height ?? atomH);
  const atomW = Math.max(1, Math.round((sourceW / sourceH) * atomH));
  const base = dividerAtomBaseOffset(divider, atomW, atomH);
  const leftX = base.x + divider.atomLeftX;
  const rightX = base.x + divider.atomRightX;
  const leftY = base.y + divider.atomLeftY;
  const rightY = base.y + divider.atomRightY;
  return {
    baseX: base.x,
    baseY: base.y,
    targetX: base.targetX,
    targetY: base.targetY,
    anchorX: base.anchorX,
    anchorY: base.anchorY,
    finalLeftX: leftX,
    finalRightX: rightX,
    finalTopY: leftY,
    finalBottomY: rightY,
  };
}

function atomOverlayForTune(tune: RoleTune, atom: HTMLCanvasElement, slice: number): AtomOverlayRender {
  const atomSize = clamp(Math.round(tune.atomSize), 1, 256);
  void slice;
  const seat = atomSeatOffsets(tune);
  const size = atomSize;
  const leftX = seat.leftX;
  const rightX = seat.rightX;
  const topY = seat.topY;
  const bottomY = seat.bottomY;
  const leftFootprint = Math.max(0, -leftX, size + leftX);
  const rightFootprint = Math.max(0, -rightX, size + rightX);
  const maxOffset = Math.max(Math.abs(leftX), Math.abs(rightX), Math.abs(topY), Math.abs(bottomY));
  return {
    tl: renderCornerAtomDataUrl(atom, atomSize, false, false),
    tr: renderCornerAtomDataUrl(atom, atomSize, true, false),
    bl: renderCornerAtomDataUrl(atom, atomSize, false, true),
    br: renderCornerAtomDataUrl(atom, atomSize, true, true),
    size,
    outset: Math.ceil(size + maxOffset + 4),
    leftFootprint,
    rightFootprint,
    leftX,
    rightX,
    topY,
    bottomY,
  };
}

export async function composeDividerRender(outer: RoleTune, divider: DividerTune): Promise<DividerRender> {
  const hasAtom = divider.atomSourceId !== NO_ATOM_SOURCE_ID;
  const atomSource = dividerJointSourceById(divider.atomSourceId);
  const [railImage, atomImage] = await Promise.all([
    loadImage(chromeSourceById(outer.railSourceId).src),
    hasAtom && atomSource.src ? loadImage(atomSource.src) : Promise.resolve(null),
  ]);
  const rail = horizontalRailCanvas(railImage);
  const outerBase = renderFrameBaseCanvas(outer, rail);
  const railTile = renderFrameEdgeTileDataUrl(outerBase.canvas, outerBase.slice);
  let atomOverlay: DividerAtomOverlay | null = null;
  if (atomImage) {
    const atomH = clamp(Math.round(divider.atomSize), 1, 128);
    const rotatedAtom = rotateCanvas(imageCanvas(atomImage), divider.atomTurns);
    const atomW = Math.max(1, Math.round((rotatedAtom.width / Math.max(1, rotatedAtom.height)) * atomH));
    const atom = renderCanvasAtSize(rotatedAtom, atomW, atomH);
    const base = dividerAtomBaseOffset(divider, atomW, atomH);
    const leftX = base.x + divider.atomLeftX;
    const rightX = base.x + divider.atomRightX;
    const leftY = base.y + divider.atomLeftY;
    const rightY = base.y + divider.atomRightY;
    const maxOffset = Math.max(Math.abs(leftX), Math.abs(rightX), Math.abs(leftY), Math.abs(rightY));
    atomOverlay = {
      left: renderDividerJointDataUrl(atom, atomW, atomH, false),
      right: renderDividerJointDataUrl(atom, atomW, atomH, true),
      width: atomW,
      height: atomH,
      outset: Math.ceil(Math.max(atomW, atomH) + maxOffset + 4),
      leftX,
      rightX,
      leftY,
      rightY,
    };
  }
  return { railUrl: railTile.url, railHeight: railTile.height, railTileWidth: railTile.width, height: DIVIDER_H, atomOverlay };
}

export async function composeFrameDataUrl(tune: RoleTune): Promise<FrameRender> {
  const hasAtom = tune.atomSourceId !== NO_ATOM_SOURCE_ID;
  const [atomImage, railImage] = await Promise.all([
    hasAtom ? loadImage(chromeSourceById(tune.atomSourceId).src) : Promise.resolve(null),
    loadImage(chromeSourceById(tune.railSourceId).src),
  ]);
  const atomSize = clamp(Math.round(tune.atomSize), 1, 256);
  const atom = atomImage ? renderCanvasAtSize(rotateCanvas(imageCanvas(atomImage), tune.atomTurns), atomSize, atomSize) : null;
  const rail = horizontalRailCanvas(railImage);
  const { canvas, slice, frameSize } = renderFrameBaseCanvas(tune, rail);
  const url = canvas.toDataURL('image/png');
  let previewUrl = url;
  let atomOverlay: AtomOverlayRender | null = null;
  if (atom) {
    atomOverlay = atomOverlayForTune(tune, atom, slice);
    const seat = sourceAtomSeatOffsets(tune, slice);
    const seatMax = Math.max(Math.abs(seat.leftX), Math.abs(seat.rightX), Math.abs(seat.topY), Math.abs(seat.bottomY));
    const bleed = Math.max(48, atomSize + seatMax);
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = frameSize + bleed * 2;
    previewCanvas.height = frameSize + bleed * 2;
    const previewContext = previewCanvas.getContext('2d')!;
    previewContext.imageSmoothingEnabled = false;
    drawFrameBase(previewContext, tune, rail, slice, frameSize, bleed, bleed);
    drawFrameAtoms(previewContext, tune, atom, slice, frameSize, bleed, bleed);
    previewUrl = previewCanvas.toDataURL('image/png');
  }
  return { url, previewUrl, slice, size: frameSize, atomOverlay };
}

function cssPx(value: number): string {
  if (Number.isInteger(value)) return `${value}px`;
  return `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}px`;
}

export function chromeFillTintById(id: ChromeFillTintId): (typeof CHROME_FILL_TINTS)[number] {
  return CHROME_FILL_TINTS.find((tint) => tint.id === id) ?? CHROME_FILL_TINTS[0];
}

export function chromeFillSurfaceById(id: ChromeFillSurfaceId): (typeof CHROME_FILL_SURFACES)[number] {
  return CHROME_FILL_SURFACES.find((surface) => surface.id === id) ?? CHROME_FILL_SURFACES[0];
}

function chromeFillColor(tune: RoleTune): string {
  const alpha = clamp(tune.fillAlpha, 0, 1);
  if (tune.fillMode === 'none' || alpha <= 0) return 'transparent';
  const tint = chromeFillTintById(tune.fillTintId);
  return `rgba(${tint.rgb[0]}, ${tint.rgb[1]}, ${tint.rgb[2]}, ${alpha})`;
}

function chromeFillCss(tune: RoleTune): string {
  if (tune.fillMode === 'none') {
    return `  background-color: transparent !important;
  background-image: none !important;`;
  }
  if (tune.fillMode === 'tint') {
    return `  background-color: ${chromeFillColor(tune)} !important;
  background-image: none !important;`;
  }
  const surface = chromeFillSurfaceById(tune.fillSurfaceId);
  const surfaceScale = cssPx(clamp(Math.round(tune.fillSurfaceScale), 64, 1536));
  const tint = chromeFillColor(tune);
  const hasTint = tint !== 'transparent';
  return `  background-color: transparent !important;
  background-image: ${hasTint ? `linear-gradient(${tint}, ${tint}), ` : ''}url("${surface.src}") !important;
  background-position: 0 0 !important;
  background-repeat: repeat !important;
  background-size: ${hasTint ? `auto, ${surfaceScale} auto` : `${surfaceScale} auto`} !important;`;
}

function borderImageRepeatForTune(tune: RoleTune): string {
  return tune.railFit === 'tile' ? 'repeat' : 'stretch';
}

function selectorListParts(selector: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

function appendPseudoToSelectorList(selector: string, pseudo: string): string {
  return selectorListParts(selector).map((part) => `${part}${pseudo}`).join(',\n');
}

function cornerAtomOverlayCss(selector: string, overlay: AtomOverlayRender | null, options: { forcePosition?: boolean; pseudo?: '::before' | '::after' } = {}): string {
  const pseudo = options.pseudo ?? '::after';
  const overlaySelector = appendPseudoToSelectorList(selector, pseudo);
  if (!overlay) {
    return `
${overlaySelector} {
  content: none !important;
}
`;
  }
  const size = `${cssPx(overlay.size)} ${cssPx(overlay.size)}`;
  const outset = cssPx(overlay.outset);
  const leftX = cssPx(overlay.outset + overlay.leftX);
  const rightX = cssPx(overlay.outset + overlay.rightX);
  const topY = cssPx(overlay.outset + overlay.topY);
  const bottomY = cssPx(overlay.outset + overlay.bottomY);
  const baseDecls = [
    options.forcePosition ? '  position: relative !important;' : '',
    '  overflow: visible !important;',
  ].filter(Boolean).join('\n');
  return `
${selector} {
${baseDecls}
}
${overlaySelector} {
  background-image: url("${overlay.tl}"), url("${overlay.tr}"), url("${overlay.bl}"), url("${overlay.br}");
  background-position: left ${leftX} top ${topY}, right ${rightX} top ${topY}, left ${leftX} bottom ${bottomY}, right ${rightX} bottom ${bottomY};
  background-repeat: no-repeat;
  background-size: ${size}, ${size}, ${size}, ${size};
  content: "";
  image-rendering: pixelated;
  inset: -${outset};
  pointer-events: none;
  position: absolute;
  z-index: 4;
}
`;
}

function dividerCss(outer: RoleTune, outerFrame: FrameRender, divider: DividerRender): string {
  if (!outerFrame.url) return '';
  const railWidth = divider.railHeight;
  const railTop = Math.round((divider.height - railWidth) / 2);
  let atomCss = `
.level-editor-screen .le-control-divider-host .kit-divider::after {
  content: none !important;
}
`;
  if (divider.atomOverlay) {
    const overlay = divider.atomOverlay;
    const outset = cssPx(overlay.outset);
    const leftX = cssPx(overlay.outset + overlay.leftX);
    const rightX = cssPx(overlay.outset + overlay.rightX);
    const leftY = cssPx(overlay.outset + overlay.leftY);
    const rightY = cssPx(overlay.outset + overlay.rightY);
    atomCss = `
.level-editor-screen .le-control-divider-host .kit-divider::after {
  background-image: url("${overlay.left}"), url("${overlay.right}");
  background-position: left ${leftX} top ${leftY}, right ${rightX} top ${rightY};
  background-repeat: no-repeat;
  background-size: ${cssPx(overlay.width)} ${cssPx(overlay.height)}, ${cssPx(overlay.width)} ${cssPx(overlay.height)};
  content: "";
  image-rendering: pixelated;
  inset: -${outset};
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
`;
  }
  return `
.level-editor-screen .le-control-divider-host .kit-divider {
  background: none !important;
  border: 0 !important;
  border-image: none !important;
  box-sizing: border-box;
  height: ${cssPx(divider.height)} !important;
  overflow: visible !important;
  position: relative;
}
.level-editor-screen .le-control-divider-host .kit-divider::before {
  border-color: transparent !important;
  border-style: solid !important;
  border-width: ${cssPx(railWidth)} 0 0 0 !important;
  border-image-source: url("${outerFrame.url}") !important;
  border-image-slice: ${outerFrame.slice} !important;
  border-image-width: ${cssPx(railWidth)} 0 0 0 !important;
  border-image-repeat: ${borderImageRepeatForTune(outer)} !important;
  box-sizing: border-box;
  content: "";
  image-rendering: pixelated;
  height: ${cssPx(railWidth)};
  left: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: ${cssPx(railTop)};
  z-index: 0;
}
${atomCss}
`;
}

export function frameCss(outer: RoleTune, inner: RoleTune, outerFrame: FrameRender, innerFrame: FrameRender, divider: DividerRender): string {
  if (!outerFrame.url || !innerFrame.url) return '';
  const familySurface = ':is(.level-editor-screen, .skirmish-screen)';
  const outerRailWidth = renderedRailThickness(outer);
  const innerRailWidth = renderedRailThickness(inner);
  const outerContentInset = roleContentInset(outer);
  const outerAtomOutset = cssPx(outerFrame.atomOverlay?.outset ?? 0);
  const innerAtomOutset = cssPx(innerFrame.atomOverlay?.outset ?? 0);
  const innerAtomLeftOverhang = cssPx(Math.max(0, -(innerFrame.atomOverlay?.leftX ?? 0)));
  const innerAtomRightOverhang = cssPx(Math.max(0, -(innerFrame.atomOverlay?.rightX ?? 0)));
  const innerAtomLeftFootprint = cssPx(innerFrame.atomOverlay?.leftFootprint ?? 0);
  const innerAtomRightFootprint = cssPx(innerFrame.atomOverlay?.rightFootprint ?? 0);
  const innerSelectFrameSelectors = `${familySurface} .le-select-wrap,
${familySurface} .le-layer-select-wrap,
${familySurface} .le-event-select-wrap`;
  const innerControlSelectors = `${familySurface} .le-seg-btn,
${familySurface} .le-faction-select,
${familySurface} .settings-chrome-button,
${familySurface} .settings-toggle,
${familySurface} .settings-stepper .settings-chrome-button,
${familySurface} .le-board-link-input,
${familySurface} .le-violations,
${familySurface} .le-status-current,
${familySurface} .le-material-values,
${familySurface} .le-status-entry,
${familySurface} .unit-portrait,
${familySurface} .skirmish-service-record`;
  const innerChromeFrameSelectors = `${familySurface} .le-seg-btn,
${familySurface} .le-faction-select,
${innerSelectFrameSelectors},
${familySurface} .settings-chrome-button,
${familySurface} .settings-toggle,
${familySurface} .settings-stepper .settings-chrome-button`;
  return `
${familySurface} {
  --le-chrome-outer-rail-w: ${outerRailWidth}px !important;
  --le-chrome-inner-rail-w: ${innerRailWidth}px !important;
  --le-outer-atom-outset: ${outerAtomOutset} !important;
  --le-inner-atom-outset: ${innerAtomOutset} !important;
  --le-inner-atom-left-overhang: ${innerAtomLeftOverhang} !important;
  --le-inner-atom-right-overhang: ${innerAtomRightOverhang} !important;
  --le-inner-atom-left-footprint: ${innerAtomLeftFootprint} !important;
  --le-inner-atom-right-footprint: ${innerAtomRightFootprint} !important;
  --le-outer-fill-box-left: ${cssPx(outer.fillBoxLeft)} !important;
  --le-outer-fill-box-right: ${cssPx(outer.fillBoxRight)} !important;
  --le-outer-fill-box-top: ${cssPx(outer.fillBoxTop)} !important;
  --le-outer-fill-box-bottom: ${cssPx(outer.fillBoxBottom)} !important;
  --le-outer-content-padding: ${cssPx(outerContentInset)} !important;
  --le-panel-title-text-x: ${cssPx(outer.titleTextX ?? 0)} !important;
  --le-panel-title-text-y: ${cssPx(outer.titleTextY ?? 0)} !important;
  --le-panel-title-font-size: ${cssPx(outer.titleFontSize ?? 16)} !important;
  --le-panel-title-align-extra-x: ${outer.titleHorizontalAlign === 'content-inset' ? 'calc(var(--le-outer-fill-box-left, 0px) - var(--ds-space-3))' : '0px'} !important;
  --le-panel-title-effective-text-x: ${outer.titleHorizontalAlign === 'content-inset' ? '0px' : cssPx(outer.titleTextX ?? 0)} !important;
  --le-panel-title-effective-text-y: ${outer.titleVerticalAlign === 'center' ? '0px' : cssPx(outer.titleTextY ?? 0)} !important;
  --skirmish-chrome-outer-rail-w: ${outerRailWidth}px !important;
  --skirmish-chrome-inner-rail-w: ${innerRailWidth}px !important;
  --skirmish-chrome-outer-panel-image: url("${outerFrame.url}") !important;
  --skirmish-chrome-outer-line-image: url("${outerFrame.url}") !important;
  --skirmish-chrome-inner-control-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-control-active-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-control-danger-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-line-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-line-warm-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-line-success-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-line-warning-image: url("${innerFrame.url}") !important;
  --skirmish-chrome-inner-line-error-image: url("${innerFrame.url}") !important;
}
${familySurface} .le-outer-panel::before {
  border-image-source: url("${outerFrame.url}") !important;
  border-image-slice: ${outerFrame.slice} !important;
  border-image-width: ${outerRailWidth}px !important;
  border-image-repeat: ${borderImageRepeatForTune(outer)} !important;
}
${familySurface} .le-outer-panel {
  background-color: transparent !important;
  background-image: none !important;
}
${familySurface} .le-outer-panel > .le-outer-panel-fill {
${chromeFillCss(outer)}
}
${cornerAtomOverlayCss(`${familySurface} .le-outer-panel`, outerFrame.atomOverlay)}
${innerChromeFrameSelectors} {
  border-image-source: url("${innerFrame.url}") !important;
  border-image-slice: ${innerFrame.slice} !important;
  border-image-width: ${innerRailWidth}px !important;
  border-image-repeat: ${borderImageRepeatForTune(inner)} !important;
${chromeFillCss(inner)}
}
${familySurface} .le-board-link-input,
${familySurface} .le-violations,
${familySurface} .le-status-current,
${familySurface} .le-material-values,
${familySurface} .le-status-entry,
${familySurface} .unit-portrait,
${familySurface} .skirmish-service-record {
  border-image-source: url("${innerFrame.url}") !important;
  border-image-slice: ${innerFrame.slice} !important;
  border-image-width: ${innerRailWidth}px !important;
  border-image-repeat: ${borderImageRepeatForTune(inner)} !important;
${chromeFillCss(inner)}
}
${cornerAtomOverlayCss(innerControlSelectors, innerFrame.atomOverlay, { forcePosition: true })}
${cornerAtomOverlayCss(innerSelectFrameSelectors, innerFrame.atomOverlay, { forcePosition: true, pseudo: '::before' })}
${dividerCss(outer, outerFrame, divider)}
`;
}
