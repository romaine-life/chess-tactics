import { drawableAssets, type DrawableAsset, type DrawableMediaRole } from '../art/drawableCatalog';

export type WallDecorKind = 'banner' | 'relief' | 'lantern' | 'mirror';
export type WallDecorFaceId = 'west' | 'north';
export type WallDecorMirrorCoverage = 'authored-crop' | 'full-body';
export type NormalizedAperturePolygon = number[];

export interface WallDecorFace {
  src: string; width: number; height: number; mountX: number; mountY: number; previewX: number; previewY: number;
}
export interface WallDecorMirrorFace extends WallDecorFace { aperture: NormalizedAperturePolygon; glassSrc: string }
interface WallDecorAssetBase { id: string; label: string; kind: WallDecorKind; src: string; width: number; height: number; mountX: number; mountY: number }
export interface WallDecorStaticAsset extends WallDecorAssetBase { kind: Exclude<WallDecorKind, 'mirror'>; faces: Record<WallDecorFaceId, WallDecorFace> }
export interface WallDecorMirrorAsset extends WallDecorAssetBase { kind: 'mirror'; mirrorCoverage: WallDecorMirrorCoverage; faces: Record<WallDecorFaceId, WallDecorMirrorFace> }
export type WallDecorAsset = WallDecorStaticAsset | WallDecorMirrorAsset;

const wallDecorAssets: WallDecorAsset[] = [];
export const WALL_DECOR_ASSETS: readonly WallDecorAsset[] = wallDecorAssets;
export const WALL_DECOR_KINDS: readonly WallDecorKind[] = new Proxy([] as WallDecorKind[], {
  get(_target, property) { const values = [...new Set(wallDecorAssets.map((asset) => asset.kind))]; const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
export const WALL_DECOR_KIND_LABELS: Record<string, string> = new Proxy({}, {
  get(_target, property) {
    const asset = drawableAssets('wall-decor').find((entry) => entry.behavior.decorKind === property);
    if (!asset || typeof asset.metadata.kindLabel !== 'string' || !asset.metadata.kindLabel) {
      throw new Error(`invalid wall-decor catalog: kind ${String(property)} has no label`);
    }
    return asset.metadata.kindLabel;
  },
}) as Record<string, string>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function isNormalizedAperture(value: unknown): value is NormalizedAperturePolygon {
  return Array.isArray(value) && value.length >= 6 && value.length % 2 === 0 && value.every((item) => finite(item) && item >= 0 && item <= 1);
}
const media = (asset: DrawableAsset, role: string): DrawableMediaRole => {
  const value = asset.media[role];
  if (!value || value.media.mediaType !== 'image/png' || !positive(value.media.width) || !positive(value.media.height)) throw new Error(`invalid wall-decor catalog: ${asset.id} ${role} media is invalid`);
  return value;
};
const geometry = (asset: DrawableAsset, face: WallDecorFaceId) => {
  const faces = asset.behavior.faces;
  const value = record(faces) ? faces[face] : null;
  if (!record(value) || !finite(value.mountX) || !finite(value.mountY) || !finite(value.previewX) || !finite(value.previewY)) throw new Error(`invalid wall-decor catalog: ${asset.id} ${face} geometry is invalid`);
  return value;
};

export function applyWallDecorCatalog(): void {
  const next = drawableAssets('wall-decor').map((asset): WallDecorAsset => {
    const rawKind = asset.behavior.decorKind;
    if ((rawKind !== 'banner' && rawKind !== 'relief' && rawKind !== 'lantern' && rawKind !== 'mirror') || !finite(asset.behavior.mountX) || !finite(asset.behavior.mountY)) throw new Error(`invalid wall-decor catalog: ${asset.id} behavior is invalid`);
    const kind: WallDecorKind = rawKind;
    const base = media(asset, 'base'); const west = media(asset, 'west'); const north = media(asset, 'north');
    const common = { id: asset.id, label: asset.label, kind, src: base.media.immutableUrl, width: base.media.width!, height: base.media.height!, mountX: asset.behavior.mountX, mountY: asset.behavior.mountY };
    const face = (id: WallDecorFaceId): WallDecorFace => { const source = id === 'west' ? west : north; return { src: source.media.immutableUrl, width: source.media.width!, height: source.media.height!, ...geometry(asset, id) } as WallDecorFace; };
    if (kind !== 'mirror') return { ...common, kind, faces: { west: face('west'), north: face('north') } };
    const coverage = asset.behavior.mirrorCoverage;
    if (coverage !== 'authored-crop' && coverage !== 'full-body') throw new Error(`invalid wall-decor catalog: ${asset.id} mirror coverage is invalid`);
    const mirrorFace = (id: WallDecorFaceId): WallDecorMirrorFace => { const value = geometry(asset, id); if (!isNormalizedAperture(value.aperture)) throw new Error(`invalid wall-decor catalog: ${asset.id} ${id} aperture is invalid`); return { ...face(id), aperture: value.aperture, glassSrc: media(asset, `${id}-glass`).media.immutableUrl }; };
    return { ...common, kind: 'mirror', mirrorCoverage: coverage, faces: { west: mirrorFace('west'), north: mirrorFace('north') } };
  });
  wallDecorAssets.splice(0, wallDecorAssets.length, ...next);
  const defaults = drawableAssets('wall-decor').filter((asset) => asset.behavior.default === true);
  if (defaults.length !== 1 || !wallDecorAsset(defaults[0].id)) throw new Error(`invalid wall-decor catalog: expected one available default, found ${defaults.length}`);
}
export function resetWallDecorCatalog(): void { wallDecorAssets.splice(0, wallDecorAssets.length); }
export const wallDecorAsset = (id: string | undefined): WallDecorAsset | undefined => id
  ? wallDecorAssets.find((asset) => asset.id === id)
  : undefined;
export function defaultWallDecorAsset(): WallDecorAsset {
  const defaults = drawableAssets('wall-decor').filter((asset) => asset.behavior.default === true);
  if (defaults.length !== 1) throw new Error(`invalid wall-decor catalog: expected one default, found ${defaults.length}`);
  const selected = wallDecorAsset(defaults[0].id);
  if (!selected) throw new Error(`invalid wall-decor catalog: default ${defaults[0].id} is unavailable`);
  return selected;
}
export function wallDecorMirrorAperture(asset: WallDecorAsset | undefined, face: WallDecorFaceId): NormalizedAperturePolygon | null {
  if (!asset || asset.kind !== 'mirror') return null;
  const aperture = asset.faces[face].aperture;
  return isNormalizedAperture(aperture) ? [...aperture] : null;
}
