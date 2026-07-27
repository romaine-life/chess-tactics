import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyDrawableCatalog,
  currentDrawableCatalog,
  hydratePropSeats,
  resetDrawableCatalog,
  resetPropSeats,
} = require('../dist/index.cjs');

function mediaRole(slot, width = 96, height = 180) {
  let hash = 2166136261;
  for (const character of slot) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const sha256 = hash.toString(16).padStart(8, '0').repeat(8);
  return {
    slot,
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      byteLength: 512,
      width,
      height,
    },
  };
}

function terrainSurface(id, family, variant, sortOrder) {
  return {
    id,
    kind: 'terrain-surface',
    label: `${family} test surface ${variant}`,
    sortOrder,
    lifecycleState: 'active',
    behavior: { family, role: variant === 0 ? 'base' : 'variant', probability: 1 },
    metadata: {},
    rowRevision: 1,
    media: { top: mediaRole(`tiles/surface/${family}-${variant}-top.png`) },
  };
}

function material(id, kind, value, roles, sortOrder) {
  const prefix = kind === 'fence-material'
    ? `fence-${value}`
    : kind === 'wall-material'
      ? `wall-${value}`
      : kind === 'road-material'
        ? `road-${value}`
        : `river-${value}`;
  return {
    id,
    kind,
    label: `${value} test material`,
    sortOrder,
    lifecycleState: 'active',
    behavior: { value, default: true },
    metadata: {},
    rowRevision: 1,
    media: Object.fromEntries(roles.map((role) => {
      const suffix = role.startsWith('frame-') ? role.slice('frame-'.length) : role;
      return [role, mediaRole(`tiles/feature/${prefix}-${suffix}.png`)];
    })),
  };
}

function subterrain(id, sortOrder) {
  return {
    id,
    kind: 'subterrain',
    label: `${id} test subterrain`,
    sortOrder,
    lifecycleState: 'active',
    behavior: { default: sortOrder === 0 },
    metadata: {},
    rowRevision: 1,
    media: { surface: mediaRole(`tiles/subterrain/${id}.png`) },
  };
}

function structure(value, structureKind, sortOrder, footprint) {
  return {
    id: `structure-${value}`,
    kind: 'structure',
    label: `${value} test structure`,
    sortOrder,
    lifecycleState: 'active',
    behavior: {
      value,
      structureKind,
      terrains: ['grass', 'dirt', 'stone'],
      anchorX: 48,
      anchorY: 69,
      scale: 1,
      blocking: structureKind !== 'doodad',
      splitMode: 'authored',
      ...(footprint ? { footprint } : {}),
      ...(structureKind === 'doodad' ? { default: true, propKind: 'rock' } : {}),
    },
    metadata: {},
    rowRevision: 1,
    media: {
      back: mediaRole(`test/structure/${value}-back.png`, 96, 180),
      front: mediaRole(`test/structure/${value}-front.png`, 96, 180),
    },
  };
}

export function installTestDrawableCatalog() {
  applyDrawableCatalog({
    schemaVersion: 1,
    revision: 1,
    updatedAt: null,
    assets: [
      { id: 'terrain-family-grass', kind: 'terrain-family', label: 'Grass', sortOrder: 0, lifecycleState: 'active', behavior: { value: 'grass', default: true, roles: ['level-editor-scatter'], scatterDefaultShare: 100, gameplayTerrain: 'grass', rendersGameplayTerrains: ['grass'] }, metadata: {}, rowRevision: 1, media: {} },
      { id: 'terrain-family-dirt', kind: 'terrain-family', label: 'Dirt', sortOrder: 1, lifecycleState: 'active', behavior: { value: 'dirt', roles: [], gameplayTerrain: 'dirt', rendersGameplayTerrains: ['dirt'] }, metadata: {}, rowRevision: 1, media: {} },
      { id: 'terrain-family-sand', kind: 'terrain-family', label: 'Sand', sortOrder: 2, lifecycleState: 'active', behavior: { value: 'sand', roles: [], gameplayTerrain: 'sand', rendersGameplayTerrains: ['sand'] }, metadata: {}, rowRevision: 1, media: {} },
      { id: 'terrain-family-stone', kind: 'terrain-family', label: 'Stone', sortOrder: 3, lifecycleState: 'active', behavior: { value: 'stone', roles: [], gameplayTerrain: 'stone', rendersGameplayTerrains: ['stone', 'road', 'bridge', 'cliff', 'rock'] }, metadata: {}, rowRevision: 1, media: {} },
      terrainSurface('dirt-surf-6', 'dirt', 6, 0),
      terrainSurface('grass-surf-0', 'grass', 0, 1),
      terrainSurface('sand-surf-5', 'sand', 5, 2),
      terrainSurface('stone-surf-0', 'stone', 0, 3),
      subterrain('earth', 0),
      subterrain('bedrock', 1),
      subterrain('sand', 2),
      subterrain('roots', 3),
      material('road-dirt', 'road-material', 'dirt', Array.from({ length: 16 }, (_, index) => `frame-${index}`), 2),
      material('river-water', 'river-material', 'water', Array.from({ length: 16 }, (_, index) => `frame-${index}`), 3),
      material('fence-wood', 'fence-material', 'wood', ['frame-2', 'frame-4', 'frame-6', 'post'], 4),
      material('fence-stone', 'fence-material', 'stone', ['frame-2', 'frame-4', 'frame-6', 'post'], 5),
      material('wall-stone', 'wall-material', 'stone', ['frame-1', 'frame-8', 'frame-9'], 6),
    ],
  });
}

