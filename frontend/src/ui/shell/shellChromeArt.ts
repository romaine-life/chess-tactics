import { requiredDrawableRole } from '@chess-tactics/board-render';
import { loadDecodedImage } from '../../render/imageResources';
import { installedUiMedia } from '../installedUiMedia';

/**
 * The art the PERSISTENT shell paints — the title bar's brand mark and the marks in its
 * always-on trailing cluster.
 *
 * This is a startup PRECONDITION, not a per-scene readiness contract (ADR-0369). The bar
 * outlives every scene and paints the same marks on every route, so there is no per-scene
 * variance to model: `main.tsx` decodes these once, before App is imported, and an
 * unfinished bar stops being something to gate against and becomes unreachable.
 *
 * The bar's SURFACES are not listed here. They are referenced by the composed chrome CSS,
 * which is complete by construction — `composeInstalledChromeCss` decodes everything its
 * own output references — so adding a surface there cannot slip outside the guarantee.
 *
 * Read at call time, never at module scope: the drawable catalog and live media must
 * already be installed, which is exactly the ordering `main.tsx` establishes.
 */
export function shellChromeArtUrls(): string[] {
  const settingsIcon = requiredDrawableRole('menu-mode', 'settings').media.icon?.media.immutableUrl;
  if (!settingsIcon) throw new Error('installed Settings menu mode has no icon');
  return [
    installedUiMedia('ui-kit-icons-brand-shield-png'),
    installedUiMedia('ui-kit-icons-sign-in-png'),
    installedUiMedia('ui-kit-icons-music-png'),
    settingsIcon,
  ];
}

/** Decode every mark the persistent bar paints. Shares the runtime's decoded-image record. */
export async function decodeShellChromeArt(): Promise<void> {
  await Promise.all(shellChromeArtUrls().map((url) => loadDecodedImage(url)));
}
