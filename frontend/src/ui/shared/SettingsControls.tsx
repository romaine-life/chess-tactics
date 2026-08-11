import { type AriaRole, type ReactElement, type ReactNode } from 'react';
import type { InterfaceSfxCue } from '../../core/sfxProfile';
import type { ChromeRole } from '../chromeCandidateSources';
import { InnerChromeBox } from './ChromeBox';
import { InnerTextButton, InnerTextNavButton, type ChromeButtonTone } from './ChromeButton';
import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';
import { SectionBox, type SectionBoxMember } from './SectionBox';

// The shared settings/menu "rail + content" control primitives (ADR-0059): a section
// (uppercase eyebrow + grouped rows), a row (copy · value · control grid), and a chrome
// button (forged tone variants). Extracted out of Settings.tsx so every settings-twin
// surface — Settings, the Editor (/editor), and future ones — composes the SAME controls
// instead of forking a bespoke parallel. Styling lives on the `.settings-*` classes in
// style.css (real 9-slice kit art, not CSS imitation).
//
// The two materials are carried HERE, not chosen per call site (ADR-0433): a row is a
// structural box and wears the installed marble; a button is a leaf and wears the oak.
// Left to each surface this drifts one control at a time — which is how both the Editor
// column and Settings ended up stacks of tinted voids with unpainted buttons in them. A
// call site that genuinely needs another material still passes `fillRole`/`fillSurface`
// and states why.

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
  fillSurface = CHROME_LEAF_FILL_SURFACE,
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
  /** Name an installed chrome surface for this control's fill — the registered-material
   *  override the inner role's default tint yields to (see `namedChromeFillSurfaceCss`).
   *  Defaults to the leaf oak; pass another installed surface only with a reason. */
  fillSurface?: string;
  'data-testid'?: string;
  'data-ui-sfx'?: InterfaceSfxCue;
}): ReactElement {
  const classes = `settings-chrome-button settings-chrome-button-${tone} ${className}`.trim();
  if (href && external) {
    // External destinations still open a new tab — via a button, not an anchor
    // (ADR-0052): no hover URL leaks into the game shell; noopener guards the opener.
    return (
      <InnerTextButton className={classes} tone={tone} aria-label={ariaLabel} title={title} disabled={disabled} data-chrome-fill-surface={fillSurface} data-testid={dataTestid} data-ui-sfx={dataUiSfx} onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>
        <span>{children}</span>
      </InnerTextButton>
    );
  }
  if (href && !disabled) {
    // Internal routes are game controls — a NavButton, not a hyperlink (ADR-0052).
    return (
      <InnerTextNavButton className={classes} tone={tone} to={href} aria-label={ariaLabel} title={title} data-chrome-fill-surface={fillSurface} data-testid={dataTestid} data-ui-sfx={dataUiSfx}>
        <span>{children}</span>
      </InnerTextNavButton>
    );
  }
  return (
    <InnerTextButton className={classes} tone={tone} aria-label={ariaLabel} title={title} disabled={disabled} data-chrome-fill-surface={fillSurface} data-testid={dataTestid} data-ui-sfx={dataUiSfx} onClick={onClick}>
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
  framed = true,
  className = '',
  role,
  fillRole = CHROME_STRUCTURAL_FILL_ROLE,
  fillSurface,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  value?: ReactNode;
  tall?: boolean;
  /**
   * False for a row that is a MEMBER of a SectionBox rather than a slab standing on its own. The
   * box around it is already the frame and already wears the marble; framing the row again would
   * draw the same material inside itself. Members are told apart by the kit's inner divider the
   * group puts between them.
   */
  framed?: boolean;
  className?: string;
  role?: AriaRole;
  /** Borrow another role's installed fill under this row's inner frame — `outer` is the
   *  marble the app's panels and title strips wear (ADR-0433 borrowing rule), and is what
   *  a row wears unless a call site names a different structural material. */
  fillRole?: ChromeRole;
  fillSurface?: string;
  children?: ReactNode;
}): ReactElement {
  const classes = `settings-row ${tall ? 'settings-row-tall' : ''} ${framed ? '' : 'settings-row-member'} ${className}`
    .replace(/\s+/g, ' ').trim();
  const body = (
    <>
      <div className="settings-row-copy">
        {eyebrow ? <span className="settings-row-eyebrow">{eyebrow}</span> : null}
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {value ? <div className="settings-row-value">{value}</div> : null}
      {children ? <div className="settings-row-control">{children}</div> : null}
    </>
  );
  if (!framed) return <section className={classes} role={role}>{body}</section>;
  return (
    <InnerChromeBox
      as="section"
      className={classes}
      role={role}
      fillRole={fillRole}
      fillSurface={fillSurface}
    >
      {body}
    </InnerChromeBox>
  );
}

/**
 * A SectionBox whose members are settings rows: one box, named, with the kit's rails between rows.
 * Reach for it when a group genuinely holds several settings — a group of ONE is its own row, and
 * naming it twice is a label that says what the row below already says.
 *
 * The rows arrive as a typed member list rather than as children, so the space between them is the
 * box's to lay and nobody else's. That is not ceremony: a rail hand-placed between children cannot
 * know where its ends meet the frame, and the first version of this component shipped one with no
 * junction caps at all.
 */
export function SettingsGroup({
  title,
  titleId,
  className = '',
  members,
}: {
  title: string;
  titleId: string;
  className?: string;
  members: readonly SectionBoxMember[];
}): ReactElement {
  return (
    <SectionBox
      title={title}
      titleId={titleId}
      className={`settings-group ${className}`.trim()}
      members={members}
    />
  );
}

// A cluster of rows, optionally named. The name is a small uppercase eyebrow (h3, between the
// tab's h2 and each row's h4).
//
// `title` is OPTIONAL, and on a screen standing over live artwork the honest answer is usually to
// omit it: the eyebrow is bare text with nothing behind it, and most of these groups were one row
// whose eyebrow restated the row's own name. Where a group genuinely holds several settings, reach
// for SettingsGroup instead — that gives the name a box to live in rather than a patch of sky.
export function SettingsSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="settings-section">
      {title ? <h3 className="settings-section-title">{title}</h3> : null}
      <div className="settings-section-rows">{children}</div>
    </section>
  );
}
