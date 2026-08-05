import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from './appSettings';

describe('application settings', () => {
  it('losslessly adds the Deployment auto-deal preference to the existing settings blob', () => {
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
      autoDealDeployment: false,
    });
  });

  it('normalizes invalid settings without changing the installed defaults', () => {
    expect(normalizeAppSettings({
      uiScale: 999,
      musicVolume: -20,
      effectsVolume: Number.NaN,
      autoDealDeployment: true,
    })).toEqual({
      ...DEFAULT_APP_SETTINGS,
      uiScale: 120,
      musicVolume: 0,
      autoDealDeployment: true,
    });
  });
});
