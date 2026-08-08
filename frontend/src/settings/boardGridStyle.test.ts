import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_GRID_STYLES, DEFAULT_APP_SETTINGS } from './appSettings';
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
    applyBoardGridStyle(DEFAULT_APP_SETTINGS.boardGridStyle, root);
    expect(attributes.has(BOARD_GRID_STYLE_ATTRIBUTE)).toBe(false);

    applyBoardGridStyle('carved', root);
    expect(attributes.get(BOARD_GRID_STYLE_ATTRIBUTE)).toBe('carved');

    // Switching styles replaces the value rather than stacking, so exactly one variant can match.
    applyBoardGridStyle('bold', root);
    expect(attributes.get(BOARD_GRID_STYLE_ATTRIBUTE)).toBe('bold');

    applyBoardGridStyle(DEFAULT_APP_SETTINGS.boardGridStyle, root);
    expect(attributes.has(BOARD_GRID_STYLE_ATTRIBUTE)).toBe(false);

    // Every other style must still publish, including the one that used to be shipped.
    for (const style of BOARD_GRID_STYLES.filter((s) => s !== DEFAULT_APP_SETTINGS.boardGridStyle)) {
      applyBoardGridStyle(style, root);
      expect(attributes.get(BOARD_GRID_STYLE_ATTRIBUTE)).toBe(style);
    }
  });

  // The CSS fallbacks draw before any attribute exists, so they must BE the shipped style. When
  // they disagree, a board boots on one grid and settles onto another.
  it('draws the shipped style with no attribute present', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const shipped = new RegExp(
      `\\[data-board-grid-style='${DEFAULT_APP_SETTINGS.boardGridStyle}'\\]\\s*\\{([^}]*)\\}`,
    ).exec(styles);
    const declared = Object.fromEntries(
      [...(shipped?.[1] ?? '').matchAll(/--board-grid-(bevel|stroke|weight):\s*([^;]+);/g)]
        .map(([, name, value]) => [name, value.trim()]),
    );
    expect(Object.keys(declared).sort()).toEqual(['bevel', 'stroke', 'weight']);
    for (const rule of [
      /\.tileset-board-grid-layer path\s*\{([^}]*)\}/,
      /\.board-grid-style-swatch-board \.tileset-board-grid-layer path\s*\{([^}]*)\}/,
    ]) {
      const body = rule.exec(styles)?.[1] ?? '';
      for (const [name, value] of Object.entries(declared)) {
        expect(body).toContain(`var(--board-grid-${name}, ${value})`);
      }
    }
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
