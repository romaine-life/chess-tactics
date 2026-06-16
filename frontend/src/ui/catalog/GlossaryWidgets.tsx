import { type CSSProperties, type ReactElement } from 'react';
import type { CatalogAsset } from './assetFrame';
import { frameStyleForAsset, insetStyle } from './assetFrame';
import { GLOSSARY, MENU_MODES, type MenuMode } from './catalogData';

// Glossary entry + widget gallery, ported from app.js (renderGlossaryTag,
// renderGlossaryEntry, renderModeButton, renderWidgetCard).

function GlossaryTag({ tag }: { tag: string }): ReactElement | null {
  if (!tag) return null;
  const cls = tag === 'asset' ? 'is-asset' : 'is-not-asset';
  return <span className={`glossary-tag ${cls}`}>{tag}</span>;
}

export function GlossaryEntry({ term }: { term: string }): ReactElement {
  const g = GLOSSARY.find((e) => e.term === term);
  if (!g) return <p className="catalog-empty">Pick a term from the tree to read its definition.</p>;
  return (
    <article className="glossary-entry">
      <header>
        <h3>{g.term}</h3>
        <GlossaryTag tag={g.tag} />
      </header>
      <p className="glossary-entry-def">{g.def}</p>
      <p className="glossary-entry-src">{g.src}</p>
      <p className="glossary-entry-more"><a href="/design/glossary">Full glossary →</a></p>
    </article>
  );
}

// A live main-menu button widget: a 9-slice state + a composited icon + a live
// label. `byId` resolves the catalog assets the widget is assembled from.
function ModeButton({
  mode,
  byId,
  active = false,
  specimen = false,
}: {
  mode: MenuMode;
  byId: Map<string, CatalogAsset>;
  active?: boolean;
  specimen?: boolean;
}): ReactElement | null {
  const nineSlice = byId.get('button-9slice.main-menu');
  if (!nineSlice) return null;
  const rules = nineSlice.rules || {};
  const stateDef = nineSlice.states[active ? 'pressed' : 'normal'] || nineSlice.states.normal;
  if (!stateDef) return null;
  const icon = byId.get(mode.icon);
  const frameStyle = frameStyleForAsset(nineSlice, stateDef.rect);
  const iconStyle = icon && icon.rect
    ? { ...insetStyle(rules.iconSlot, stateDef.rect), ...frameStyleForAsset(icon, icon.rect) }
    : undefined;
  const labelStyle = insetStyle(rules.textInset, stateDef.rect);
  return (
    <button
      className={`mode-button ${active ? 'is-active' : ''}${specimen ? ' is-specimen' : ''}`}
      type="button"
      data-action={specimen ? 'demo-toggle' : mode.action}
      aria-label={mode.label}
      aria-current={active ? true : undefined}
      style={{ '--asset-aspect': `${stateDef.rect.w} / ${stateDef.rect.h}` } as CSSProperties}
    >
      <span className="mode-button-9slice" style={frameStyle} aria-hidden="true"></span>
      {icon ? <span className="mode-button-icon" style={iconStyle} aria-hidden="true"></span> : null}
      <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
    </button>
  );
}

function WidgetCard({ mode, byId }: { mode: MenuMode; byId: Map<string, CatalogAsset> }): ReactElement {
  const iconAsset = byId.get(mode.icon);
  const iconName = iconAsset ? (iconAsset.title || mode.icon) : mode.icon;
  return (
    <article className="widget-card">
      <div className="widget-card-preview main-menu-actions-assets">
        <ModeButton mode={mode} byId={byId} active={false} specimen />
      </div>
      <div className="widget-card-meta">
        <h3>{mode.label}</h3>
        <p>9-slice + {iconName} + live label + <code>{mode.action}</code> action · click to press</p>
      </div>
    </article>
  );
}

export function WidgetGallery({ modes, byId }: { modes: MenuMode[]; byId: Map<string, CatalogAsset> }): ReactElement {
  if (!modes.length) return <p className="catalog-empty">No widgets in this family yet.</p>;
  return (
    <section className="widget-gallery" aria-label="Widgets">
      {modes.map((mode) => <WidgetCard mode={mode} byId={byId} key={mode.slug} />)}
    </section>
  );
}

export { MENU_MODES };
