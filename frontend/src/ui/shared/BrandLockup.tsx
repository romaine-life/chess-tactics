import { type ReactElement } from 'react';
import { NavButton } from './NavButton';
import { installedUiMedia } from '../installedUiMedia';

// The single brand lockup in the top-left of every screen. The game wordmark is the
// persistent header — it's the dominant line on every page — with the screen name as
// the small line beneath it. Same mark, same structure, same spot everywhere; only
// `screenName` changes. DOM order is brand-then-name so it reads and renders top-down
// without any reordering. This is the one source; do not hand-roll a per-screen brand
// mark. Returns to the main menu — as a BUTTON, not a hyperlink (ADR-0052): this is a
// game shell, and the title mark is a UI control like every other; probed game-first
// web apps expose no URL on their logo/menu, and neither do we.
export function BrandLockup({ screenName }: { screenName: string }): ReactElement {
  return (
    <NavButton className="brand-lockup" to="/" aria-label={`${screenName} — Chess Tactics home`}>
      <img className="brand-lockup-mark" src={installedUiMedia('ui-kit-icons-brand-shield-png')} alt="" aria-hidden="true" />
      <span className="brand-lockup-copy">
        <em>Chess Tactics</em>
        <strong>{screenName}</strong>
      </span>
    </NavButton>
  );
}
