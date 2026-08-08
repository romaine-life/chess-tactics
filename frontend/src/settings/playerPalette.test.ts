import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_PALETTE,
  OPPONENT_PALETTES,
  PLAYER_PALETTES,
  UNIT_PALETTES,
  paletteForSide,
  setPlayerPalette,
} from '../core/pieces';
import { PLAYER_PALETTE_LABELS } from './playerPalette';

afterEach(() => setPlayerPalette(DEFAULT_PLAYER_PALETTE));

describe('player palette', () => {
  it('dresses the player in white before anyone chooses', () => {
    expect(DEFAULT_PLAYER_PALETTE).toBe('white');
    expect(paletteForSide('player')).toBe('white');
  });

  it('answers for the player from the choice, over a level that authored a color', () => {
    // Every level saved through the editor stamps an explicit palette on its units, so an authored
    // value winning here would make the setting inert on exactly the boards it matters most on.
    setPlayerPalette('navy-blue');
    expect(paletteForSide('player', 'white')).toBe('navy-blue');
    expect(paletteForSide('player', 'crimson')).toBe('navy-blue');
    setPlayerPalette('white');
    expect(paletteForSide('player', 'navy-blue')).toBe('white');
  });

  it('keeps an opponent on its authored color', () => {
    setPlayerPalette('white');
    expect(paletteForSide('enemy', 'golden')).toBe('golden');
    expect(paletteForSide('enemy', 'emerald')).toBe('emerald');
    expect(paletteForSide('enemy')).toBe('crimson');
  });

  it('never lets an opponent render in the color the player is wearing', () => {
    // A level may author any faction as the CPU, including one of the two player colors. Whichever
    // the player picked, the opposing set falls back to the enemy default so the board stays legible.
    for (const palette of PLAYER_PALETTES) {
      setPlayerPalette(palette);
      expect(paletteForSide('enemy', palette)).toBe('crimson');
      expect(paletteForSide('enemy', palette)).not.toBe(paletteForSide('player'));
    }
  });

  it('splits the catalog into the two player colors and the opponents’ rest', () => {
    expect([...PLAYER_PALETTES]).toEqual(['white', 'navy-blue']);
    expect([...PLAYER_PALETTES, ...OPPONENT_PALETTES].sort()).toEqual([...UNIT_PALETTES].sort());
    for (const palette of OPPONENT_PALETTES) {
      expect(PLAYER_PALETTES as readonly string[]).not.toContain(palette);
    }
  });

  it('names every color it offers the player', () => {
    for (const palette of PLAYER_PALETTES) {
      const entry = PLAYER_PALETTE_LABELS[palette];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.detail.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PLAYER_PALETTE_LABELS).sort()).toEqual([...PLAYER_PALETTES].sort());
  });
});
