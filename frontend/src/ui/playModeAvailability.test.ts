import { describe, expect, it } from 'vitest';
import {
  PLAY_MODE_ENTRY_ENABLED,
  PLAY_SOURCE_RAIL_ENABLED,
  enabledPlayModeNames,
  playModeEntryEnabled,
} from './playModeAvailability';

describe('player-facing Play mode availability', () => {
  it('offers only Run and therefore needs no source rail', () => {
    expect(PLAY_MODE_ENTRY_ENABLED).toEqual({
      campaign: false,
      run: true,
      levels: false,
    });
    expect(playModeEntryEnabled('run')).toBe(true);
    expect(enabledPlayModeNames()).toBe('Run');
    expect(PLAY_SOURCE_RAIL_ENABLED).toBe(false);
  });
});
