import { describe, expect, it } from 'vitest';
import { deleteKeyIsClaimedByTarget, isDeleteKeyChord } from './deleteKeyAction';

const chord = (over: Partial<Parameters<typeof isDeleteKeyChord>[0]> = {}) => ({
  key: 'Delete', ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...over,
});

describe('the Delete key chord', () => {
  it('accepts a bare Delete or Backspace press', () => {
    expect(isDeleteKeyChord(chord())).toBe(true);
    expect(isDeleteKeyChord(chord({ key: 'Backspace' }))).toBe(true);
    expect(isDeleteKeyChord(chord({ key: 'Del' }))).toBe(true);
  });

  it('leaves modifier chords and other keys to whoever owns them', () => {
    expect(isDeleteKeyChord(chord({ ctrlKey: true }))).toBe(false);
    expect(isDeleteKeyChord(chord({ metaKey: true }))).toBe(false);
    expect(isDeleteKeyChord(chord({ altKey: true }))).toBe(false);
    expect(isDeleteKeyChord(chord({ key: 'x' }))).toBe(false);
  });

  it('runs a destructive action once per press, not once per auto-repeat', () => {
    expect(isDeleteKeyChord(chord({ repeat: true }))).toBe(false);
  });
});

describe('who already owns the keypress', () => {
  it('stands down inside a field where Delete edits text', () => {
    expect(deleteKeyIsClaimedByTarget({ tagName: 'input', inputType: null })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'input', inputType: 'text' })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'INPUT', inputType: 'number' })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'SELECT' })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'SPAN', insideContentEditable: true })).toBe(true);
  });

  it('still fires from a control that holds no text', () => {
    for (const inputType of ['range', 'checkbox', 'radio', 'button', 'color', 'file']) {
      expect(deleteKeyIsClaimedByTarget({ tagName: 'INPUT', inputType })).toBe(false);
    }
    expect(deleteKeyIsClaimedByTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'DIV', insideContentEditable: false })).toBe(false);
    expect(deleteKeyIsClaimedByTarget({ tagName: null })).toBe(false);
  });

  it('stands down for the whole page while a modal is asking a question', () => {
    expect(deleteKeyIsClaimedByTarget({ tagName: 'DIV', modalOpen: true })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'BUTTON', modalOpen: true })).toBe(true);
    expect(deleteKeyIsClaimedByTarget({ tagName: 'DIV', modalOpen: false })).toBe(false);
  });
});
