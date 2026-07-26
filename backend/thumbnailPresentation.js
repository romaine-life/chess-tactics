'use strict';

function assetsFrom(catalog) {
  if (!catalog || !Array.isArray(catalog.assets)) {
    throw new Error('thumbnail presentation drawable catalog is unavailable');
  }
  return catalog.assets;
}

function requiredDrawable(catalog, kind, description, predicate) {
  const matches = assetsFrom(catalog).filter((asset) => asset?.kind === kind && predicate(asset));
  if (matches.length !== 1) {
    throw new Error(`thumbnail presentation requires one ${kind} ${description}; found ${matches.length}`);
  }
  return matches[0];
}

function requiredRole(catalog, kind, role) {
  return requiredDrawable(
    catalog,
    kind,
    `with role ${role}`,
    (asset) => Array.isArray(asset.behavior?.roles) && asset.behavior.roles.includes(role),
  );
}

function requiredValue(catalog, kind, value) {
  return requiredDrawable(
    catalog,
    kind,
    `with value ${value}`,
    (asset) => asset.behavior?.value === value,
  );
}

function requiredMedia(asset, role) {
  const src = asset?.media?.[role]?.media?.immutableUrl;
  if (typeof src !== 'string' || !src) {
    throw new Error(`thumbnail presentation ${asset?.kind || 'drawable'} ${asset?.id || 'unknown'} has no ${role} media`);
  }
  return src;
}

function resolveLevelCardPresentation(catalog) {
  const appUi = requiredRole(catalog, 'app-ui', 'application-ui');
  const titleSurface = requiredValue(catalog, 'ui-surface', 'hybrid-wood-oak');
  const chrome = requiredRole(catalog, 'chrome-family', 'installed-chrome');
  const font = requiredDrawable(
    catalog,
    'app-font',
    'marked for thumbnails',
    (asset) => asset.behavior?.thumbnail === true,
  );

  return {
    fontSrc: requiredMedia(font, 'font'),
    uiMedia: {
      wood: requiredMedia(titleSurface, 'surface'),
      band: requiredMedia(appUi, 'ui-titlebar-band-forged-png'),
      joint: requiredMedia(chrome, 'divider-joint'),
      shield: requiredMedia(appUi, 'ui-kit-icons-brand-shield-png'),
    },
  };
}

function resolveDefaultOgImage(catalog) {
  return requiredMedia(requiredRole(catalog, 'app-ui', 'application-ui'), 'og-default');
}

module.exports = {
  resolveDefaultOgImage,
  resolveLevelCardPresentation,
};
