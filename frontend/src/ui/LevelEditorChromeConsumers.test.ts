import { describe, expect, it } from 'vitest';

import { adjacentLevelEditorLayer, type LevelEditorLayerOption } from './LevelEditorChromeConsumers';

const options = [
  { id: 'board', label: 'Board' },
  { id: 'tile', label: 'Tile', disabled: true },
  { id: 'generate', label: 'Generate' },
] as const satisfies readonly LevelEditorLayerOption[];

describe('Level Editor layer stepping', () => {
  it('wraps in both directions and skips disabled layers', () => {
    expect(adjacentLevelEditorLayer('board', options, 1)).toBe('generate');
    expect(adjacentLevelEditorLayer('generate', options, 1)).toBe('board');
    expect(adjacentLevelEditorLayer('board', options, -1)).toBe('generate');
    expect(adjacentLevelEditorLayer('generate', options, -1)).toBe('board');
  });

  it('returns null when no layer is enabled', () => {
    expect(adjacentLevelEditorLayer('board', options.map((option) => ({ ...option, disabled: true })), 1)).toBeNull();
  });
});
