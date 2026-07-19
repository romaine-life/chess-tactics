import { applyDrawableCatalog, applyGroundCoverCatalog, applyWallArtCatalog, applyWallDecorCatalog, type DrawableCatalog } from '@chess-tactics/board-render';

export function testDrawableCatalog(ids: readonly string[] = ['earth', 'roots', 'bedrock']): DrawableCatalog {
  const descriptor = (slot: string, width = 96, height = 180) => {
    let hash = 2166136261;
    for (const character of slot) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    const sha256 = hash.toString(16).padStart(8, '0').repeat(8);
    return ({
    slot,
    media: { url: `/assets/${slot}`, immutableUrl: `/api/media/${sha256}`, sha256, mediaType: 'image/png', byteLength: 512, width, height },
  });
  };
  const materialSpecs: Array<[string, string, string, string, boolean, string[]]> = [
    ['road-dirt', 'road-material', 'dirt', 'Dirt', true, [...Array.from({ length: 16 }, (_, i) => `frame-${i}`), 'thumb']],
    ['road-cobble', 'road-material', 'cobble', 'Cobblestone', false, [...Array.from({ length: 16 }, (_, i) => `frame-${i}`), 'thumb']],
    ['river-water', 'river-material', 'water', 'Water', true, [...Array.from({ length: 16 }, (_, i) => `frame-${i}`), 'thumb']],
    ['fence-wood', 'fence-material', 'wood', 'Wood', true, ['frame-2', 'frame-4', 'frame-6', 'thumb', 'post', 'post-thumb']],
    ['fence-stone', 'fence-material', 'stone', 'Stone', false, ['frame-2', 'frame-4', 'frame-6', 'thumb', 'post', 'post-thumb']],
    ['wall-stone', 'wall-material', 'stone', 'Stone', true, ['frame-1', 'frame-8', 'frame-9', 'thumb']],
    ['wall-brick', 'wall-material', 'brick', 'Brick', false, ['frame-1', 'frame-8', 'frame-9', 'thumb']],
    ['wall-mossy', 'wall-material', 'mossy', 'Mossy Stone', false, ['frame-1', 'frame-8', 'frame-9', 'thumb']],
    ['wall-basalt', 'wall-material', 'basalt', 'Basalt', false, ['frame-1', 'frame-8', 'frame-9', 'thumb']],
    ['wall-palisade', 'wall-material', 'palisade', 'Palisade', false, ['frame-1', 'frame-8', 'frame-9', 'thumb']],
  ];
  const terrainSpecs = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'].flatMap((family, familyIndex) =>
    Array.from({ length: 8 }, (_, variant) => ({
      id: `${family}-surf-${variant}`,
      kind: 'terrain-surface',
      label: `${family} surface ${variant + 1}`,
      sortOrder: familyIndex * 100 + variant,
      lifecycleState: 'active' as const,
      behavior: { family, role: variant === 0 ? 'base' : 'variant', probability: variant === 0 ? 1 : 0.8 },
      metadata: { familyLabel: family[0].toUpperCase() + family.slice(1), status: 'Production' },
      rowRevision: 1,
      media: { top: descriptor(`test/terrain/${family}-${variant}-top.png`) },
    })),
  );
  const macroVariants: Record<string, Array<[string, string]>> = {
    grass: [['meadow-drift', 'Meadow drift'], ['soft-bands', 'Soft grass bands'], ['clover-field', 'Clover field'], ['damp-drift', 'Damp grass drift']],
    dirt: [['worn-field', 'Worn earth'], ['soft-wear', 'Soft earth wear'], ['compacted-drift', 'Compacted earth drift'], ['cracked-earth', 'Cracked earth']],
    stone: [['moss-field', 'Mossy paving'], ['weathered-flagstone', 'Weathered flagstone'], ['old-cobble', 'Old cobblestone'], ['dark-slate', 'Dark slate']],
    pebble: [['fine-drift', 'Fine pebble drift'], ['alluvial-field', 'Alluvial pebble field'], ['warm-gravel', 'Warm gravel'], ['moss-gravel', 'Moss-flecked gravel']],
    sand: [['soft-bands', 'Soft sand bands'], ['golden-ripples', 'Golden ripples'], ['pale-dune', 'Pale dune'], ['crosswind-ripples', 'Crosswind ripples']],
  };
  const macroSpecs = Object.entries(macroVariants).flatMap(([family, variants], familyIndex) =>
    [[2, 2], [2, 3], [3, 3], [4, 3], [4, 4]].flatMap(([columns, rows], footprintIndex) => variants.map(([variantId, label], variantIndex) => {
      const id = `${family}-${variantId}-${columns}x${rows}`;
      return { id, kind: 'terrain-composite', label: `${label} ${columns}x${rows}`, sortOrder: familyIndex * 1000 + footprintIndex * 100 + variantIndex,
        lifecycleState: 'active' as const, behavior: { family, columns, rows, weight: 1, variantId }, metadata: {}, rowRevision: 1,
        media: { surface: descriptor(`test/macro/${id}.png`) } };
    })),
  );
  macroSpecs.push({
    id: 'sand-wind-ripples-4x3', kind: 'terrain-composite', label: 'Wind-rippled sand', sortOrder: 5999,
    lifecycleState: 'active' as const, behavior: { family: 'sand', columns: 4, rows: 3, weight: 1, variantId: 'sand-wind-ripples-4x3' },
    metadata: {}, rowRevision: 1, media: { surface: descriptor('test/macro/sand-wind-ripples-4x3.png') },
  });
  const structureSpecs = [
    ['oak', 'Oak tree art', 'tree', ['grass', 'dirt'], 96, 255, 1, 192, 300, 'props/oak'],
    ['cottage', 'Cottage art', 'house', ['grass', 'dirt', 'stone'], 91, 110, 0.62, 177, 184, 'props/cottage'],
    ['cabin', 'Log cabin art', 'house', ['grass', 'dirt', 'stone'], 118, 107, 0.35, 220, 176, 'props/cabin'],
    ['lodge', 'Green-roof house art', 'house', ['grass', 'dirt', 'stone'], 103, 126, 1, 210, 177, 'props/lodge'],
    ['rock', 'Rock art', 'rock', ['grass', 'dirt', 'stone', 'pebble', 'sand'], 20, 44, 1, 40, 45, 'props/rock'],
    ['fieldstone', 'Fieldstone art', 'rock', ['grass', 'dirt', 'stone', 'pebble', 'sand'], 25, 46, 1, 51, 47, 'props/fieldstone'],
    ['boulder', 'Boulder', 'doodad', ['stone'], 48, 69, 1, 96, 180, 'doodads/boulder'],
    ['stump', 'Tree stump', 'doodad', ['dirt'], 48, 69, 1, 96, 180, 'doodads/stump'],
    ['fern', 'Fern', 'doodad', ['water'], 48, 69, 1, 96, 180, 'doodads/fern'],
    ['flower', 'Flower', 'doodad', ['grass'], 48, 69, 1, 96, 180, 'doodads/flower'],
  ].map(([value, label, structureKind, terrains, anchorX, anchorY, scale, width, height, prefix], sortOrder) => ({
    id: `structure-${value}`, kind: 'structure', label: label as string, sortOrder, lifecycleState: 'active' as const,
    behavior: { value, structureKind, terrains, anchorX, anchorY, scale,
      ...(['oak', 'cottage', 'lodge'].includes(value as string) ? { footprint: { w: 2, h: 2 } } : ['cabin', 'rock', 'fieldstone'].includes(value as string) ? { footprint: { w: 1, h: 1 } } : {}),
      ...(['cottage', 'cabin', 'lodge', 'rock', 'fieldstone'].includes(value as string) ? { splitMode: 'flat-contact' } : {}),
      ...(['boulder'].includes(value as string) ? { propKind: 'rock' } : ['stump', 'fern', 'flower'].includes(value as string) ? { propKind: 'tree' } : {}) }, metadata: {}, rowRevision: 1,
    media: { back: descriptor(`${prefix}/back.png`, width as number, height as number), front: descriptor(`${prefix}/front.png`, width as number, height as number) },
  }));
  const coverWidths: Record<string, number[]> = {
    grass: [18, 22, 15, 20, 28, 22, 19, 16, 19, 24, 20, 14, 19, 23, 16, 23],
    sand: [18, 22, 15, 20, 28, 22, 19, 16, 19, 24, 20, 14, 19, 23, 16, 23],
    water: [29, 22, 30, 22, 28, 14, 28, 28],
  };
  const coverSpecs = Object.entries(coverWidths).map(([terrain, widths], sortOrder) => {
    const variants = widths.map((contentWidth, id) => ({ role: `v${id}`, terrain, id, frameWidth: 40, frameHeight: 37, frameCount: 6,
      baseX: terrain === 'water' && id === 0 ? 19 : (id === 3 || id === 15 ? 19 : id === 13 ? 21 : 20),
      baseY: terrain === 'water' ? 31 : id < 4 ? 28 : 27, contentWidth }));
    return { id: `ground-cover-${terrain}`, kind: 'ground-cover', label: terrain, sortOrder, lifecycleState: 'active' as const,
      behavior: { terrain, variants, ...(terrain === 'water' ? { edgeOnly: true, count: { sparse: 2, filled: 3 } } : terrain === 'sand' ? { count: { sparse: 2, filled: 4 } } : {}) },
      metadata: {}, rowRevision: 1,
      media: Object.fromEntries(variants.map(({ role, id }) => [role, descriptor(`test/groundcover/${terrain}/v${id}.png`, 240, 37)])) };
  });
  const mirrorSpecs = [
    ['test-mirror-keep', 'Keep Mirror', 36, 44, 'authored-crop',
      { west: { mountX: 17, mountY: 35, previewX: 42, previewY: 44, aperture: [0.241176, 0.295423, 0.758824, 0.155986, 0.758824, 0.67993, 0.241176, 0.819366] }, north: { mountX: 17, mountY: 35, previewX: 84, previewY: 44, aperture: [0.241176, 0.166549, 0.758824, 0.305986, 0.758824, 0.82993, 0.241176, 0.690493] } }],
    ['test-mirror-court-oval', 'Court Oval', 36, 44, 'authored-crop',
      { west: { mountX: 15, mountY: 27, previewX: 42, previewY: 44, aperture: [0.5, 0.263289, 0.766, 0.499978, 0.5, 0.812763, 0.234, 0.657478, 0.304, 0.402719] }, north: { mountX: 15, mountY: 28, previewX: 84, previewY: 44, aperture: [0.5, 0.274254, 0.766, 0.668443, 0.5, 0.823728, 0.234, 0.510943, 0.304, 0.297632] } }],
    ['test-mirror-chapel-glass', 'Chapel Glass', 36, 48, 'authored-crop',
      { west: { mountX: 16, mountY: 32, previewX: 42, previewY: 46, aperture: [0.5, 0.146458, 0.6375, 0.187639, 0.72, 0.280347, 0.72, 0.667569, 0.28, 0.777569, 0.28, 0.390347, 0.3625, 0.256389] }, north: { mountX: 16, mountY: 32, previewX: 84, previewY: 46, aperture: [0.5, 0.156875, 0.6375, 0.266806, 0.72, 0.400764, 0.72, 0.787986, 0.28, 0.677986, 0.28, 0.290764, 0.3625, 0.198056] } }],
    ['test-mirror-witch-eye', "Witch's Eye", 36, 36, 'authored-crop',
      { west: { mountX: 19, mountY: 19, previewX: 42, previewY: 42, aperture: [0.5, 0.193056, 0.787368, 0.308556, 0.698947, 0.527889, 0.5, 0.697056, 0.212632, 0.581556, 0.234737, 0.332556] }, north: { mountX: 19, mountY: 20, previewX: 84, previewY: 42, aperture: [0.5, 0.206944, 0.787368, 0.595444, 0.698947, 0.730778, 0.5, 0.710944, 0.212632, 0.322444, 0.234737, 0.426278] } }],
    ['test-mirror-grand-gallery', 'Grand Gallery Mirror', 108, 215, 'full-body',
      { west: { mountX: 119, mountY: 152, previewX: 42, previewY: 72, aperture: [0.043662, 0.327792, 0.956338, 0.024042, 0.956338, 0.668042, 0.043662, 0.971792] }, north: { mountX: 23, mountY: 152, previewX: 86, previewY: 72, aperture: [0.956338, 0.971792, 0.043662, 0.668042, 0.043662, 0.024042, 0.956338, 0.327792] } }],
  ].map(([id, label, mountX, mountY, mirrorCoverage, faces], sortOrder) => ({
    id: id as string, kind: 'wall-decor', label: label as string, sortOrder, lifecycleState: 'active' as const,
    behavior: { decorKind: 'mirror', mountX, mountY, mirrorCoverage, faces }, metadata: { kindLabel: 'Mirrors' }, rowRevision: 1,
    media: Object.fromEntries(['base', 'west', 'north', 'west-glass', 'north-glass'].map((role) => [role, descriptor(`test/wall-decor/${id}-${role}.png`, id === 'test-mirror-grand-gallery' ? 240 : 72, id === 'test-mirror-grand-gallery' ? 240 : 88)])),
  }));
  const staticDecorSpecs = [
    ['banner-tattered', 'Tattered Banner', 'banner', 36, 10, { west: { mountX: 13, mountY: 10, previewX: 42, previewY: 24 }, north: { mountX: 13, mountY: 11, previewX: 84, previewY: 24 } }, 'Banners'],
    ['relief-pawn', 'Pawn Relief', 'relief', 36, 36, { west: { mountX: 13, mountY: 29, previewX: 42, previewY: 42 }, north: { mountX: 13, mountY: 25, previewX: 84, previewY: 42 } }, 'Reliefs'],
    ['relief-rook', 'Rook Relief', 'relief', 36, 36, { west: { mountX: 20, mountY: 29, previewX: 42, previewY: 42 }, north: { mountX: 20, mountY: 29, previewX: 84, previewY: 42 } }, 'Reliefs'],
    ['lantern-brass', 'Brass Lantern', 'lantern', 28, 8, { west: { mountX: 8, mountY: 4, previewX: 42, previewY: 28 }, north: { mountX: 8, mountY: 5, previewX: 84, previewY: 28 } }, 'Lanterns'],
  ].map(([id, label, decorKind, mountX, mountY, faces, kindLabel], sortOrder) => ({
    id: id as string, kind: 'wall-decor', label: label as string, sortOrder: 100 + sortOrder, lifecycleState: 'active' as const,
    behavior: { decorKind, mountX, mountY, faces }, metadata: { kindLabel }, rowRevision: 1,
    media: Object.fromEntries(['base', 'west', 'north'].map((role) => [role, descriptor(`test/wall-decor/${id}-${role}.png`, role === 'base' ? 72 : 26, role === 'base' ? 96 : 84)])),
  }));
  const wallArtEntries = [
    { id: 'test-banner-pair', label: 'Test banner pair', span: 2, reflection: undefined, slots: [
      { id: 'test-banner-west', sourceId: 'banner-tattered', face: 'west', x: 42, y: 24, scale: 1 },
      { id: 'test-banner-north', sourceId: 'banner-tattered', face: 'north', x: 84, y: 24, scale: 1 },
    ] },
    ...mirrorSpecs.map((source) => ({
      id: `test-art-${source.id.replace(/^test-/, '')}`,
      label: `Test ${source.label}`,
      span: source.id === 'test-mirror-grand-gallery' ? 3 : 1,
      reflection: { opacity: 0.75 },
      slots: [
        { id: `${source.id}-west`, sourceId: source.id, face: 'west', x: 42, y: source.id === 'test-mirror-grand-gallery' ? 72 : 44, scale: 1 },
        { id: `${source.id}-north`, sourceId: source.id, face: 'north', x: source.id === 'test-mirror-grand-gallery' ? 86 : 84, y: source.id === 'test-mirror-grand-gallery' ? 72 : 44, scale: 1 },
      ],
    })),
  ];
  const wallArtSpecs = wallArtEntries.map(({ id, label, span, slots, reflection }, sortOrder) => ({
    id, kind: 'wall-art', label, sortOrder, lifecycleState: 'active' as const,
    behavior: { span, slots, ...(reflection ? { reflection } : {}) }, metadata: {}, rowRevision: 1, media: {},
  }));
  const surfaceSpecs = [
    ['hybrid-stone-blue', 'Hybrid · Stone Blue', 'hybrid', 'stone-blue'], ['hybrid-wood-oak', 'Hybrid · Oak', 'hybrid', 'wood-oak'],
    ['pixel-model-stone-blue', 'Pixel-model · Stone Blue', 'pixel-model', 'stone-blue'], ['baseline-stone-blue', 'Baseline · Stone Blue', 'baseline', 'stone-blue'],
    ['baseline-wood-oak', 'Baseline · Oak', 'baseline', 'wood-oak'], ['pixellab-stone-blue', 'PixelLab · Stone Blue', 'pixellab', 'stone-blue'],
  ].map(([value, label, approach, material], sortOrder) => ({ id: `ui-surface-${value}`, kind: 'ui-surface', label, sortOrder, lifecycleState: 'active' as const,
    behavior: { value, approach, material, tilePx: 1024 }, metadata: {}, rowRevision: 1,
    media: { surface: descriptor(`ui/surfaces/${value}.png`, 1024, 1024) } }));
  const sliderSpecs = [{ id: 'ui-slider-bronze-stone', kind: 'ui-slider', label: 'Bronze · Stone', sortOrder: 0, lifecycleState: 'active' as const,
    behavior: { value: 'bronze-stone', approach: 'css', material: 'bronze / stone', fill: '#c79b55', channel: '#26231e', edge: '#5a5248', handle: '#b88a45', handleLight: '#f0dba8', handleDark: '#5b4124', preferred: true },
    metadata: { description: 'Natural bronze and stone palette.' }, rowRevision: 1, media: {} }];
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-07-19T00:00:00.000Z',
    assets: [...ids.map((id, index) => ({
      id,
      kind: 'subterrain',
      label: `Test ${id}`,
      sortOrder: index,
      lifecycleState: 'active' as const,
      behavior: {},
      metadata: {},
      rowRevision: 1,
      media: {
        surface: descriptor(`test/subterrain/${id}.png`),
      },
    })), ...terrainSpecs, ...macroSpecs, ...structureSpecs, ...coverSpecs, ...mirrorSpecs, ...staticDecorSpecs, ...wallArtSpecs, ...surfaceSpecs, ...sliderSpecs, ...materialSpecs.map(([id, kind, value, label, isDefault, roles], index) => ({
      id, kind, label, sortOrder: index, lifecycleState: 'active' as const,
      behavior: { value, ...(isDefault ? { default: true } : {}) }, metadata: {}, rowRevision: 1,
      media: Object.fromEntries(roles.map((role) => [role, descriptor(`test/${id}-${role}.png`)])),
    }))],
  };
}

export function applyTestDrawableCatalog(ids?: readonly string[]): void {
  applyDrawableCatalog(testDrawableCatalog(ids));
  applyGroundCoverCatalog();
  applyWallDecorCatalog();
  applyWallArtCatalog();
}
