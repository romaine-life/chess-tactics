import { type ReactElement } from 'react';
import type { CatalogAsset, Rect } from './assetFrame';
import { frameStyleForAsset, insetStyle } from './assetFrame';
import { assetPath, assetTypeLabel } from './catalogData';

// Asset cards + browser chrome, ported from app.js (renderCatalogFrame,
// renderAssetFrame, renderButtonAssetCard, renderIconAssetCard,
// renderCatalogAssetCard, renderButtonTypeCatalog, renderAssetCatalogHome,
// renderAssetTypePicker). React escapes text, so escapeText is dropped.

function CatalogFrame({ asset, frame, children }: { asset: CatalogAsset; frame: Rect; children?: ReactElement }): ReactElement {
  return (
    <div className="catalog-frame" style={frameStyleForAsset(asset, frame)}>
      {children}
    </div>
  );
}

function AssetFrame({ asset, stateKey, sampleLabel = '' }: { asset: CatalogAsset; stateKey: string; sampleLabel?: string }): ReactElement | null {
  const state = asset.states[stateKey];
  if (!state) return null;
  const textInset = asset.rules && asset.rules.textInset;
  return (
    <CatalogFrame asset={asset} frame={state.rect}>
      {sampleLabel ? (
        <span className="catalog-frame-label" style={insetStyle(textInset, state.rect)}>
          {sampleLabel}
        </span>
      ) : undefined}
    </CatalogFrame>
  );
}

function ButtonAssetCard({ asset }: { asset: CatalogAsset }): ReactElement {
  const stateEntries = Object.entries(asset.states || {});
  const rules = asset.rules || {};
  return (
    <article className="catalog-asset-card" id={asset.id}>
      <header className="catalog-asset-head">
        <span className="design-hub-kicker">{asset.type} · {asset.status || 'draft'}</span>
        <h3>{asset.title || asset.id}</h3>
        <p>{asset.summary || ''}</p>
      </header>

      <section className="catalog-asset-meta" aria-label="Asset metadata">
        <div><dt>ID</dt><dd>{asset.id}</dd></div>
        <div><dt>Source</dt><dd>{asset.source?.kind || 'unknown'}</dd></div>
        <div><dt>Text</dt><dd>{rules.text || 'unknown'}</dd></div>
        <div><dt>Sizing</dt><dd>{rules.sizing || 'unknown'}</dd></div>
      </section>

      <section className="catalog-state-grid" aria-label="Button states">
        {stateEntries.map(([stateKey, state]) => (
          <div className="catalog-state-card" key={stateKey}>
            <strong>{state.label || stateKey}</strong>
            <AssetFrame asset={asset} stateKey={stateKey} />
            <code>x:{state.rect.x} y:{state.rect.y} w:{state.rect.w} h:{state.rect.h}</code>
          </div>
        ))}
      </section>

      <section className="catalog-slot-grid" aria-label="Button slots">
        <div><h4>Icon Slot</h4><code>{JSON.stringify(rules.iconSlot || {})}</code></div>
        <div><h4>Text Slot</h4><code>{JSON.stringify(rules.textInset || {})}</code></div>
        <div><h4>Arrow Slot</h4><code>{JSON.stringify(rules.arrowSlot || {})}</code></div>
        <div><h4>Hitbox</h4><code>{JSON.stringify(rules.hitbox || {})}</code></div>
      </section>

      <section className="catalog-rule-grid" aria-label="Asset rules">
        <div>
          <h4>Text Inset</h4>
          <code>{JSON.stringify(rules.textInset || {})}</code>
        </div>
        <div>
          <h4>Hitbox</h4>
          <code>{JSON.stringify(rules.hitbox || {})}</code>
        </div>
        <div>
          <h4>States</h4>
          <code>{(rules.states || []).join(', ')}</code>
        </div>
        <div>
          <h4>Notes</h4>
          <ul>{(rules.notes || []).map((note, i) => <li key={i}>{note}</li>)}</ul>
        </div>
      </section>
    </article>
  );
}

function IconAssetCard({ asset }: { asset: CatalogAsset }): ReactElement {
  const rules = asset.rules || {};
  return (
    <article className="catalog-asset-card" id={asset.id}>
      <header className="catalog-asset-head">
        <span className="design-hub-kicker">{asset.type} · {asset.status || 'draft'}</span>
        <h3>{asset.title || asset.id}</h3>
        <p>{asset.summary || ''}</p>
      </header>

      <section className="catalog-asset-meta" aria-label="Asset metadata">
        <div><dt>ID</dt><dd>{asset.id}</dd></div>
        <div><dt>Source</dt><dd>{asset.source?.kind || 'unknown'}</dd></div>
        <div><dt>Fits Slot</dt><dd>{rules.fitsSlot || 'unknown'}</dd></div>
        <div><dt>Background</dt><dd>{rules.background || 'unknown'}</dd></div>
      </section>

      <section className="catalog-icon-preview" aria-label="Icon preview">
        <div className="catalog-state-card">
          <strong>Icon Crop</strong>
          {asset.rect ? (
            <>
              <CatalogFrame asset={asset} frame={asset.rect} />
              <code>x:{asset.rect.x} y:{asset.rect.y} w:{asset.rect.w} h:{asset.rect.h}</code>
            </>
          ) : null}
        </div>
      </section>

      <section className="catalog-rule-grid" aria-label="Asset rules">
        <div>
          <h4>Notes</h4>
          <ul>{(rules.notes || []).map((note, i) => <li key={i}>{note}</li>)}</ul>
        </div>
      </section>
    </article>
  );
}

