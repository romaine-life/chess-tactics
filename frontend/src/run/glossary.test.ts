import { describe, expect, it } from 'vitest';
import { RUN_GLOSSARY, splitRunGlossaryText } from './glossary';

describe('the temporarily empty Run glossary', () => {
  it('contains no retired ability vocabulary', () => {
    expect(RUN_GLOSSARY).toEqual([]);
  });

  it('passes ordinary copy through as one plain segment', () => {
    expect(splitRunGlossaryText('Deploy the formation shown on the card.')).toEqual([
      { text: 'Deploy the formation shown on the card.', entry: null },
    ]);
  });
});
