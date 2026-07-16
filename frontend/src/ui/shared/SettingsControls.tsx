import { type ReactElement, type ReactNode } from 'react';
import { NavButton } from './NavButton';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

// The shared settings/menu "rail + content" control primitives (ADR-0059): a section
// (uppercase eyebrow + grouped rows), a row (copy · value · control grid), and a chrome
// button (forged tone variants). Extracted out of Settings.tsx so every settings-twin
// surface — Settings, the Editor (/editor), and future ones — composes the SAME controls
// instead of forking a bespoke parallel. Styling lives on the `.settings-*` classes in
// style.css (real 9-slice kit art, not CSS imitation).

export type ButtonTone = 'neutral' | 'primary' | 'danger';

export function SettingsButton({
  children,
  tone = 'neutral',
  onClick,
  href,
  className = '',
  ariaLabel,
  external = false,
  disabled = false,
  title,
  'data-testid': dataTestid,
}: {
  children: ReactNode;
  tone?: ButtonTone;
  onClick?: () => void;
  href?: string;
  className?: string;
  ariaLabel?: string;
  external?: boolean;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}): ReactElement {
  const classes = chromeUnitClassNames('inner-text-button', `settings-chrome-button settings-chrome-button-${tone}`, tone === 'danger' && 'danger', className);
  if (href && external) {
    // External destinations still open a new tab — via a button, not an anchor
    // (ADR-0052): no hover URL leaks into the game shell; noopener guards the opener.
    return (
      <button type="button" data-chrome-unit="inner-text-button" className={classes} aria-label={ariaLabel} title={title} disabled={disabled} data-testid={dataTestid} onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>
        <span>{children}</span>
      </button>
    );
  }
  if (href && !disabled) {
    // Internal routes are game controls — a NavButton, not a hyperlink (ADR-0052).
    return (
      <NavButton data-chrome-unit="inner-text-button" className={classes} to={href} aria-label={ariaLabel} title={title} data-testid={dataTestid}>
        <span>{children}</span>
      </NavButton>
    );
  }
  return (
    <button type="button" data-chrome-unit="inner-text-button" className={classes} aria-label={ariaLabel} title={title} disabled={disabled} data-testid={dataTestid} onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}

export function SettingsRow({
  title,
  eyebrow,
  description,
  value,
  tall = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  value?: ReactNode;
  tall?: boolean;
  children?: ReactNode;
}): ReactElement {
  return (
    <section
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-row', tall && 'settings-row-tall')}
    >
      <div className="settings-row-copy">
        {eyebrow ? <span className="settings-row-eyebrow">{eyebrow}</span> : null}
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {value ? <div className="settings-row-value">{value}</div> : null}
      {children ? <div className="settings-row-control">{children}</div> : null}
    </section>
  );
}

// A labeled cluster of rows. Purely organizational: a small uppercase eyebrow
// (h3, between the tab's h2 and each row's h4) plus its grouped rows, so a long
// settings list reads as scannable sections instead of one undifferentiated stack.
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-section-rows">{children}</div>
    </section>
  );
}