export function installTestDrawableCatalogWithStructures() {
  installTestDrawableCatalog();
  const current = currentDrawableCatalog();
  applyDrawableCatalog({
    ...current,
    assets: [
      ...current.assets,
      structure('oak', 'tree', 100, { w: 2, h: 2 }),
      structure('cottage', 'house', 101, { w: 2, h: 2 }),
      structure('cabin', 'house', 102, { w: 1, h: 1 }),
      structure('lodge', 'house', 103, { w: 2, h: 2 }),
      structure('rock', 'rock', 104, { w: 1, h: 1 }),
      structure('fieldstone', 'rock', 105, { w: 1, h: 1 }),
      structure('unused-test-doodad', 'doodad', 106),
    ],
  });
}

export function installTestDrawableCatalogWithSourceOnlyStructure() {
  installTestDrawableCatalogWithStructures();
  const current = currentDrawableCatalog();
  const directions = [
    'south', 'south-west', 'west', 'north-west',
    'north', 'north-east', 'east', 'south-east',
  ];
  const turntableMedia = Object.fromEntries(directions.flatMap((direction) => {
    const role = mediaRole(`source-art/castle-ruin/${direction}.png`, 512, 512);
    return [[`${direction}-back`, role], [`${direction}-front`, structuredClone(role)]];
  }));
  applyDrawableCatalog({
    ...current,
    revision: current.revision + 1,
    assets: [
      ...current.assets,
      {
        id: 'structure-castle-ruin',
        kind: 'structure',
        label: 'Castle ruin source artwork',
        sortOrder: 200,
        lifecycleState: 'active',
        behavior: {
          value: 'castle-ruin',
          structureKind: 'landmark',
          sourceOnly: true,
          anchorX: 256,
          anchorY: 256,
          scale: 0.4,
          splitMode: 'flat-contact',
        },
        metadata: {},
        rowRevision: 1,
        media: turntableMedia,
      },
      {
        id: 'structure-source-doodad',
        kind: 'structure',
        label: 'Source-only doodad artwork',
        sortOrder: 201,
        lifecycleState: 'active',
        behavior: {
          value: 'source-doodad',
          structureKind: 'doodad',
          sourceOnly: true,
          anchorX: 256,
          anchorY: 256,
          scale: 0.4,
          splitMode: 'flat-contact',
        },
        metadata: {},
        rowRevision: 1,
        media: structuredClone(turntableMedia),
      },
    ],
  });
}

export function installTestPropSeats() {
  hydratePropSeats({
    oak: { anchorX: 96, anchorY: 255, scale: 1, w: 2, h: 2, default: true },
    cottage: { anchorX: 91, anchorY: 110, scale: 0.62, w: 2, h: 2 },
    cabin: { anchorX: 118, anchorY: 107, scale: 0.35, w: 1, h: 1 },
    lodge: { anchorX: 103, anchorY: 126, scale: 1, w: 2, h: 2 },
    rock: { anchorX: 20, anchorY: 44, scale: 1, w: 1, h: 1 },
    fieldstone: { anchorX: 25, anchorY: 46, scale: 1, w: 1, h: 1 },
  });
}

export function resetTestDrawableCatalog() {
  resetDrawableCatalog();
}

export function resetTestPropSeats() {
  resetPropSeats();
}
