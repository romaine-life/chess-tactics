// The Delete key IS the Delete button.
//
// Every surface that ships a Delete/Remove action for a SELECTED object registers that same
// action here, so pressing Delete does exactly what pressing the button does — including opening
// the button's confirmation dialog and honouring whatever guard disables it. Nothing in this file
// deletes anything itself; it only forwards the key to an action the page already exposes, which
// is what keeps the key and the button from drifting apart.
//
// Scope rule for callers: register the action for the most specific selected ITEM, never a
// container-level delete (a whole War, campaign, level document, or library). A stray keypress
// must not be able to remove the thing the selection lives inside.
import { useEffect, useRef } from 'react';

/** Input controls where Delete already means "edit this value", so the page action stands down. */
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Inputs that hold no text: Delete does nothing to them, so the page action still applies. */
const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit',
]);

export interface DeleteKeyChordEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/**
 * Bare Delete (or Backspace, which is the same gesture on a keyboard without a Delete key).
 *
 * Modifier chords belong to other verbs, and a held key must not run a destructive action once per
 * repeat — the author pressed Delete once and meant it once.
 */
export function isDeleteKeyChord(event: DeleteKeyChordEvent): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === 'Delete' || event.key === 'Del' || event.key === 'Backspace';
}

/** What the page looks like at the moment of the keypress, independent of any DOM. */
export interface DeleteKeyTarget {
  /** Tag name of whatever had focus, or null when nothing did. */
  tagName: string | null;
  /** The `type` attribute when the target is an input. */
  inputType?: string | null;
  /** The target sits inside editable rich text. */
  insideContentEditable?: boolean;
  /** Any modal is open anywhere on the page. */
  modalOpen?: boolean;
}

/**
 * Whether something on screen owns this keypress already: a field where Delete edits text, or an
 * open modal, whose own buttons are the only way out of it.
 */
export function deleteKeyIsClaimedByTarget(target: DeleteKeyTarget): boolean {
  // A modal is answering a question of its own, so the surface underneath must not act on a
  // keypress aimed at the dialog.
  if (target.modalOpen) return true;
  if (target.insideContentEditable) return true;
  const tag = target.tagName?.toUpperCase() ?? null;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((target.inputType ?? 'text').toLowerCase());
  return tag !== null && TEXT_ENTRY_TAGS.has(tag);
}

/** Read the live page into a {@link DeleteKeyTarget} and apply the rule above. */
export function deleteKeyIsClaimedByPage(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  const doc = element?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  return deleteKeyIsClaimedByTarget({
    tagName: element?.tagName ?? null,
    inputType: element?.getAttribute('type') ?? null,
    insideContentEditable: Boolean(element?.closest('[contenteditable]:not([contenteditable="false"])')),
    modalOpen: Boolean(doc?.querySelector('[aria-modal="true"]')),
  });
}

interface DeleteKeyRegistration {
  run: (() => void) | null;
}

// Innermost-wins: a picker or workspace mounted over a page shadows the page's own action for as
// long as it is open, and the page gets it back untouched when the overlay closes.
const registrations: DeleteKeyRegistration[] = [];
let listening = false;

function handleKeyDown(event: KeyboardEvent): void {
  if (!isDeleteKeyChord(event)) return;
  if (deleteKeyIsClaimedByPage(event.target ?? document.activeElement)) return;
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    const run = registrations[index].run;
    if (!run) continue;
    event.preventDefault();
    run();
    return;
  }
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('keydown', handleKeyDown);
  listening = true;
}

function stopListening(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeyDown);
  listening = false;
}

/**
 * Make the Delete key run this page's delete action.
 *
 * Pass the very function the page's Delete button calls, and pass `null` whenever that button
 * would be disabled — nothing selected, read-only session, wrong workspace. An inert registration
 * lets an outer surface answer the key instead of swallowing it.
 */
export function useDeleteKeyAction(action: (() => void) | null | undefined): void {
  const registration = useRef<DeleteKeyRegistration>({ run: null });
  registration.current.run = action ?? null;
  useEffect(() => {
    const entry = registration.current;
    registrations.push(entry);
    startListening();
    return () => {
      const index = registrations.indexOf(entry);
      if (index >= 0) registrations.splice(index, 1);
      if (!registrations.length) stopListening();
    };
  }, []);
}
