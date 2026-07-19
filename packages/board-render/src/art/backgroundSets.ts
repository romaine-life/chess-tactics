import type { PlayablePieceType } from '../core/pieces';
import { drawableAssets } from './drawableCatalog';

export interface BackgroundSet {
  id: string;
  label: string;
  world: string;
  portraits: Record<PlayablePieceType, string>;
}

const PIECES: readonly PlayablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'] as const;
const DIRECTIONS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const;
const currentBackgroundSets = (): BackgroundSet[] => drawableAssets('background-set').map((asset) => {
  const world = asset.media.world?.media.immutableUrl;
  const portraits = Object.fromEntries(PIECES.map((piece) => [piece, asset.media[`portrait-${piece}`]?.media.immutableUrl]));
  if (!world || Object.values(portraits).some((value) => !value)) throw new Error(`background set ${asset.id} is incomplete`);
  return { id: asset.id, label: asset.label, world, portraits: portraits as Record<PlayablePieceType, string> };
});

export const backgroundSets: readonly BackgroundSet[] = new Proxy([] as BackgroundSet[], {
  get: (_target, property) => {
    const current = currentBackgroundSets();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export const defaultBackgroundSet = (): BackgroundSet => {
  const records = drawableAssets('background-set');
  const preferred = records.find((asset) => asset.behavior.default === true) ?? records[0];
  const result = currentBackgroundSets().find((set) => set.id === preferred?.id);
  if (!result) throw new Error('drawable catalog has no complete background set');
  return result;
};

export function assertInstalledPresentationCatalog(): void {
  const backgrounds = currentBackgroundSets();
  if (!backgrounds.length) throw new Error('drawable catalog has no complete background set');
  for (const piece of PIECES) {
    const portrait = drawableAssets('unit-portrait').find((asset) => asset.behavior.piece === piece);
    if (!portrait || PALETTES.some((palette) => !portrait.media[palette])) {
      throw new Error(`drawable catalog has no complete ${piece} portrait set`);
    }
  }
  const neutral = drawableAssets('neutral-unit-art');
  if (!neutral.length || neutral.some((asset) => DIRECTIONS.some((direction) => !asset.media[direction]))) {
    throw new Error('drawable catalog has no complete neutral unit art');
  }
  const surfaces = drawableAssets('terrain-surface');
  if (!surfaces.length || surfaces.some((asset) => !asset.media.source)) throw new Error('drawable catalog has incomplete terrain source media');
  if (!drawableAssets('terrain-review').length) throw new Error('drawable catalog has no terrain review inventory');
  if (!drawableAssets('terrain-comparison').length) throw new Error('drawable catalog has no terrain comparison inventory');
  if (!drawableAssets('portrait-treatment').length) throw new Error('drawable catalog has no portrait treatment inventory');
  const appUi = drawableAssets('app-ui').find((asset) => Array.isArray(asset.behavior.roles) && asset.behavior.roles.includes('application-ui'));
  const requiredRoles = appUi?.behavior.requiredRoles;
  if (!appUi || !Array.isArray(requiredRoles) || requiredRoles.some((role) => typeof role !== 'string' || !appUi.media[role])) {
    throw new Error('drawable catalog has incomplete application UI media');
  }
  if (!drawableAssets('app-font').length) throw new Error('drawable catalog has no application font inventory');
  const chrome = drawableAssets('chrome-family').find((asset) => Array.isArray(asset.behavior.roles) && asset.behavior.roles.includes('installed-chrome'));
  if (!chrome || ['outer-atom', 'outer-rail', 'inner-atom', 'inner-rail', 'divider-joint'].some((role) => !chrome.media[role])) {
    throw new Error('drawable catalog has incomplete installed Chrome');
  }
  if (!drawableAssets('artwork-reference').length) throw new Error('drawable catalog has no artwork reference inventory');
  const nineSlices = drawableAssets('nine-slice');
  if (!nineSlices.length) throw new Error('drawable catalog has no nine-slice inventory');
  for (const role of ['frame-editor-default', 'divider-editor-default', 'settings-panel', 'settings-tab']) {
    if (!nineSlices.some((asset) => Array.isArray(asset.behavior.roles) && asset.behavior.roles.includes(role))) {
      throw new Error(`drawable catalog has no nine-slice role ${role}`);
    }
  }
  const scrollbars = drawableAssets('ui-scrollbar');
  if (!scrollbars.length) throw new Error('drawable catalog has no UI scrollbar inventory');
  if (!scrollbars.some((asset) => Array.isArray(asset.behavior.roles) && asset.behavior.roles.includes('installed-scrollbar'))) {
    throw new Error('drawable catalog has no installed UI scrollbar');
  }
}
