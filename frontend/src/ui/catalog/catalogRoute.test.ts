import { describe, it, expect } from 'vitest';
import { parseCatalogRoute, normalizePath } from './catalogRoute';
import { pruneTreeToTerms, ASSET_TREE_PROTOTYPE } from './catalogData';

// Pure logic port of app.js's currentRoute() catalog path table + the glossary
// tree pruning. These are the load-bearing parsing rules the UI branches on.

describe('normalizePath', () => {
  it('keeps root and strips trailing slashes elsewhere', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/design/catalog/')).toBe('/design/catalog');
    expect(normalizePath('/design/catalog')).toBe('/design/catalog');
  });
});

describe('parseCatalogRoute', () => {
  it('returns null for paths outside /design/catalog', () => {
    expect(parseCatalogRoute('/')).toBeNull();
    expect(parseCatalogRoute('/design')).toBeNull();
    expect(parseCatalogRoute('/design/glossary')).toBeNull();
  });

  it('parses the catalog root', () => {
    const r = parseCatalogRoute('/design/catalog')!;
    expect(r.catalogMode).toBe('catalog');
    expect(r.assetType).toBe('');
    expect(r.assetGroup).toBe('');
  });

  it('parses the button family group page', () => {
    const r = parseCatalogRoute('/design/catalog/buttons')!;
    expect(r.assetGroup).toBe('buttons');
  });

  it('maps friendly type segments to asset types', () => {
    expect(parseCatalogRoute('/design/catalog/main-menu-buttons')!.assetType).toBe('button-9slice.main-menu');
    expect(parseCatalogRoute('/design/catalog/main-menu-button-icons')!.assetType).toBe('button-icon.main-menu');
  });

  it('parses a selected asset id within a type', () => {
    const r = parseCatalogRoute('/design/catalog/main-menu-button-icons/button-icon.main-menu.sword')!;
    expect(r.assetType).toBe('button-icon.main-menu');
    expect(r.assetId).toBe('button-icon.main-menu.sword');
  });

  it('parses glossary mode and a term', () => {
    expect(parseCatalogRoute('/design/catalog/glossary')!.catalogMode).toBe('glossary');
    const r = parseCatalogRoute('/design/catalog/glossary/9-slice')!;
    expect(r.catalogMode).toBe('glossary');
    expect(r.glossaryTerm).toBe('9-slice');
  });

  it('decodes encoded glossary terms (e.g. spaces)', () => {
    const r = parseCatalogRoute('/design/catalog/glossary/sprite%20atlas')!;
    expect(r.glossaryTerm).toBe('sprite atlas');
  });

  it('parses widgets mode with family and optional slug', () => {
    const fam = parseCatalogRoute('/design/catalog/widgets/main-menu')!;
    expect(fam.catalogMode).toBe('widgets');
    expect(fam.widgetFamily).toBe('main-menu');
    expect(fam.widgetSlug).toBe('');
    const one = parseCatalogRoute('/design/catalog/widgets/main-menu/solo-skirmish')!;
    expect(one.widgetSlug).toBe('solo-skirmish');
  });

  it('falls back to catalog home for unknown type segments', () => {
    const r = parseCatalogRoute('/design/catalog/not-a-real-type')!;
    expect(r.catalogMode).toBe('catalog');
    expect(r.assetType).toBe('');
  });
});

describe('pruneTreeToTerms', () => {
  it('keeps only glossary-term nodes and rewrites hrefs to glossary entries', () => {
    const pruned = pruneTreeToTerms(ASSET_TREE_PROTOTYPE);
    const labels = pruned.map((n) => n.label);
    // 'asset' and 'widget' are glossary terms; their children get pruned too.
    expect(labels).toContain('asset');
    expect(labels).toContain('widget');
    const asset = pruned.find((n) => n.label === 'asset')!;
    expect(asset.href).toBe('/design/catalog/glossary/asset');
    // '9-slice', 'icon', 'sprite atlas' are glossary terms under asset; 'Main
    // Menu'/'Sword' leaves are not, so they drop.
    const childLabels = (asset.children ?? []).map((n) => n.label);
    expect(childLabels).toEqual(expect.arrayContaining(['9-slice', 'icon', 'sprite atlas']));
    expect(childLabels).not.toContain('Main Menu');
  });
});
