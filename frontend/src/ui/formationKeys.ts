// The keyboard for arranging a hand of formations.
//
// Q and E turn the formation being carried; W and S step through the dealt cards. The pointer
// gesture only turns one way, and the hand shows one card at a time, so both pairs supply a
// direction the mouse alone cannot reach. They sit under the same hand on the keyboard because
// they are the same job: pick a formation, face it, place it.
import { useEffect } from 'react';
import { deleteKeyIsClaimedByPage } from './shared/deleteKeyAction';

export type FormationTurnDirection = 'clockwise' | 'counter-clockwise';

export interface FormationKeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** What a keypress does to the hand, or null when it is not one of these keys. */
export type FormationKeyAction =
  | { kind: 'turn'; direction: FormationTurnDirection }
  | { kind: 'step'; step: 1 | -1 };

/**
 * Matched on the character the key PRODUCES rather than its physical position, so the keys that
 * act are the ones printed Q/E and W/S on the player's own keyboard — which is what the on-screen
 * hints name. Modifier chords belong to other verbs, and auto-repeat is refused so one press is
 * one quarter turn or one card rather than a spin at the operating system's repeat rate.
 */
export function formationKeyAction(event: FormationKeyChord): FormationKeyAction | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case 'e': return { kind: 'turn', direction: 'clockwise' };
    case 'q': return { kind: 'turn', direction: 'counter-clockwise' };
    case 's': return { kind: 'step', step: 1 };
    case 'w': return { kind: 'step', step: -1 };
    default: return null;
  }
}

/** Which way a keypress turns the carried formation, or null when it is not a turn. */
export function formationTurnKeyDirection(
  event: FormationKeyChord,
): FormationTurnDirection | null {
  const action = formationKeyAction(event);
  return action?.kind === 'turn' ? action.direction : null;
}

/**
 * Bind the arranging keyboard for as long as a hand is in play.
 *
 * Pass null for either verb whenever the control it mirrors would be unavailable — no formation
 * selected, the screen departing, the wrong stage — so the keys and the buttons cannot drift
 * apart. Passing null for both unbinds the listener entirely.
 *
 * A field or an open dialog already owns a bare letter key; the same page-ownership rule the
 * Delete action uses decides that, and it is not Delete-specific: a text input is typing a
 * letter, and a modal's own controls are the only way out of it.
 */
export function useFormationKeys({ turn, step }: {
  turn?: ((direction: FormationTurnDirection) => void) | null;
  step?: ((step: 1 | -1) => void) | null;
}): void {
  useEffect(() => {
    if ((!turn && !step) || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = formationKeyAction(event);
      if (!action) return;
      if (action.kind === 'turn' && !turn) return;
      if (action.kind === 'step' && !step) return;
      if (deleteKeyIsClaimedByPage(event.target ?? document.activeElement)) return;
      event.preventDefault();
      if (action.kind === 'turn') turn?.(action.direction);
      else step?.(action.step);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, turn]);
}
