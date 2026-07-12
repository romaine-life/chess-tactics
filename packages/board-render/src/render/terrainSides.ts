export const TERRAIN_SIDE_FACES = ['south', 'east'] as const;

export type TerrainSideFace = (typeof TERRAIN_SIDE_FACES)[number];

/** Whether each camera-facing logical edge borders the void. */
export type TerrainSideExposure = Record<TerrainSideFace, boolean>;

/** Independently selected material for each camera-facing side. */
export type TerrainSideMaterials<TMaterial> = Partial<Record<TerrainSideFace, TMaterial>>;

/** Convert a tile/source record into the material used by one logical face. */
export type TerrainSideMaterialResolver<TSource, TMaterial> = (
  source: TSource,
  face: TerrainSideFace,
) => TMaterial | undefined;

export interface TerrainSideFaceState<TMaterial> {
  exposed: boolean;
  material?: TMaterial;
}

/** Topology and material stay separate so a corner may use two different side sources. */
export type TerrainSideFaces<TMaterial> = Record<TerrainSideFace, TerrainSideFaceState<TMaterial>>;

export type TerrainOccupancy = (x: number, y: number) => boolean;

/**
 * Resolve the two faces visible to the fixed camera. East looks toward x + 1 and south
 * looks toward y + 1; either face is exposed exactly when that neighbour is unoccupied.
 */
export function resolveTerrainSideExposure(
  cell: { x: number; y: number },
  isOccupied: TerrainOccupancy,
): TerrainSideExposure {
  return {
    south: !isOccupied(cell.x, cell.y + 1),
    east: !isOccupied(cell.x + 1, cell.y),
  };
}

/**
 * Resolve independently overrideable face sources to renderable materials. A face-specific
 * source wins; otherwise the cell's default source is used. Keeping this fallback rule here
 * prevents browser, editor, Studio, and server renderers from drifting as side treatments grow.
 */
export function resolveTerrainSideMaterials<TSource, TMaterial>(
  defaultSource: TSource | undefined,
  faceSources: TerrainSideMaterials<TSource> | undefined,
  materialForSource: TerrainSideMaterialResolver<TSource, TMaterial>,
): TerrainSideMaterials<TMaterial> {
  const materials: TerrainSideMaterials<TMaterial> = {};
  for (const face of TERRAIN_SIDE_FACES) {
    const source = faceSources?.[face] ?? defaultSource;
    if (source === undefined) continue;
    const material = materialForSource(source, face);
    if (material !== undefined) materials[face] = material;
  }
  return materials;
}

export function resolveTerrainSideFaces<TMaterial>(
  exposure: TerrainSideExposure,
  materials: TerrainSideMaterials<TMaterial>,
): TerrainSideFaces<TMaterial> {
  return {
    south: {
      exposed: exposure.south,
      ...(materials.south === undefined ? {} : { material: materials.south }),
    },
    east: {
      exposed: exposure.east,
      ...(materials.east === undefined ? {} : { material: materials.east }),
    },
  };
}

/**
 * Side sprites are authored as two vertical half-frames: logical south owns x < 48 and
 * logical east owns x >= 48. The order also preserves the established south-then-east
 * paint order at the shared front seam.
 */
export const TERRAIN_SIDE_FACE_COLUMN: Record<TerrainSideFace, 0 | 1> = {
  south: 0,
  east: 1,
};
