import { type AriaRole, type ReactElement, type ReactNode } from 'react';
import type { InterfaceSfxCue } from '../../core/sfxProfile';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { InnerTextButton, InnerTextNavButton, type ChromeButtonTone } from './ChromeButton';

// The shared settings/menu "rail + content" control primitives (ADR-0059): a section
// (uppercase eyebrow + grouped rows), a row (copy · value · control grid), and a chrome
// button (forged tone variants). Extracted out of Settings.tsx so every settings-twin
// surface — Settings, the Editor (/editor), and future ones — composes the SAME controls
// instead of forking a bespoke parallel. Styling lives on the `.settings-*` classes in
// style.css (real 9-slice kit art, not CSS imitation).

export type ButtonTone = ChromeButtonTone;

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
  'data-ui-sfx': dataUiSfx,
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
  'data-ui-sfx'?: InterfaceSfxCue;
}): ReactElement {
  const classes = `settings-chrome-button settings-chrome-button-${tone} ${className}`.trim();
  if (href && external) {
    // External destinations still open a new tab — via a button, not an anchor
    // (ADR-0052): no hover URL leaks into the game shell; noopener guards the opener.
    return (
      <InnerTextButton className={classes} tone={tone} aria-label={ariaLabel} title={title} disabled={disabled} data-testid={dataTestid} data-ui-sfx={dataUiSfx} onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>
        <span>{children}</span>
      </InnerTextButton>
    );
  }
  if (href && !disabled) {
    // Internal routes are game controls — a NavButton, not a hyperlink (ADR-0052).
    return (
      <InnerTextNavButton className={classes} tone={tone} to={href} aria-label={ariaLabel} title={title} data-testid={dataTestid} data-ui-sfx={dataUiSfx}>
        <span>{children}</span>
      </InnerTextNavButton>
    );
  }
  return (
    <InnerTextButton className={classes} tone={tone} aria-label={ariaLabel} title={title} disabled={disabled} data-testid={dataTestid} data-ui-sfx={dataUiSfx} onClick={onClick}>
      <span>{children}</span>
    </InnerTextButton>
  );
}

export function SettingsRow({
  title,
  eyebrow,
  description,
  value,
  tall = false,
  className = '',
  role,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  value?: ReactNode;
  tall?: boolean;
  className?: string;
  role?: AriaRole;
  children?: ReactNode;
}): ReactElement {
  return (
    <section
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-row', tall && 'settings-row-tall', className)}
      role={role}
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
