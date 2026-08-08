import { describe, expect, it } from 'vitest';
import { PLAYER_PALETTES } from '../core/pieces';
import { BOARD_GRID_STYLES, DEFAULT_APP_SETTINGS, normalizeAppSettings } from './appSettings';

describe('application settings', () => {
  it('losslessly adds gameplay preferences to an existing settings blob', () => {
    expect(normalizeAppSettings({
      uiScale: 110,
      masterAudio: false,
      musicVolume: 35,
      effectsVolume: 45,
      interfaceSounds: false,
    })).toEqual({
      uiScale: 110,
      masterAudio: false,
      musicVolume: 35,
      effectsVolume: 45,
      interfaceSounds: false,
      showBoardGrid: true,
      boardGridStyle: 'chalk',
      autoDealDeployment: false,
      playerPalette: 'white',
    });
  });

  it('normalizes invalid settings without changing the installed defaults', () => {
    expect(normalizeAppSettings({
      uiScale: 999,
      musicVolume: -20,
      effectsVolume: Number.NaN,
      showBoardGrid: false,
      autoDealDeployment: true,
    })).toEqual({
      ...DEFAULT_APP_SETTINGS,
      uiScale: 120,
      musicVolume: 0,
      showBoardGrid: false,
      autoDealDeployment: true,
    });
  });

  it('keeps the board grid on the shipped style unless a known one was chosen', () => {
    // The default is what a player sees before they ever open Settings, and it is the style the
    // game was designed around — an unreadable stored value must not quietly change the game's look.
    expect(DEFAULT_APP_SETTINGS.boardGridStyle).toBe('chalk');
    for (const bad of ['neon', '', 'CHALK', 3, null, {}]) {
      expect(normalizeAppSettings({ boardGridStyle: bad }).boardGridStyle).toBe('chalk');
    }
    for (const style of BOARD_GRID_STYLES) {
      expect(normalizeAppSettings({ boardGridStyle: style }).boardGridStyle).toBe(style);
    }
  });

  it('dresses the player in white unless they chose the other player palette', () => {
    expect(DEFAULT_APP_SETTINGS.playerPalette).toBe('white');
    for (const palette of PLAYER_PALETTES) {
      expect(normalizeAppSettings({ playerPalette: palette }).playerPalette).toBe(palette);
    }
    // An opponent color is not a choice a player may store, however it got into the blob — a
    // stored 'crimson' would put the player's own set into a color reserved for the enemy.
    for (const reserved of ['crimson', 'golden', 'emerald', 'black', 'White', '', 7, null, {}]) {
      expect(normalizeAppSettings({ playerPalette: reserved }).playerPalette).toBe('white');
    }
  });
});