export function CatalogAssetCard({ asset }: { asset: CatalogAsset }): ReactElement | null {
  if (asset.type === 'button-9slice.main-menu') return <ButtonAssetCard asset={asset} />;
  if (asset.type === 'button-icon.main-menu') return <IconAssetCard asset={asset} />;
  return null;
}

export function ButtonTypeCatalog({ countsByType }: { countsByType: Record<string, number> }): ReactElement {
  const families = [
    {
      href: '/design/catalog/main-menu-buttons',
      title: 'Main Menu Buttons',
      summary: 'Menu-row button frames with live labels, an icon slot, arrow affordance, binary states, and hitbox rules.',
      count: countsByType['button-9slice.main-menu'] || 0,
      status: 'draft',
    },
    {
      href: '#',
      title: 'Plain Buttons',
      summary: 'Future bucket for buttons without menu icon slots, such as dialog actions, small controls, or art-only buttons.',
      count: 0,
      status: 'planned',
    },
  ];
  return (
    <section className="catalog-family-grid" aria-label="Button types">
      {families.map((family) => (
        <a
          className={`catalog-family-card ${family.href === '#' ? 'disabled' : ''}`}
          href={family.href}
          aria-disabled={family.href === '#' ? true : undefined}
          key={family.title}
        >
          <span className="design-hub-kicker">{family.status} · {family.count} asset{family.count === 1 ? '' : 's'}</span>
          <h3>{family.title}</h3>
          <p>{family.summary}</p>
        </a>
      ))}
    </section>
  );
}

export function AssetCatalogHome({ countsByType }: { countsByType: Record<string, number> }): ReactElement {
  const classes = [
    {
      label: 'asset',
      kinds: [
        { title: '9-slice', href: '/design/catalog/main-menu-buttons', count: countsByType['button-9slice.main-menu'] || 0, planned: false, summary: 'Scalable, icon-less frames whose corners stay fixed while the middle stretches.' },
        { title: 'icon', href: '/design/catalog/main-menu-button-icons', count: countsByType['button-icon.main-menu'] || 0, planned: false, summary: 'Standalone images composited into a slot.' },
        { title: 'sprite atlas', href: '#', count: 0, planned: true, summary: 'One image packing several unrelated sprites.' },
      ],
    },
    {
      label: 'widget',
      kinds: [
        { title: 'button', href: '#', count: 0, planned: true, summary: 'Interactive element assembled from a 9-slice + icon + live label.' },
      ],
    },
  ];
  return (
    <div className="catalog-home">
      {classes.map((cls) => (
        <section className="catalog-home-class" aria-label={cls.label} key={cls.label}>
          <h3 className="catalog-home-class-label">{cls.label}</h3>
          <div className="catalog-family-grid">
            {cls.kinds.map((k) => (
              <a
                className={`catalog-family-card ${k.planned ? 'disabled' : ''}`}
                href={k.href}
                aria-disabled={k.planned ? true : undefined}
                key={k.title}
              >
                <span className="design-hub-kicker">{k.planned ? 'planned' : `${k.count} entit${k.count === 1 ? 'y' : 'ies'}`}</span>
                <h4>{k.title}</h4>
                <p>{k.summary}</p>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AssetTypePicker({ assets, selectedAsset }: { assets: CatalogAsset[]; selectedAsset: CatalogAsset | undefined }): ReactElement | null {
  if (!assets.length) return null;
  const selectedId = selectedAsset && selectedAsset.id;
  const typeLabel = assetTypeLabel(assets[0].type);
  return (
    <aside className="catalog-picker" aria-label={`${typeLabel} assets`}>
      <div className="catalog-picker-head">
        <h3>{typeLabel} Assets</h3>
        <span>{assets.length}</span>
      </div>
      <label className="catalog-picker-control">
        <span>Selected {typeLabel.toLowerCase()}</span>
        <select
          data-catalog-asset-select
          value={selectedId ? assetPath(selectedAsset!.type, selectedAsset!.id) : ''}
          onChange={(e) => { if (e.target.value) window.location.assign(e.target.value); }}
        >
          {assets.map((asset) => (
            <option
              value={assetPath(asset.type, asset.id)}
              data-catalog-search={`${asset.title || ''} ${asset.id}`.toLowerCase()}
              key={asset.id}
            >
              {asset.title || asset.id}
            </option>
          ))}
        </select>
      </label>
      <label className="catalog-picker-control">
        <span>Search {typeLabel.toLowerCase()} assets</span>
        <input type="search" data-catalog-asset-search placeholder="Filter by name or id" autoComplete="off" />
      </label>
      <p className="catalog-picker-count" data-catalog-match-count>{assets.length} matches</p>
    </aside>
  );
}
