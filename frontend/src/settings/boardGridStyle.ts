import { appSettingsSnapshot, DEFAULT_APP_SETTINGS, subscribeAppSettings, type BoardGridStyle } from './appSettings';

export const BOARD_GRID_STYLE_ATTRIBUTE = 'data-board-grid-style';

/** Owner-facing name and one line of what the player is choosing between. */
export const BOARD_GRID_STYLE_LABELS: Readonly<Record<BoardGridStyle, { label: string; detail: string }>> = Object.freeze({
  chalk: { label: 'Chalk', detail: 'A light line that reads the same over grass, stone, and water.' },
  ink: { label: 'Ink', detail: 'A dark line that sits into the ground and softens in shadow.' },
  carved: { label: 'Carved', detail: 'A dark line lit from below, like a groove pressed into the ground.' },
  bold: { label: 'Bold', detail: 'The heaviest line, for reading squares at a glance.' },
  hairline: { label: 'Hairline', detail: 'A thin, faint line that stays out of the artwork’s way.' },
});

/**
 * Publish the chosen style to the document so CSS can select on it.
 *
 * The default style is the plain rule in style.css, so it is what a board draws before this ever
 * runs — during boot, with JavaScript still loading, or in any renderer that never calls this.
 * Only a non-default choice writes the attribute. Which style that is comes from
 * DEFAULT_APP_SETTINGS rather than a literal here, so changing the shipped style cannot leave this
 * writing an attribute the CSS fallbacks already draw.
 */
/** The part of an element this needs, so the rule can be proven without a DOM. */
export interface BoardGridStyleTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyBoardGridStyle(style: BoardGridStyle, target?: BoardGridStyleTarget): void {
  const root = target ?? (typeof document === 'undefined' ? undefined : document.documentElement);
  if (!root) return;
  if (style === DEFAULT_APP_SETTINGS.boardGridStyle) root.removeAttribute(BOARD_GRID_STYLE_ATTRIBUTE);
  else root.setAttribute(BOARD_GRID_STYLE_ATTRIBUTE, style);
}

/**
 * Keep the document in step with the setting for the life of the app.
 *
 * This is deliberately not tied to the Settings screen: the grid is drawn on battlefields the
 * player reaches without passing through Settings, and a choice that only took effect after a
 * visit there would look broken on a fresh load.
 */
export function initBoardGridStyle(): () => void {
  applyBoardGridStyle(appSettingsSnapshot().boardGridStyle);
  return subscribeAppSettings(() => applyBoardGridStyle(appSettingsSnapshot().boardGridStyle));
}
