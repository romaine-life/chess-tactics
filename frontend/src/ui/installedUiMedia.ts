import { drawableAssets, requiredDrawableRole } from '@chess-tactics/board-render';

const installed = () => requiredDrawableRole('app-ui', 'application-ui');

export function installedUiMedia(role: string): string {
  const media = installed().media[role]?.media;
  if (!media) throw new Error(`application UI media role "${role}" is unavailable`);
  return media.immutableUrl;
}

/** CSS contains only semantic role variables. The DB projection owns which live
 * media slot satisfies each role and this installs immutable URLs atomically
 * before the application component tree is imported. */
export function installUiMediaCssVariables(): void {
  const requiredRoles = installed().behavior.requiredRoles;
  if (!Array.isArray(requiredRoles) || requiredRoles.some((role) => typeof role !== 'string')) {
    throw new Error('application UI required media roles are unavailable');
  }
  for (const role of requiredRoles) installedUiMedia(role);
  const style = document.documentElement.style;
  for (const [role, binding] of Object.entries(installed().media)) {
    style.setProperty(`--media-${role}`, `url("${binding.media.immutableUrl}")`);
  }
  const scrollbar = requiredDrawableRole('ui-scrollbar', 'installed-scrollbar').media.preview?.media.immutableUrl;
  if (!scrollbar) throw new Error('installed UI scrollbar media is unavailable');
  style.setProperty('--media-ui-scrollbar-installed', `url("${scrollbar}")`);
}

/** Font faces are installed records too: Postgres owns both their descriptors
 * and the media assignment, while this code only applies the browser protocol. */
export function installUiFonts(): void {
  const faces = drawableAssets('app-font');
  if (!faces.length) throw new Error('application font catalog is unavailable');
  const rules = faces.map((face) => {
    const { family, style, weight, display, unicodeRange, format } = face.behavior;
    if (typeof family !== 'string' || typeof style !== 'string'
      || (typeof weight !== 'string' && typeof weight !== 'number')
      || typeof display !== 'string' || typeof format !== 'string') {
      throw new Error(`application font ${face.id} has invalid behavior`);
    }
    const media = face.media.font?.media;
    if (!media) throw new Error(`application font ${face.id} has no font media`);
    const range = typeof unicodeRange === 'string' ? `unicode-range:${unicodeRange};` : '';
    return `@font-face{font-family:${JSON.stringify(family)};font-style:${style};font-weight:${weight};font-display:${display};src:url(${JSON.stringify(media.immutableUrl)}) format(${JSON.stringify(format)});${range}}`;
  });
  const element = document.createElement('style');
  element.dataset.installedFonts = 'database';
  element.textContent = rules.join('\n');
  document.head.appendChild(element);
}

export function installNineSliceCssVariables(): void {
  const style = document.documentElement.style;
  for (const asset of drawableAssets('nine-slice')) {
    const variables = asset.behavior.cssVariables;
    if (variables === undefined) continue;
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error(`nine-slice ${asset.id} has invalid CSS variables`);
    for (const [name, value] of Object.entries(variables)) {
      if (!/^--[a-z][a-z0-9-]*$/.test(name) || (typeof value !== 'string' && typeof value !== 'number')) throw new Error(`nine-slice ${asset.id} has invalid CSS variable ${name}`);
      style.setProperty(name, String(value));
    }
  }
}
