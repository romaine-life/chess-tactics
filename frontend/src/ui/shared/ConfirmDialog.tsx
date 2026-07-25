// In-game confirmation dialog — the organic replacement for window.confirm() on player
// surfaces. A native confirm() paints browser chrome (OS font, OS buttons) over the game and
// shatters the ambience; this renders a kit-framed panel over a dimmed board instead, so a
// "are you sure?" reads as part of Chess Tactics, not the browser.
//
// Usage (keeps the imperative `if (!(await ask(...))) return;` shape of the old confirm):
//   const { ask, dialog } = useConfirm();
//   ... if (!(await ask({ title: 'Publish?', message: '…', confirmLabel: 'Publish' })) return;
//   return (<>{dialog}{/* the rest of the screen */}</>);
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

export type ConfirmTone = 'primary' | 'danger';

export interface ConfirmOptions {
  /** Short verb-led headline, e.g. "Publish to all players?" (rendered in the pixel display font). */
  title: string;
  /** Plain-language stakes — one or two sentences on what happens if they confirm. */
  message: ReactNode;
  /** Confirm-button label; defaults to "Confirm". Keep it the verb ("Publish", "Delete"). */
  confirmLabel?: string;
  /** Cancel-button label; defaults to "Cancel". */
  cancelLabel?: string;
  /** 'primary' (cyan, default) for constructive acts; 'danger' (red) for destructive ones. */
  tone?: ConfirmTone;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based confirm. `ask(opts)` opens the dialog and resolves true/false when the player
 * chooses; render `dialog` anywhere in the screen (it portals to <body>).
 */
export function useConfirm(): { ask: (opts: ConfirmOptions) => Promise<boolean>; dialog: ReactElement | null } {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const ask = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // If a prior prompt is somehow still open, resolve it false before replacing it.
      setPending((prev) => {
        prev?.resolve(false);
        return { ...opts, resolve };
      });
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    setPending((prev) => {
      prev?.resolve(confirmed);
      return null;
    });
  }, []);

  const dialog = pending
    ? <ConfirmDialog {...pending} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null;

  return { ask, dialog };
}

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Destructive dialogs default to the safe choice. Constructive dialogs retain the panel-level
    // Enter shortcut; a danger action requires the owner to move focus to its explicit button.
    const prevFocus = document.activeElement as HTMLElement | null;
    if (tone === 'danger') cancelButtonRef.current?.focus();
    else panelRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      else if (event.key === 'Enter' && tone !== 'danger') { event.preventDefault(); onConfirm(); }
      else if (event.key === 'Tab') {
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!focusable.length) { event.preventDefault(); panelRef.current?.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [onConfirm, onCancel, tone]);

  return createPortal(
    <div
      className="confirm-scrim chrome-family-surface"
      role="presentation"
      // Click the dimmed board (outside the panel) to cancel — the friendly out.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div ref={panelRef} tabIndex={-1} className="confirm-panel" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="confirm-body">{message}</div>
        <div className="confirm-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            data-testid="confirm-cancel"
            onClick={onCancel}
          >{cancelLabel}</button>
          <button
            type="button"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tone === 'danger' ? 'danger' : 'active')}
            data-testid="confirm-accept"
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
