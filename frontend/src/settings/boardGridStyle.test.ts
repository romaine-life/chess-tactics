import { describe, expect, it } from 'vitest';
import { BOARD_GRID_STYLES } from './appSettings';
import {
  BOARD_GRID_STYLE_ATTRIBUTE,
  BOARD_GRID_STYLE_LABELS,
  applyBoardGridStyle,
} from './boardGridStyle';

describe('board grid style', () => {
  it('publishes a chosen style and leaves the shipped one implicit', () => {
    const attributes = new Map<string, string>();
    const root = {
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
    };

    // The default has NO attribute, so a board draws correctly during boot, before this module has
    // run, and in any renderer that never publishes a choice at all.
    applyBoardGridStyle('chalk', root);
    expect(attributes.has(BOARD_GRID_STYLE_ATTRIBUTE)).toBe(false);

    applyBoardGridStyle('carved', root);
    expect(attributes.get(BOARD_GRID_STYLE_ATTRIBUTE)).toBe('carved');

    // Switching styles replaces the value rather than stacking, so exactly one variant can match.
    applyBoardGridStyle('bold', root);
    expect(attributes.get(BOARD_GRID_STYLE_ATTRIBUTE)).toBe('bold');

    applyBoardGridStyle('chalk', root);
    expect(attributes.has(BOARD_GRID_STYLE_ATTRIBUTE)).toBe(false);
  });

  it('names every style it offers the player', () => {
    for (const style of BOARD_GRID_STYLES) {
      const entry = BOARD_GRID_STYLE_LABELS[style];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.detail.length).toBeGreaterThan(0);
    }
    expect(Object.keys(BOARD_GRID_STYLE_LABELS).sort()).toEqual([...BOARD_GRID_STYLES].sort());
  });
});
