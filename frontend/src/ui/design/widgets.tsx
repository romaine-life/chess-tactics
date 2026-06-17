// Completed main-menu button widgets, shown live in the catalog. Faithful port
// of app.js renderModeButton/renderWidgetCard. The catalog requirement (session
// 930, turn 62): "display the element in action" — the demo button is
// interactive in place (click to press), it does NOT fire the live action or
// navigate away.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { assetById, frameStyleForAsset, insetStyle, MENU_MODES, type MenuMode } from './catalogData';

export function ModeButton({ mode, specimen = false, active = false }: { mode: MenuMode; specimen?: boolean; active?: boolean }): React.ReactElement | null {
  const [pressed, setPressed] = useState(active);
  const rowAsset = assetById(mode.row);
  if (rowAsset?.states) {
    const isActive = specimen ? pressed : active;
    const stateDef = rowAsset.states[isActive ? 'active' : 'normal'] || rowAsset.states.normal;
    if (!stateDef) return null;
    const frameStyle = frameStyleForAsset(rowAsset, stateDef.rect);
    const labelStyle = insetStyle(rowAsset.rules?.textInset, stateDef.rect);
    const buttonStyle = { '--asset-aspect': `${stateDef.rect.w} / ${stateDef.rect.h}` } as CSSProperties;
    return (
      <button
        type="button"
        className={`mode-button uses-row-art ${isActive ? 'is-active' : ''}${specimen ? ' is-specimen' : ''}`.trim()}
        aria-label={mode.label}
        aria-current={isActive ? 'true' : undefined}
        style={buttonStyle}
        onClick={specimen ? () => setPressed((p) => !p) : undefined}
      >
        <span className="mode-button-art" style={frameStyle} aria-hidden="true" />
        <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
      </button>
    );
  }

  const nineSlice = assetById('button-9slice.main-menu');
  if (!nineSlice || !nineSlice.states) return null;
  const rules = nineSlice.rules || {};
  const isActive = specimen ? pressed : active;
  const stateDef = nineSlice.states[isActive ? 'pressed' : 'normal'] || nineSlice.states.normal;
  if (!stateDef) return null;
  const icon = assetById(mode.icon);
  const frameStyle = frameStyleForAsset(nineSlice, stateDef.rect);
  const iconStyle: CSSProperties = icon && icon.rect
    ? { ...insetStyle(rules.iconSlot, stateDef.rect), ...frameStyleForAsset(icon, icon.rect) }
    : {};
  const labelStyle = insetStyle(rules.textInset, stateDef.rect);
  const buttonStyle = { '--asset-aspect': `${stateDef.rect.w} / ${stateDef.rect.h}` } as CSSProperties;
  return (
    <button
      type="button"
      className={`mode-button ${isActive ? 'is-active' : ''}${specimen ? ' is-specimen' : ''}`.trim()}
      aria-label={mode.label}
      aria-current={isActive ? 'true' : undefined}
      style={buttonStyle}
      onClick={specimen ? () => setPressed((p) => !p) : undefined}
    >
      <span className="mode-button-9slice" style={frameStyle} aria-hidden="true" />
      {icon ? <span className="mode-button-icon" style={iconStyle} aria-hidden="true" /> : null}
      <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
    </button>
  );
}

export function WidgetCard({ mode }: { mode: MenuMode }): React.ReactElement {
  const rowAsset = assetById(mode.row);
  const iconAsset = assetById(mode.icon);
  const iconName = iconAsset ? (iconAsset.title || mode.icon) : mode.icon;
  return (
    <article className="widget-card">
      <div className="widget-card-preview main-menu-actions-assets">
        <ModeButton mode={mode} specimen />
      </div>
      <div className="widget-card-meta">
        <h3>{mode.label}</h3>
        <p>{rowAsset ? (rowAsset.title || mode.row) : `9-slice + ${iconName}`} + live label + <code>{mode.action}</code> action · click to press</p>
      </div>
    </article>
  );
}

export function WidgetGallery({ modes = MENU_MODES }: { modes?: MenuMode[] }): React.ReactElement {
  return (
    <section className="widget-gallery" aria-label="Widgets">
      {modes.map((mode) => <WidgetCard key={mode.slug} mode={mode} />)}
    </section>
  );
}
