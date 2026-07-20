import type { TerrainSideFace } from '../render/terrainSides';
import { drawableAssets, requiredDrawableAsset, requiredDrawableDefault, type DrawableAsset } from '../art/drawableCatalog';

export type SubterrainMaterial = string;

export type SubterrainPlacementMap = Record<string, SubterrainMaterial>;

export function subterrainFaceKey(x: number, y: number, face: TerrainSideFace): string {
  return `${x},${y}:${face}`;
}

export function parseSubterrainFaceKey(key: string): { x: number; y: number; face: TerrainSideFace } | null {
  const match = /^(-?\d+),(-?\d+):(south|east)$/.exec(key);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]), face: match[3] as TerrainSideFace };
}

export function subterrainMaterialSrc(material: SubterrainMaterial): string {
  const asset = requiredDrawableAsset(material, 'subterrain');
  const surface = asset.media.surface;
  if (!surface) throw new Error(`invalid drawable catalog: subterrain ${material} has no surface role`);
  return surface.media.immutableUrl;
}

export function isSubterrainMaterial(value: unknown): value is SubterrainMaterial {
  return typeof value === 'string' && /^[a-z][a-z0-9._-]{0,127}$/.test(value);
}

export function subterrainMaterials(): DrawableAsset[] {
  return drawableAssets('subterrain');
}

export function defaultSubterrainMaterial(): SubterrainMaterial {
  return requiredDrawableDefault('subterrain').id;
}

export function cleanSubterrainPlacements(
  value: unknown,
  terrainSurface: ReadonlySet<string>,
): SubterrainPlacementMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SubterrainPlacementMap = {};
  for (const [key, material] of Object.entries(value as Record<string, unknown>)) {
    const parsed = parseSubterrainFaceKey(key);
    if (!parsed || !isSubterrainMaterial(material) || !terrainSurface.has(`${parsed.x},${parsed.y}`)) continue;
    const neighbor = parsed.face === 'south' ? `${parsed.x},${parsed.y + 1}` : `${parsed.x + 1},${parsed.y}`;
    if (terrainSurface.has(neighbor)) continue;
    out[key] = material;
  }
  return out;
}
