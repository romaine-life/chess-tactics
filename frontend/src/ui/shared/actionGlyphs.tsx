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
