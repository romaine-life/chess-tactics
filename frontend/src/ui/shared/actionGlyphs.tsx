import { type ReactElement } from 'react';

// Shared line glyphs for the skirmish lifecycle controls, so the title-bar Retry stud and the
// HUD's Restart / New buttons all draw the SAME mark. Stroke = currentColor, so each caller's
// ink (and its hover/focus lightening) themes the glyph; size comes from the caller's class.

/** Circular "reload" arrow — restart / retry the current battle in place. */
export function RestartGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <polyline points="20 3.5 20 8 15.5 8" />
    </svg>
  );
}

/** Plus — start a brand-new skirmish (fresh board). */
export function NewGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// Move-review transport marks. The score sheet is walked the way any recording is, so these
// are the transport shapes a player already knows: a bar means "as far as it goes in that
// direction", a bare triangle means one step. Drawn filled rather than stroked so they stay
// legible at the small key size the review row uses.

/** Skip back — the opening position. */
export function ReviewFirstGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="2.6" height="14" rx="1" />
      <path d="M19 5.6v12.8L9.4 12z" />
    </svg>
  );
}

/** One half-move back. */
export function ReviewPrevGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 5.6v12.8L7.4 12z" />
    </svg>
  );
}

/** One half-move forward. */
export function ReviewNextGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5.6v12.8L16.6 12z" />
    </svg>
  );
}

/** Skip forward — the live board. */
export function ReviewLastGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 5.6v12.8L14.6 12z" />
      <rect x="16.4" y="5" width="2.6" height="14" rx="1" />
    </svg>
  );
}

/** Back arrow — leave the playtest and return to the editor/previous screen. */
export function BackGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 6 5 12l6 6" />
      <path d="M5 12h14" />
    </svg>
  );
}
