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
      boardGridStyle: 'ink',
      autoDealDeployment: false,
      playerPalette: 'white',
      runCardBack: 'kings-position',
    });
  });

  it('falls back to the shipped card back when a stored one is no longer offered', () => {
    // A back that was retired from the offered set, or written by a build that named it something
    // else, must not survive normalization: its slot has no accepted media, so honouring it would
    // deal a face-down card with no picture on it.
    expect(normalizeAppSettings({ runCardBack: 'sovereign-seal' }).runCardBack)
      .toBe(DEFAULT_APP_SETTINGS.runCardBack);
    expect(normalizeAppSettings({ runCardBack: 42 }).runCardBack).toBe(DEFAULT_APP_SETTINGS.runCardBack);
    expect(normalizeAppSettings({ runCardBack: 'arcane-relic' }).runCardBack).toBe('arcane-relic');
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
    expect(DEFAULT_APP_SETTINGS.boardGridStyle).toBe('ink');
    for (const bad of ['neon', '', 'INK', 3, null, {}]) {
      expect(normalizeAppSettings({ boardGridStyle: bad }).boardGridStyle).toBe('ink');
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
