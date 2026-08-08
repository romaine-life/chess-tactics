// Q and E turn the formation being carried on the cursor.
//
// The pointer gesture (a secondary click) only turns one way, and a quarter turn is easy to
// overshoot — going three quarters of the way back round to undo one press is not a control.
// The keys give the missing direction, so E is clockwise and Q is counter-clockwise, matching
// the pair every other game binds to the same job.
import { useEffect } from 'react';
import { deleteKeyIsClaimedByPage } from './shared/deleteKeyAction';

export type FormationTurnDirection = 'clockwise' | 'counter-clockwise';

export interface FormationTurnKeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/**
 * Which way a keypress turns the carried formation, or null when it is not a turn at all.
 *
 * Matched on the character the key PRODUCES rather than its physical position, so the keys that
 * turn are the ones printed Q and E on the player's own keyboard — which is what the on-screen
 * hint names. Modifier chords belong to other verbs, and auto-repeat is refused so one press is
 * one quarter turn rather than a spin at the operating system's repeat rate.
 */
export function formationTurnKeyDirection(
  event: FormationTurnKeyChord,
): FormationTurnDirection | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'e') return 'clockwise';
  if (key === 'q') return 'counter-clockwise';
  return null;
}

/**
 * Bind Q and E to the carried formation's turn for as long as one is in hand.
 *
 * Pass null whenever the rail's turn buttons would be unavailable — no formation selected, the
 * screen departing, the wrong stage — so the keys and the buttons cannot drift apart.
 *
 * A field or an open dialog already owns a bare letter key; the same page-ownership rule the
 * Delete action uses decides that, and it is not Delete-specific: a text input is typing a
 * letter, and a modal's own controls are the only way out of it.
 */
export function useFormationTurnKeys(
  turn: ((direction: FormationTurnDirection) => void) | null | undefined,
): void {
  useEffect(() => {
    if (!turn || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const direction = formationTurnKeyDirection(event);
      if (!direction) return;
      if (deleteKeyIsClaimedByPage(event.target ?? document.activeElement)) return;
      event.preventDefault();
      turn(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn]);
}
