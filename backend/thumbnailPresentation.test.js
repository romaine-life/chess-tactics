'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resolveDefaultOgImage,
  resolveLevelCardPresentation,
} = require('./thumbnailPresentation');

let sequence = 0;
function binding(label) {
  sequence += 1;
  return { media: { immutableUrl: `/api/media/${label}-${sequence}` } };
}

function productionShapedCatalog() {
  return {
    assets: [{
      id: 'app-ui',
      kind: 'app-ui',
      behavior: { roles: ['application-ui'] },
      media: {
        'og-default': binding('og'),
        'ui-titlebar-band-forged-png': binding('band'),
        'ui-kit-icons-brand-shield-png': binding('shield'),
      },
    }, {
      id: 'title-surface',
      kind: 'ui-surface',
      behavior: { value: 'hybrid-wood-oak' },
      media: { surface: binding('wood') },
    }, {
      id: 'installed-chrome',
      kind: 'chrome-family',
      behavior: { roles: ['installed-chrome'] },
      media: { 'divider-joint': binding('joint') },
    }, {
      id: 'thumbnail-font',
      kind: 'app-font',
      behavior: { thumbnail: true },
      media: { font: binding('font') },
    }],
  };
}

test('level-card presentation resolves each asset from its database-owned component', () => {
  const catalog = productionShapedCatalog();
  const presentation = resolveLevelCardPresentation(catalog);

  assert.equal(presentation.uiMedia.wood, catalog.assets[1].media.surface.media.immutableUrl);
  assert.equal(presentation.uiMedia.band, catalog.assets[0].media['ui-titlebar-band-forged-png'].media.immutableUrl);
  assert.equal(presentation.uiMedia.joint, catalog.assets[2].media['divider-joint'].media.immutableUrl);
  assert.equal(presentation.uiMedia.shield, catalog.assets[0].media['ui-kit-icons-brand-shield-png'].media.immutableUrl);
  assert.equal(presentation.fontSrc, catalog.assets[3].media.font.media.immutableUrl);
  assert.equal(resolveDefaultOgImage(catalog), catalog.assets[0].media['og-default'].media.immutableUrl);
});

test('level-card presentation does not depend on retired menu icon roles or the orphan titlebar slot', () => {
  const serialized = JSON.stringify(productionShapedCatalog());
  assert.doesNotMatch(serialized, /ui-main-menu-icons-carved/);
  assert.doesNotMatch(serialized, /ui-titlebar-joint-diamond-forged/);
  assert.doesNotThrow(() => resolveLevelCardPresentation(productionShapedCatalog()));
});

test('level-card presentation fails closed when a component is absent or ambiguous', () => {
  const missingJoint = productionShapedCatalog();
  delete missingJoint.assets[2].media['divider-joint'];
  assert.throws(() => resolveLevelCardPresentation(missingJoint), /has no divider-joint media/);

  const duplicateSurface = productionShapedCatalog();
  duplicateSurface.assets.push({
    ...duplicateSurface.assets[1],
    id: 'duplicate-title-surface',
  });
  assert.throws(() => resolveLevelCardPresentation(duplicateSurface), /found 2/);
});
