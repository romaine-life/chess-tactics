import { propDef, resolvePlacedPropId } from '../core/props';
import type { EditorBoard } from './boardCode';
import type { LevelEditorLayerKey, PlacedArtBrushKind } from './levelEditorRoute';

// A continuous pre-drawn plate already owns these pixels. Mutating their logical
// sources without regenerating the plate would make the artwork lie about play.
const PREDRAWN_LOCKED_LAYERS = new Set<LevelEditorLayerKey>([
  'tile',
  'generate',
  'paths',
  'fence',
  'wall',
  'wallart',
  'subterrain',
]);

export function isPredrawnLockedLayer(layer: LevelEditorLayerKey): boolean {
  return PREDRAWN_LOCKED_LAYERS.has(layer);
}

/**
 * Placed Art stays open on a plate board for exactly one thing: standing an obstacle on the picture
 * (ADR-0537). Scene Art, Forest, Town and Doodads are scenery, and scenery is what the plate already
 * painted — offering those brushes would offer edits the renderer then refuses to show.
 */
export function isPredrawnLockedPlacedArtKind(kind: PlacedArtBrushKind): boolean {
  return kind !== 'prop';
}

/** The only prop kind that may stand on a plate. Obstacles shape play; trees and houses dress it. */
export function isPredrawnLiveProp(propId: string, x: number, y: number): boolean {
  return propDef(resolvePlacedPropId(propId, x, y))?.kind === 'rock';
}

/**
 * The props a plate is answerable for. An anchor marked live stands ON the artwork and is depicted
 * by none of its pixels, so it is neither guarded as baked geometry nor counted against the raster.
 */
function predrawnBakedProps(board: EditorBoard): Record<string, { propId: string }> {
  const liveProps = new Set(board.liveProps ?? []);
  return Object.fromEntries(
    Object.entries(board.props ?? {}).filter(([key]) => !liveProps.has(key)),
  );
}

export function predrawnBakedArtSignature(board: EditorBoard): string {
  return JSON.stringify({
    cols: board.cols,
    rows: board.rows,
    decorativeApron: board.decorativeApron,
    decorativeCells: board.decorativeCells ?? {},
    decorativeFootprint: board.decorativeFootprint ?? [],
    decorativeFeatures: board.decorativeFeatures ?? {},
    decorativeFences: board.decorativeFences ?? {},
    decorativeFencePosts: board.decorativeFencePosts ?? {},
    decorativeWalls: board.decorativeWalls ?? {},
    cells: board.cells,
    macroTiles: board.macroTiles ?? [],
    doodads: board.doodads,
    props: predrawnBakedProps(board),
    floatingArtwork: board.floatingArtwork ?? [],
    features: board.features,
    fences: board.fences ?? {},
    fencePosts: board.fencePosts ?? {},
    walls: board.walls ?? {},
    wallArt: board.wallArt ?? {},
    subterrain: board.subterrain ?? {},
    featureCuts: board.featureCuts,
    featureExits: board.featureExits,
    generatedRegions: board.generatedRegions ?? [],
  });
}

export function preservesPredrawnBakedArt(current: EditorBoard, next: EditorBoard): boolean {
  return predrawnBakedArtSignature(current) === predrawnBakedArtSignature(next);
}

/**
 * Whether two boards remember the exact same artwork selection.
 *
 * This is the undo/redo guard, and it deliberately ignores the baked-art signature. Every entry on
 * the stack was already accepted by `commitEditorBoard`, so stepping between them can only replay
 * decisions the owner was allowed to make — including a resize or a grid slide, which change that
 * signature on purpose. What history must never do is restore a board from a DIFFERENT plate
 * selection, because those pixels answer to different geometry entirely.
 */
export function sharesPredrawnSelection(current: EditorBoard, next: EditorBoard): boolean {
  return JSON.stringify(current.surface ?? null) === JSON.stringify(next.surface ?? null);
}

export function predrawnEditorHrefAfterPicker(href: string): string {
  const url = new URL(href, 'http://local.test');
  url.searchParams.delete('predrawnPicker');
  return `${url.pathname}${url.search}${url.hash}`;
}
