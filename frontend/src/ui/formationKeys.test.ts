import { describe, expect, it } from 'vitest';
import { formationKeyAction, formationTurnKeyDirection } from './formationKeys';

const press = (over: Partial<Parameters<typeof formationKeyAction>[0]> = {}) => ({
  key: 'e',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  ...over,
});

describe('Formation arranging keys', () => {
  // The pointer gesture only turns one way, so the keys exist to supply the other. Overshooting
  // a quarter turn must be undone by one press back, not by three more forward.
  it('turns clockwise on E and counter-clockwise on Q', () => {
    expect(formationKeyAction(press({ key: 'e' }))).toEqual({ kind: 'turn', direction: 'clockwise' });
    expect(formationKeyAction(press({ key: 'q' }))).toEqual({ kind: 'turn', direction: 'counter-clockwise' });
    expect(formationTurnKeyDirection(press({ key: 'E' }))).toBe('clockwise');
    expect(formationTurnKeyDirection(press({ key: 'Q' }))).toBe('counter-clockwise');
  });

  // The hand shows one card at a time, so W and S are how the rest of it is reached.
  it('steps back on W and forward on S', () => {
    expect(formationKeyAction(press({ key: 'w' }))).toEqual({ kind: 'step', step: -1 });
    expect(formationKeyAction(press({ key: 's' }))).toEqual({ kind: 'step', step: 1 });
    expect(formationKeyAction(press({ key: 'W' }))).toEqual({ kind: 'step', step: -1 });
    expect(formationKeyAction(press({ key: 'S' }))).toEqual({ kind: 'step', step: 1 });
    // Stepping is not turning, so the turn reader must not claim them.
    expect(formationTurnKeyDirection(press({ key: 'w' }))).toBeNull();
    expect(formationTurnKeyDirection(press({ key: 's' }))).toBeNull();
  });

  it('leaves every other key alone', () => {
    for (const key of ['r', 'a', 'd', ' ', 'Enter', 'Escape', 'ArrowLeft', 'Tab']) {
      expect(formationKeyAction(press({ key }))).toBeNull();
    }
  });

  // Modifier chords belong to other verbs — Ctrl+E is the browser's, not the board's, and
  // Ctrl+W would close the tab.
  it('declines modifier chords', () => {
    for (const key of ['e', 'q', 'w', 's']) {
      expect(formationKeyAction(press({ key, ctrlKey: true }))).toBeNull();
      expect(formationKeyAction(press({ key, metaKey: true }))).toBeNull();
      expect(formationKeyAction(press({ key, altKey: true }))).toBeNull();
    }
  });

  // One press is one quarter turn, or one card. A held key must not run at the operating
  // system's repeat rate.
  it('refuses auto-repeat', () => {
    for (const key of ['e', 'q', 'w', 's']) {
      expect(formationKeyAction(press({ key, repeat: true }))).toBeNull();
    }
  });
});
