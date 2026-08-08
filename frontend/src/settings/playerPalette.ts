import { setPlayerPalette, type PlayerPalette } from '../core/pieces';
import { appSettingsSnapshot, subscribeAppSettings, useAppSettings } from './appSettings';

/** Owner-facing name and one line of what the player is choosing between. */
export const PLAYER_PALETTE_LABELS: Readonly<Record<PlayerPalette, { label: string; detail: string }>> = Object.freeze({
  white: { label: 'White', detail: 'Pale stone, the way the first player is dressed on a chess board.' },
  'navy-blue': { label: 'Blue', detail: 'Deep navy, the darker of the two sets you can command.' },
});

/**
 * Keep the sprite resolvers in step with the setting for the life of the app.
 *
 * Deliberately not tied to the Settings screen, for the same reason as the board grid style: the
 * player's own pieces are drawn on battlefields reached without passing through Settings, and a
 * color that only took effect after a visit there would look broken on a fresh load.
 */
export function initPlayerPalette(): () => void {
  setPlayerPalette(appSettingsSnapshot().playerPalette);
  return subscribeAppSettings(() => setPlayerPalette(appSettingsSnapshot().playerPalette));
}

/**
 * The chosen palette, as a subscription.
 *
 * `paletteForSide` reads the same value from module state, which is what the canvas paint paths
 * need — but module state does not re-render React. A surface that draws the player's own pieces
 * calls this so changing the color repaints it, instead of waiting for an unrelated update.
 */
export function usePlayerPalette(): PlayerPalette {
  return useAppSettings().playerPalette;
}
