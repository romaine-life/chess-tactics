import { drawableAssets } from '@chess-tactics/board-render';

/**
 * The database-owned icon of one menu destination, keyed by the same
 * `behavior.value` slug the main-menu rail routes on.
 *
 * ONE lookup for the whole app: any rail that offers a menu destination reads its
 * mark HERE, so two surfaces cannot present the same destination under different
 * art. (The Strategikon's Enchiridion tab drew a borrowed level-editor glyph class
 * for exactly as long as this resolution lived inside MainMenu — same destination,
 * a different mark, and no shared declaration to contradict it.)
 */
export function menuModeIcon(slug: string): string {
  const asset = drawableAssets('menu-mode').find((candidate) => candidate.behavior.value === slug);
  const icon = asset?.media.icon?.media.immutableUrl;
  if (!icon) throw new Error(`menu mode ${slug} has no installed icon`);
  return icon;
}
