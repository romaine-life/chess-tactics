import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyDrawableCatalog, resetDrawableCatalog } = require('../dist/index.cjs');

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
  const prefix = kind === 'fence-material' ? `fence-${value}` : `wall-${value}`;
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

export function installTestDrawableCatalog() {
  applyDrawableCatalog({
    schemaVersion: 1,
    revision: 1,
    updatedAt: null,
    assets: [
      terrainSurface('dirt-surf-6', 'dirt', 6, 0),
      terrainSurface('grass-surf-0', 'grass', 0, 1),
      terrainSurface('sand-surf-5', 'sand', 5, 2),
      terrainSurface('stone-surf-0', 'stone', 0, 3),
      material('fence-wood', 'fence-material', 'wood', ['frame-2', 'frame-4', 'frame-6', 'post'], 4),
      material('fence-stone', 'fence-material', 'stone', ['frame-2', 'frame-4', 'frame-6', 'post'], 5),
      material('wall-stone', 'wall-material', 'stone', ['frame-1', 'frame-8', 'frame-9'], 6),
    ],
  });
}

export function resetTestDrawableCatalog() {
  resetDrawableCatalog();
}
