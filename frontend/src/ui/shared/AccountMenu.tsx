import { useEffect, useRef, useState, type ReactElement } from 'react';

// The signed-in account control for the trailing edge of the app chrome: an
// icon-only avatar button (Gravatar) that opens a small kit-framed menu carrying
// the user's name + email and the Sign Out action. This is the canonical
// "account menu" pattern (GitHub / Google / Slack / Figma): the bar shows only
// the avatar, the menu reveals identity at the moment of action. Pairs with the
// Settings gear so the top-right reads as one "settings + user" cluster.

interface AccountMenuProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  onSignOut: () => void;
  /** Render the menu open on mount (screenshot / demo harness only). */
  defaultOpen?: boolean;
}

const initial = (name: string): string => (name.trim()[0] || '?').toUpperCase();

export function AccountMenu({ name, email, avatarUrl, onSignOut, defaultOpen }: AccountMenuProps): ReactElement {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside-click / Escape — standard menu behaviour.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const avatar = (cls: string): ReactElement => (avatarUrl
    ? <img className={cls} src={avatarUrl} alt="" />
    : <span className={`${cls} account-avatar-fallback`} aria-hidden="true">{initial(name)}</span>);

  return (
    <div className="account-menu-root" ref={rootRef}>
      <button
        type="button"
        className="cluster-icon-button account-avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} — account menu`}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar('account-avatar-img')}
      </button>

      {open && (
        <div className="account-menu" role="menu" aria-label="Account">
          <div className="account-menu-head">
            {avatar('account-menu-avatar')}
            <span className="account-menu-id">
              <strong>{name}</strong>
              <em>{email}</em>
            </span>
          </div>
          <button type="button" className="account-menu-item" role="menuitem" onClick={onSignOut}>
            <ExitGlyph />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Placeholder door/exit glyph — a doorway with an arrow leaving it. To be re-forged
// as a proper 64x64 kit icon (ADR-0026) once the look is locked; inline for now so
// the menu reads correctly in the workshop.
function ExitGlyph(): ReactElement {
  return (
    <svg className="account-menu-glyph" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 1h7v2H4v10h5v2H2z" fill="currentColor" />
      <path d="M9 7h4V5l3 3-3 3v-2H9z" fill="currentColor" />
    </svg>
  );
}
