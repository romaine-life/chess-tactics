// Catalog content pane — faithful port of app.js's asset cards + catalog home.
// Renders to the right of the locked tree rail; reuses the original .catalog-*
// CSS.
import {
  assetCatalog,
  frameStyleForAsset, insetStyle,
  type Asset, type Rect,
} from './catalogData';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;

// A sprite-sheet crop (the .catalog-frame the original built via CSS vars).
function AssetFrame({ asset, frame, label }: { asset: Asset; frame: Rect; label?: string }): React.ReactElement {
  return (
    <div className="catalog-frame" style={frameStyleForAsset(asset, frame)}>
      {label ? <span className="catalog-frame-label" style={insetStyle(asset.rules?.textInset, frame)}>{label}</span> : null}
    </div>
  );
}

function ButtonAssetCard({ asset }: { asset: Asset }): React.ReactElement {
  const states = Object.entries(asset.states || {});
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
        {states.map(([stateKey, state]) => (
          <div className="catalog-state-card" key={stateKey}>
            <strong>{state.label || stateKey}</strong>
            <AssetFrame asset={asset} frame={state.rect} />
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
        <div><h4>Text Inset</h4><code>{JSON.stringify(rules.textInset || {})}</code></div>
        <div><h4>Hitbox</h4><code>{JSON.stringify(rules.hitbox || {})}</code></div>
        <div><h4>States</h4><code>{(rules.states || []).join(', ')}</code></div>
        <div><h4>Notes</h4><ul>{(rules.notes || []).map((note, i) => <li key={i}>{note}</li>)}</ul></div>
      </section>
    </article>
  );
}

function IconAssetCard({ asset }: { asset: Asset }): React.ReactElement {
  const rules = asset.rules || {};
  const rect = asset.rect;
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
          {rect ? <AssetFrame asset={asset} frame={rect} /> : null}
          {rect ? <code>x:{rect.x} y:{rect.y} w:{rect.w} h:{rect.h}</code> : null}
        </div>
      </section>

      <section className="catalog-rule-grid" aria-label="Asset rules">
        <div><h4>Notes</h4><ul>{(rules.notes || []).map((note, i) => <li key={i}>{note}</li>)}</ul></div>
      </section>
    </article>
  );
}

export function CatalogAssetCard({ asset }: { asset: Asset }): React.ReactElement | null {
  if (asset.type === 'button-9slice.main-menu') return <ButtonAssetCard asset={asset} />;
  if (asset.type === 'button-icon.main-menu') return <IconAssetCard asset={asset} />;
  return null;
}

interface ClassKind { title: string; href: string; count: number; planned?: boolean; summary: string }

export function CatalogHome({ countsByType, onNavigate }: { countsByType: Record<string, number>; onNavigate: Navigate }): React.ReactElement {
  const classes: { label: string; kinds: ClassKind[] }[] = [
    {
      label: 'asset',
      kinds: [
        { title: '9-slice', href: '/design/catalog/main-menu-buttons', count: countsByType['button-9slice.main-menu'] || 0, summary: 'Scalable, icon-less frames whose corners stay fixed while the middle stretches.' },
        { title: 'icon', href: '/design/catalog/main-menu-button-icons', count: countsByType['button-icon.main-menu'] || 0, summary: 'Standalone images composited into a slot.' },
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
                className={`catalog-family-card ${k.planned ? 'disabled' : ''}`.trim()}
                href={k.href}
                aria-disabled={k.planned ? 'true' : undefined}
                onClick={(e) => onNavigate(k.href, e)}
                key={k.title}
              >
                <span className="design-hub-kicker">{k.planned ? 'planned' : `${k.count} ${k.count === 1 ? 'entity' : 'entities'}`}</span>
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

// The browser pane: the selected asset's full inspection card. (The old
// select+search picker was removed — it was noise for single-asset types, and
// the tree rail already navigates between a type's assets.)
export function CatalogBrowser({ assetType, assetId }: { assetType: string; assetId?: string }): React.ReactElement {
  const assets = (assetCatalog.assets || []).filter((asset) => asset.type === assetType);
  const selected = assets.find((asset) => asset.id === assetId) || assets[0];
  return selected
    ? <CatalogAssetCard asset={selected} />
    : <p className="catalog-empty">No assets in this section yet.</p>;
}

export function countsByType(): Record<string, number> {
  return (assetCatalog.assets || []).reduce<Record<string, number>>((acc, asset) => {
    acc[asset.type] = (acc[asset.type] || 0) + 1;
    return acc;
  }, {});
}
