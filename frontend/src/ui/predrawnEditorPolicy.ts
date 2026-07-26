import type { EditorBoard } from './boardCode';
import type { LevelEditorLayerKey } from './levelEditorRoute';

// A continuous pre-drawn plate already owns these pixels. Mutating their logical
// sources without regenerating the plate would make the artwork lie about play.
const PREDRAWN_LOCKED_LAYERS = new Set<LevelEditorLayerKey>([
  'tile',
  'generate',
  'paths',
  'fence',
  'wall',
  'wallart',
  'prop',
  'doodad',
  'subterrain',
  'artwork',
]);

export function isPredrawnLockedLayer(layer: LevelEditorLayerKey): boolean {
  return PREDRAWN_LOCKED_LAYERS.has(layer);
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
    props: board.props,
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

export function predrawnEditorHrefAfterPicker(href: string): string {
  const url = new URL(href, 'http://local.test');
  url.searchParams.delete('predrawnPicker');
  return `${url.pathname}${url.search}${url.hash}`;
}
