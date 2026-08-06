import { describe, expect, it } from 'vitest';
import { FOREST_ART_PRESETS, forestArtPresetEntries, forestPresetConfiguration, type ForestArtPresetAsset } from './forestArtPresets';

const catalog: ForestArtPresetAsset[] = [
  { id: 'oak', label: 'Oak tree art', kind: 'tree', propKind: 'tree' },
  { id: 'silver-tree', label: 'Silver Tree', kind: 'landmark' },
  // Some installed undergrowth uses propKind=tree for placement geometry; that must not make it a
  // literal tree in the All Trees starter.
  { id: 'fern', label: 'Fern', kind: 'doodad', propKind: 'tree' },
  { id: 'red-mushrooms', label: 'Red Mushrooms', kind: 'doodad' },
  { id: 'fallen-log', label: 'Fallen Log', kind: 'doodad' },
  { id: 'granite-boulder', label: 'Granite Boulder', kind: 'doodad', propKind: 'rock' },
  { id: 'standing-stone', label: 'Standing Stone', kind: 'rock' },
  { id: 'cactus', label: 'Cactus', kind: 'doodad' },
];

describe('Forest art presets', () => {
  it('offers the three named editable recipe starters', () => {
    expect(FOREST_ART_PRESETS.map((preset) => preset.label)).toEqual([
      'All Trees',
      'Lush Woodland',
      'Rocky Grove',
    ]);
  });

  it('makes All Trees literal rather than treating tree-seated undergrowth as trees', () => {
    expect(forestArtPresetEntries('all-trees', catalog)).toEqual([
      { sourceArtId: 'oak', weight: 1 },
      { sourceArtId: 'silver-tree', weight: 1 },
    ]);
  });

  it('makes Lush Woodland tree-dominant with soft understory and no stone or cactus', () => {
    expect(forestArtPresetEntries('lush-woodland', catalog)).toEqual([
      { sourceArtId: 'oak', weight: 4 },
      { sourceArtId: 'silver-tree', weight: 4 },
      { sourceArtId: 'fern', weight: 1 },
      { sourceArtId: 'red-mushrooms', weight: 1 },
      { sourceArtId: 'fallen-log', weight: 1 },
    ]);
  });

  it('makes Rocky Grove tree-dominant with stone accents and de-duplicates catalog ids', () => {
    expect(forestArtPresetEntries('rocky-grove', [...catalog, catalog[0]])).toEqual([
      { sourceArtId: 'oak', weight: 5 },
      { sourceArtId: 'silver-tree', weight: 5 },
      { sourceArtId: 'granite-boulder', weight: 1 },
      { sourceArtId: 'standing-stone', weight: 1 },
    ]);
  });

  it('expands rich presets into complete mixed and distinct Section collections', () => {
    const configured = forestPresetConfiguration('lush-woodland', catalog)!;
    expect(configured.sections).toHaveLength(3);
    expect(configured.sections.map((section) => section.relationship)).toEqual(['distinct', 'mixed', 'distinct']);
    expect(configured.sections[0]).toMatchObject({ density: 2.2, clumping: 0.65, spacing: 20 });
    expect(configured.sections[1].trees.map((entry) => entry.sourceArtId)).toEqual([
      'fern', 'red-mushrooms', 'fallen-log',
    ]);
    expect(configured).not.toHaveProperty('presetId');
  });

  it('keeps All Trees as a valid one-Section collection', () => {
    const configured = forestPresetConfiguration('all-trees', catalog)!;
    expect(configured.sections).toHaveLength(1);
    expect(configured.sections[0]).toMatchObject({
      relationship: 'distinct',
      trees: [
        { sourceArtId: 'oak', weight: 1 },
        { sourceArtId: 'silver-tree', weight: 1 },
      ],
    });
  });
});
