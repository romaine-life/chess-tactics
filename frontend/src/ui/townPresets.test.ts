import { describe, expect, it } from 'vitest';
import { TOWN_PRESETS, townPresetConfiguration } from './townPresets';

const assets = [
  { id: 'cottage', label: 'Cottage', kind: 'house' },
  { id: 'log-cabin', label: 'Log Cabin', kind: 'house' },
  { id: 'windmill', label: 'Windmill', kind: 'house' },
  { id: 'castle-keep', label: 'Castle Keep', kind: 'house' },
  { id: 'oak-tree', label: 'Oak Tree', kind: 'tree' },
];

describe('Town approach presets', () => {
  it('offers three container-level Section collections', () => {
    expect(TOWN_PRESETS.map((preset) => preset.label)).toEqual([
      'Village Hamlet', 'Mill Village', 'Castle Borough',
    ]);
  });

  it('materializes complete editable Sections with their own Plans and relationships', () => {
    const village = townPresetConfiguration('village-hamlet', assets)!;
    expect(village.sections).toHaveLength(2);
    expect(village.sections.map((section) => section.relationship)).toEqual(['distinct', 'mixed']);
    expect(village.sections).toEqual([
      expect.objectContaining({ plan: 'green', size: 8, setback: 70, fit: 'shrink' }),
      expect.objectContaining({ plan: 'cluster', size: 5, looseness: 0.6 }),
    ]);
    expect(village.sections[0].buildings).toEqual([
      { sourceArtId: 'cottage', weight: 1 },
      { sourceArtId: 'log-cabin', weight: 1 },
    ]);

    const mill = townPresetConfiguration('mill-village', assets)!;
    expect(mill.sections).toHaveLength(2);
    expect(mill.sections[1]).toMatchObject({ relationship: 'mixed', plan: 'linear' });
    expect(mill.sections[1].buildings).toEqual([{ sourceArtId: 'windmill', weight: 4 }]);

    const castle = townPresetConfiguration('castle-borough', assets)!;
    expect(castle.sections).toHaveLength(2);
    expect(castle.sections[0].buildings).toEqual([{ sourceArtId: 'castle-keep', weight: 4 }]);
  });

  it('requires the specialized art that defines mill and castle approaches', () => {
    const homesOnly = assets.filter((asset) => !asset.id.includes('mill') && !asset.id.includes('castle'));
    expect(townPresetConfiguration('village-hamlet', homesOnly)).not.toBeNull();
    expect(townPresetConfiguration('mill-village', homesOnly)).toBeNull();
    expect(townPresetConfiguration('castle-borough', homesOnly)).toBeNull();
  });

  it('returns concrete collections without persisting a preset identity', () => {
    const configured = townPresetConfiguration('mill-village', assets)!;
    expect(configured).not.toHaveProperty('presetId');
    expect(configured.sections.every((section) => section.relationship === 'distinct' || section.relationship === 'mixed')).toBe(true);
  });
});
