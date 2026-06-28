import { useEffect, useRef, useState, type ReactElement } from 'react';

// The signed-in account control for the trailing edge of the app chrome: an
// icon-only avatar button (Gravatar) that opens a small kit-framed menu naming
// the user and offering Sign Out. The canonical "account menu" pattern (GitHub /
// Google / Slack): the avatar carries the identity in the bar, so the menu just
// names who's signed in (no redundant second avatar) and acts. Pairs with the
// Settings gear so the top-right reads as one "settings + user" cluster.

interface AccountMenuProps {
  name: string;
  avatarUrl: string | null;
  onSignOut: () => void;
  /** Render the menu open on mount (screenshot / demo harness only). */
  defaultOpen?: boolean;
}

const initial = (name: string): string => (name.trim()[0] || '?').toUpperCase();

export function AccountMenu({ name, avatarUrl, onSignOut, defaultOpen }: AccountMenuProps): ReactElement {
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
          <span className="account-menu-name">{name}</span>
          <button
            type="button"
            className="account-menu-exit"
            role="menuitem"
            aria-label="Sign out"
            title="Sign out"
            onClick={onSignOut}
          >
            <img className="account-menu-glyph" src="/assets/ui/kit/icons/sign-out.png" alt="" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
