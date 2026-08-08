import { describe, expect, it } from 'vitest';
import { formationTurnKeyDirection } from './formationTurnKeys';

const press = (over: Partial<Parameters<typeof formationTurnKeyDirection>[0]> = {}) => ({
  key: 'e',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  ...over,
});

describe('Formation turn keys', () => {
  // The pointer gesture only turns one way, so the keys exist to supply the other. Overshooting
  // a quarter turn must be undone by one press back, not by three more forward.
  it('turns clockwise on E and counter-clockwise on Q', () => {
    expect(formationTurnKeyDirection(press({ key: 'e' }))).toBe('clockwise');
    expect(formationTurnKeyDirection(press({ key: 'q' }))).toBe('counter-clockwise');
    expect(formationTurnKeyDirection(press({ key: 'E' }))).toBe('clockwise');
    expect(formationTurnKeyDirection(press({ key: 'Q' }))).toBe('counter-clockwise');
  });

  it('leaves every other key alone', () => {
    for (const key of ['r', 'w', 'a', 'd', ' ', 'Enter', 'Escape', 'ArrowLeft', 'Tab']) {
      expect(formationTurnKeyDirection(press({ key }))).toBeNull();
    }
  });

  // Modifier chords belong to other verbs — Ctrl+E is the browser's, not the board's.
  it('declines modifier chords', () => {
    expect(formationTurnKeyDirection(press({ ctrlKey: true }))).toBeNull();
    expect(formationTurnKeyDirection(press({ metaKey: true }))).toBeNull();
    expect(formationTurnKeyDirection(press({ altKey: true }))).toBeNull();
  });

  // One press is one quarter turn. A held key must not spin the formation at the operating
  // system's repeat rate.
  it('refuses auto-repeat so a held key does not spin the formation', () => {
    expect(formationTurnKeyDirection(press({ repeat: true }))).toBeNull();
    expect(formationTurnKeyDirection(press({ key: 'q', repeat: true }))).toBeNull();
  });
});
