// The keyboard for arranging a hand of formations.
//
// Q and E turn the formation being carried; W and S step through the dealt cards. The pointer
// gesture only turns one way, and the hand shows one card at a time, so both pairs supply a
// direction the mouse alone cannot reach. They sit under the same hand on the keyboard because
// they are the same job: pick a formation, face it, place it.
//
// Space is the other thumb: confirm the arrangement and go. It is the one key here the player
// reaches for without looking, which is exactly why it is the key that leaves the screen.
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
  | { kind: 'step'; step: 1 | -1 }
  | { kind: 'begin' };

/**
 * Matched on the character the key PRODUCES rather than its physical position, so the keys that
 * act are the ones printed Q/E and W/S on the player's own keyboard — which is what the on-screen
 * hints name. Modifier chords belong to other verbs, and auto-repeat is refused so one press is
 * one quarter turn or one card rather than a spin at the operating system's repeat rate.
 *
 * `Spacebar` is the name older engines gave the same key; both spellings are the one key the
 * player pressed.
 */
export function formationKeyAction(event: FormationKeyChord): FormationKeyAction | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case 'e': return { kind: 'turn', direction: 'clockwise' };
    case 'q': return { kind: 'turn', direction: 'counter-clockwise' };
    case 's': return { kind: 'step', step: 1 };
    case 'w': return { kind: 'step', step: -1 };
    case ' ': case 'spacebar': return { kind: 'begin' };
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
 * Pass null for any verb whenever the control it mirrors would be unavailable — no formation
 * selected, the screen departing, the wrong stage — so the keys and the buttons cannot drift
 * apart. Passing null for all of them unbinds the listener entirely.
 *
 * `begin` is the exception to that rule, and deliberately: pass it for the WHOLE arranging stage
 * and let it refuse from inside when Begin Battle would be disabled. Space natively activates
 * whatever button holds focus, and after a placement that is the board square the player just
 * clicked — so a Space the screen declined to swallow would seat or take back a formation nobody
 * aimed at. Claiming it for the stage and preventing the default is what stops that; Enter still
 * activates the focused control for anyone driving the panel from the keyboard alone.
 *
 * A field or an open dialog already owns these keys; the same page-ownership rule the Delete
 * action uses decides that, and it is not Delete-specific: a text input is typing a letter or a
 * space, and a modal's own controls are the only way out of it.
 */
export function useFormationKeys({ turn, step, begin }: {
  turn?: ((direction: FormationTurnDirection) => void) | null;
  step?: ((step: 1 | -1) => void) | null;
  begin?: (() => void) | null;
}): void {
  useEffect(() => {
    if ((!turn && !step && !begin) || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = formationKeyAction(event);
      if (!action) return;
      if (action.kind === 'turn' && !turn) return;
      if (action.kind === 'step' && !step) return;
      if (action.kind === 'begin' && !begin) return;
      if (deleteKeyIsClaimedByPage(event.target ?? document.activeElement)) return;
      event.preventDefault();
      if (action.kind === 'turn') turn?.(action.direction);
      else if (action.kind === 'step') step?.(action.step);
      else begin?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [begin, step, turn]);
}
