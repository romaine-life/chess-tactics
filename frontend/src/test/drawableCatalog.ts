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
      media: { top: descriptor(`test/terrain/${family}-${variant}-top.png`), source: descriptor(`test/terrain/${family}-${variant}-source.png`) },
    })),
  );
  const terrainFamilySpecs: DrawableCatalog['assets'] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'].map((family, sortOrder) => ({
    id: `terrain-family-${family}`, kind: 'terrain-family', label: family[0].toUpperCase() + family.slice(1), sortOrder,
    lifecycleState: 'active', behavior: {
      value: family,
      gameplayTerrain: family,
      rendersGameplayTerrains: family === 'stone' ? ['stone', 'road', 'bridge', 'cliff', 'rock'] : [family],
      roles: [
        'level-editor-scatter',
        ...(['grass', 'dirt', 'stone'].includes(family) ? ['prop-seat-preview', 'wall-art-preview'] : []),
        ...(['grass', 'stone', 'water'].includes(family) ? ['unit-art-preview'] : []),
        ...(family === 'grass' ? ['prop-seat-preview-default', 'unit-art-preview-default'] : []),
        ...(family === 'stone' ? ['wall-art-preview-default'] : []),
      ],
      ...(family === 'grass' ? { default: true, scatterDefaultShare: 60, defaultGroundCoverId: 'grass' } : {}),
      ...(family === 'stone' ? { scatterDefaultShare: 40 } : {}),
      ...(family === 'sand' || family === 'water' ? { defaultGroundCoverId: family } : {}),
    }, metadata: {}, rowRevision: 1, media: {},
  }));
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
    behavior: { value, structureKind, terrains, anchorX, anchorY, scale, default: value === 'boulder',
      blocking: structureKind !== 'doodad', splitMode: ['cottage', 'cabin', 'lodge', 'rock', 'fieldstone'].includes(value as string) ? 'flat-contact' : 'authored',
      ...(['oak', 'cottage', 'lodge'].includes(value as string) ? { footprint: { w: 2, h: 2 } } : ['cabin', 'rock', 'fieldstone'].includes(value as string) ? { footprint: { w: 1, h: 1 } } : {}),
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
      behavior: { terrain, variants, edgeOnly: terrain === 'water', count: terrain === 'water' ? { sparse: 2, filled: 3 } : terrain === 'sand' ? { sparse: 2, filled: 4 } : { sparse: 3, filled: 7 } },
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
    behavior: { decorKind, mountX, mountY, faces, default: id === 'banner-tattered' }, metadata: { kindLabel }, rowRevision: 1,
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
    behavior: { span, slots, default: id === 'test-banner-pair', ...(reflection ? { reflection } : {}) }, metadata: {}, rowRevision: 1, media: {},
  }));
  const presentationSpecs: DrawableCatalog['assets'] = [
    {
      id: 'test-background-set', kind: 'background-set', label: 'Test background', sortOrder: 0,
      lifecycleState: 'active' as const, behavior: { default: true }, metadata: {}, rowRevision: 1,
      media: Object.fromEntries(['world', ...['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].map((piece) => `portrait-${piece}`)]
        .map((role) => [role, descriptor(`test/background/${role}.png`, 320, 180)])),
    },
    ...['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].map((piece, sortOrder) => ({
      id: `test-portrait-${piece}`, kind: 'unit-portrait', label: `Test ${piece} portraits`, sortOrder,
      lifecycleState: 'active' as const, behavior: { piece, crop: { cx: 0.5, cy: 0.3, s: 0.5 } }, metadata: {}, rowRevision: 1,
      media: Object.fromEntries(['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white']
        .map((palette) => [palette, descriptor(`test/portrait/${piece}-${palette}.png`, 96, 96)])),
    })),
    ...['test-neutral-stone-a', 'test-neutral-stone-b'].map((id, sortOrder) => ({
      id, kind: 'neutral-unit-art', label: `Test neutral stone ${sortOrder + 1}`, sortOrder,
      lifecycleState: 'active' as const, behavior: {}, metadata: {}, rowRevision: 1,
      media: Object.fromEntries(['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']
        .map((direction) => [direction, descriptor(`test/neutral/${id}-${direction}.png`, 64, 64)])),
    })),
    { id: 'test-homepage-scene', kind: 'animated-scene', label: 'Test homepage scene', sortOrder: 0,
      lifecycleState: 'active' as const, behavior: { roles: ['homepage-scene'], width: 320, height: 180 }, metadata: {}, rowRevision: 1,
      media: { background: descriptor('test/scene/background.png', 320, 180) } },
    { id: 'test-waterfall', kind: 'scene-animation', label: 'Test waterfall', sortOrder: 0,
      lifecycleState: 'active' as const, behavior: { default: true, sceneRole: 'homepage-scene', x: 10, y: 20, width: 40, height: 50, frames: 12, frameMs: 140 }, metadata: {}, rowRevision: 1,
      media: { sheet: descriptor('test/scene/waterfall.png', 480, 50) } },
  ];
  const terrainReviewSpecs: DrawableCatalog['assets'] = [
    { id: 'test-terrain-review', kind: 'terrain-review', label: 'Test terrain review', sortOrder: 0, lifecycleState: 'active' as const,
      behavior: { family: 'grass', role: 'variant' }, metadata: { method: 'Synthetic', status: 'Test-only' }, rowRevision: 1,
      media: { preview: descriptor('test/terrain/review.png') } },
    { id: 'test-terrain-comparison', kind: 'terrain-comparison', label: 'Test terrain comparison', sortOrder: 0, lifecycleState: 'active' as const,
      behavior: { family: 'grass', variant: 0 }, metadata: {}, rowRevision: 1,
      media: { raw: descriptor('test/terrain/raw.png'), processed: descriptor('test/terrain/processed.png') } },
  ];
  const portraitTreatmentSpecs = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].map((piece, sortOrder) => ({
    id: `test-portrait-treatment-${piece}`, kind: 'portrait-treatment', label: `Test ${piece} treatment`, sortOrder,
    lifecycleState: 'active' as const, behavior: { piece, method: 'test-treatment', defaultPalette: 'navy-blue', default: true },
    metadata: { methodLabel: 'Test treatment', methodDescription: 'Synthetic portrait treatment' }, rowRevision: 1,
    media: Object.fromEntries(['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white']
      .map((palette) => [palette, descriptor(`test/portrait-treatment/${piece}-${palette}.png`, 96, 96)])),
  }));
  const appUiRoles = [
    'og-default',
    'ui-main-menu-background-scene-v1-avif',
    'ui-kit-icons-brand-shield-png',
    'ui-surfaces-baseline-stone-blue-avif',
    'ui-surfaces-hybrid-wood-oak-png',
    'ui-main-menu-icons-carved-settings-png',
    'ui-main-menu-icons-carved-solo-skirmish-png',
    'ui-main-menu-icons-carved-campaign-editor-png',
    'ui-main-menu-icons-carved-lobbies-png',
    'ui-kit-icons-gear-png',
    'ui-kit-icons-speaker-png',
    'ui-kit-icons-knight-png',
    'ui-kit-icons-wrench-png',
    'ui-kit-icons-music-png',
    'ui-kit-icons-chevron-up-png',
    'ui-kit-icons-chevron-down-png',
    'ui-kit-icons-delete-png',
    'ui-kit-icons-lock-png',
    'ui-kit-icons-pencil-png',
    'ui-kit-icons-save-png',
    'ui-kit-icons-sign-in-png',
    'ui-kit-icons-sign-out-png',
    'ui-kit-icons-studio-catalog-png',
    'ui-kit-icons-studio-lab-png',
    'ui-kit-icons-studio-viewer-png',
    'ui-main-menu-profile-rook-blue-png',
    'ui-main-menu-profile-rook-red-png',
    'ui-pages-main-menu-webp',
    'ui-pages-settings-webp',
    'ui-pages-skirmish-webp',
    'ui-pages-campaign-editor-webp',
    'ui-pages-level-editor-webp',
    'ui-pages-lobbies-webp',
    'ui-kit-button-primary-png',
    'ui-kit-button-neutral-png',
    'ui-kit-button-danger-png',
    'ui-kit-panel-png',
    'ui-kit-row-png',
    'ui-kit-field-input-png',
  ];
  const appUiSpecs: DrawableCatalog['assets'] = [{
    id: 'app-ui', kind: 'app-ui', label: 'Test application UI', sortOrder: 0,
    lifecycleState: 'active', behavior: { roles: ['application-ui'], requiredRoles: appUiRoles }, metadata: {}, rowRevision: 1,
    media: Object.fromEntries(appUiRoles.map((role) => [role, descriptor(`test/app-ui/${role}.png`)])),
  }, {
    id: 'test-app-font', kind: 'app-font', label: 'Test application font', sortOrder: 0,
    lifecycleState: 'active', behavior: { family: 'Test UI', style: 'normal', weight: 400, display: 'swap', format: 'woff2' },
    metadata: {}, rowRevision: 1, media: { font: descriptor('test/app-font/font.woff2') },
  }, {
    id: 'installed-chrome', kind: 'chrome-family', label: 'Test installed Chrome', sortOrder: 0,
    lifecycleState: 'active', behavior: { roles: ['installed-chrome'],
      outer: { atomSourceId: 'test/chrome/outer-atom.png', railSourceId: 'test/chrome/outer-rail.png', atomTurns: 0, atomSize: 41, railThickness: 24, atomX: -2, atomY: -2, atomLeftX: 0, atomRightX: 0, atomTopY: 0, atomBottomY: 0, railUnderlap: 14, railFit: 'stretch', fillMode: 'surface', fillTintId: 'blue', fillSurfaceId: 'baseline-stone-blue', fillSurfaceScale: 768, fillBoxLeft: 2, fillBoxRight: 2, fillBoxTop: 0, fillBoxBottom: 0, contentPadding: 31, fillAlpha: 0, atomAlignMode: 'manual', atomAnchorX: 18, atomAnchorY: 18, atomCoverX: 18, atomCoverY: 18, atomPreviewMode: 'live', titleTextX: -7, titleTextY: 12, titleFontSize: 26, titleVerticalAlign: 'center', titleHorizontalAlign: 'content-inset' },
      inner: { atomSourceId: 'test/chrome/inner-atom.png', railSourceId: 'test/chrome/inner-rail.png', atomTurns: 1, atomSize: 11, railThickness: 7, atomX: -3, atomY: -8, atomLeftX: -5, atomRightX: -4, atomTopY: 0, atomBottomY: 0, railUnderlap: 8, railFit: 'tile', fillMode: 'tint', fillTintId: 'night', fillSurfaceId: 'hybrid-stone-blue', fillSurfaceScale: 384, fillBoxLeft: 0, fillBoxRight: 0, fillBoxTop: 0, fillBoxBottom: 0, contentPadding: 0, fillAlpha: 0.82, atomAlignMode: 'manual', atomAnchorX: 6, atomAnchorY: 6, atomCoverX: 6, atomCoverY: 6, atomPreviewMode: 'live' },
      dividers: {
        outer: { atomSourceId: 'test/chrome/divider-joint.png', atomTurns: 0, atomSize: 32, bandHeight: 34, atomX: 11, atomY: 0, atomLeftX: 0, atomRightX: 1, atomLeftY: 0, atomRightY: 0, atomAlignMode: 'rail-center', atomAnchorX: 9, atomAnchorY: 9, atomCoverX: 9, atomCoverY: 9, atomPreviewMode: 'live' },
        inner: { atomSourceId: 'test/chrome/divider-joint.png', atomTurns: 0, atomSize: 11, bandHeight: 7, atomX: 3.5, atomY: 0, atomLeftX: -0.5, atomRightX: 0, atomLeftY: 0, atomRightY: 0, atomAlignMode: 'rail-center', atomAnchorX: 6, atomAnchorY: 6, atomCoverX: 6, atomCoverY: 6, atomPreviewMode: 'live' },
      },
    }, metadata: {}, rowRevision: 1,
    media: {
      'outer-atom': descriptor('test/chrome/outer-atom.png', 32, 32),
      'outer-rail': descriptor('test/chrome/outer-rail.png', 64, 24),
      'inner-atom': descriptor('test/chrome/inner-atom.png', 16, 16),
      'inner-rail': descriptor('test/chrome/inner-rail.png', 16, 7),
      'divider-joint': descriptor('test/chrome/divider-joint.png', 32, 32),
    },
  }, {
    id: 'test-artwork-reference', kind: 'artwork-reference', label: 'Test artwork reference', sortOrder: 0,
    lifecycleState: 'active', behavior: { route: '/' }, metadata: {}, rowRevision: 1,
    media: { concept: descriptor('test/artwork/concept.png', 1440, 900) },
  }];
  const testNineSliceGeometry = { coolCorners: { tl: { dx: 0, dy: 0 }, tr: { dx: 0, dy: 0 }, bl: { dx: 0, dy: 0 }, br: { dx: 0, dy: 0 } }, pipes: { top: 0, bottom: 0, left: 0, right: 0 }, frameScale: 1, brackets: { tl: { dx: 0, dy: 0 }, tr: { dx: 0, dy: 0 }, bl: { dx: 0, dy: 0 }, br: { dx: 0, dy: 0 } }, bracketScale: 1, content: 8, fill: 4 };
  const nineSliceSpecs: DrawableCatalog['assets'] = [
    ...['panel', 'mode-button'].map((id, sortOrder) => ({
      id, kind: 'nine-slice', label: `Test ${id}`, sortOrder, lifecycleState: 'active' as const,
      behavior: { kind: 'frame', carve: false, flipSides: false, roles: id === 'mode-button' ? ['frame-editor-default', 'settings-tab'] : ['settings-panel'], frame: { w: 96, h: 96 }, geometry: testNineSliceGeometry }, metadata: {}, rowRevision: 1,
      media: { corner: descriptor(`test/nine-slice/${id}-corner.png`, 24, 24), edge: descriptor(`test/nine-slice/${id}-edge.png`, 24, 8), fill: descriptor(`test/nine-slice/${id}-fill.png`, 8, 8), target: descriptor(`test/nine-slice/${id}.png`, 96, 96) },
    })),
    { id: 'panel-divider', kind: 'nine-slice', label: 'Test divider', sortOrder: 2, lifecycleState: 'active' as const,
      behavior: { kind: 'bar', carve: false, flipSides: false, roles: ['divider-editor-default'], frame: { w: 96, h: 24 }, railSource: 'edge', railFit: 'tile', geometry: { frameWidth: 16, reach: 14, dividerH: 34, scale: 1, count: 3, backing: 'fill', jx: 0, jy: 0 } }, metadata: {}, rowRevision: 1,
      media: { edge: descriptor('test/nine-slice/divider-edge.png', 24, 8), tee: descriptor('test/nine-slice/divider-tee.png', 24, 24), 'panel-line': descriptor('test/nine-slice/panel-line.png', 96, 96), 'host-frame': descriptor('test/nine-slice/panel.png', 96, 96), 'host-line': descriptor('test/nine-slice/panel-line.png', 96, 96) } },
  ];
  const scrollbarSpecs: DrawableCatalog['assets'] = [
    ['oak-forge', 'Oak Forge', 'sprite'],
    ['oak-pixellab', 'Oak Pixellab', 'sprite'],
    ['oak-pixelated', 'Oak Pixelated', 'texture'],
    ['oak-raw', 'Oak Raw', 'texture'],
  ].map(([id, label, previewKind], sortOrder) => ({
    id, kind: 'ui-scrollbar', label, sortOrder, lifecycleState: 'active' as const,
    behavior: { previewKind, roles: id === 'oak-pixellab' ? ['installed-scrollbar'] : [] }, metadata: {}, rowRevision: 1,
    media: { preview: descriptor(`test/ui-scrollbars/${id}.png`, 24, 72) },
  }));
  const surfaceSpecs = [
    ['hybrid-stone-blue', 'Hybrid · Stone Blue', 'hybrid', 'stone-blue'], ['hybrid-wood-oak', 'Hybrid · Oak', 'hybrid', 'wood-oak'],
    ['pixel-model-stone-blue', 'Pixel-model · Stone Blue', 'pixel-model', 'stone-blue'], ['baseline-stone-blue', 'Baseline · Stone Blue', 'baseline', 'stone-blue'],
    ['baseline-wood-oak', 'Baseline · Oak', 'baseline', 'wood-oak'], ['pixellab-stone-blue', 'PixelLab · Stone Blue', 'pixellab', 'stone-blue'],
  ].map(([value, label, approach, material], sortOrder) => ({ id: `ui-surface-${value}`, kind: 'ui-surface', label, sortOrder, lifecycleState: 'active' as const,
    behavior: { value, approach, material, tilePx: 1024, default: value === 'hybrid-stone-blue' }, metadata: {}, rowRevision: 1,
    media: { surface: descriptor(`ui/surfaces/${value}.png`, 1024, 1024) } }));
  const sliderSpecs = [{ id: 'ui-slider-bronze-stone', kind: 'ui-slider', label: 'Bronze · Stone', sortOrder: 0, lifecycleState: 'active' as const,
    behavior: { value: 'bronze-stone', approach: 'css', material: 'bronze / stone', fill: '#c79b55', channel: '#26231e', edge: '#5a5248', handle: '#b88a45', handleLight: '#f0dba8', handleDark: '#5b4124', preferred: true },
    metadata: { description: 'Natural bronze and stone palette.' }, rowRevision: 1, media: {} }];
  const chromeFillTintSpecs: DrawableCatalog['assets'] = [
    ['night', 'Night', [4, 13, 20]], ['blue', 'Deep blue', [5, 24, 42]],
  ].map(([value, label, rgb], sortOrder) => ({ id: `chrome-fill-${value}`, kind: 'chrome-fill-tint', label: String(label), sortOrder,
    lifecycleState: 'active' as const, behavior: { value, rgb }, metadata: {}, rowRevision: 1, media: {} }));
  const uiKitFrameSpecs: DrawableCatalog['assets'] = ['primary', 'neutral', 'danger', 'panel', 'row', 'field-input'].map((value, sortOrder) => ({
    id: `ui-kit-frame-${value}`, kind: 'ui-kit-frame', label: value, sortOrder, lifecycleState: 'active', behavior: { value }, metadata: {}, rowRevision: 1,
    media: { frame: descriptor(`test/ui-kit/${value}.png`, 72, 72) },
  }));
  const studioPageSpecs: DrawableCatalog['assets'] = [
    ['main-menu', 'Main Menu', '/', 'functional'], ['settings', 'Settings', '/settings', 'functional'], ['skirmish', 'Skirmish', '/play', 'stub'],
    ['campaign-editor', 'Editor', '/editor', 'functional'], ['level-editor', 'Level Editor', '/editor/level', 'stub'], ['lobbies', 'Lobbies', '/lobbies', 'stub'],
  ].map(([value, label, route, viewerStatus], sortOrder) => ({ id: `studio-page-${value}`, kind: 'studio-page', label, sortOrder, lifecycleState: 'active',
    behavior: { value, route, viewerStatus, default: value === 'main-menu', ...(value === 'level-editor' ? { roles: ['chrome-lab-page'], chromeLabRoute: '/editor/level?chromeLab=1' } : {}) },
    metadata: { blurb: `Test ${label}`, ...(value === 'level-editor' ? { chromeLabBadge: 'outer + inner chrome' } : {}) }, rowRevision: 1, media: { thumbnail: descriptor(`test/pages/${value}.webp`, 640, 400) } }));
  const menuModeSpecs: DrawableCatalog['assets'] = [
    ['play', 'Play', '/play', 'ui-main-menu-icons-carved-solo-skirmish-png'], ['campaign-editor', 'Editor', '/editor', 'ui-main-menu-icons-carved-campaign-editor-png'],
    ['lobbies', 'Lobbies', '/lobbies', 'ui-main-menu-icons-carved-lobbies-png'], ['settings', 'Settings', '/settings', 'ui-main-menu-icons-carved-settings-png'],
  ].map(([value, label, route, iconRole], sortOrder) => ({ id: `menu-mode-${value}`, kind: 'menu-mode', label, sortOrder, lifecycleState: 'active',
    behavior: { value, route, ...(value === 'settings' ? { roles: ['settings'] } : {}) }, metadata: {}, rowRevision: 1, media: { icon: descriptor(`test/menu/${iconRole}.png`, 64, 64) } }));
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
      behavior: { default: id === ids[0] },
      metadata: {},
      rowRevision: 1,
      media: {
        surface: descriptor(`test/subterrain/${id}.png`),
      },
    })), ...terrainFamilySpecs, ...terrainSpecs, ...terrainReviewSpecs, ...macroSpecs, ...structureSpecs, ...coverSpecs, ...mirrorSpecs, ...staticDecorSpecs, ...wallArtSpecs, ...presentationSpecs, ...portraitTreatmentSpecs, ...appUiSpecs, ...nineSliceSpecs, ...scrollbarSpecs, ...surfaceSpecs, ...sliderSpecs, ...chromeFillTintSpecs, ...uiKitFrameSpecs, ...studioPageSpecs, ...menuModeSpecs, ...materialSpecs.map(([id, kind, value, label, isDefault, roles], index) => ({
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
