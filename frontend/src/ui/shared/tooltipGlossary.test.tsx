import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CACOCHYMIC_DESCRIPTION,
  CACOCHYMIC_DISPLAY_NAME,
  RUN_CARD_TYPE_REFERENCE,
} from '../../run/model';
import { readTooltipGlossary } from './tooltipGlossary';

function read(children: React.ReactNode, title: React.ReactNode = null) {
  const { content, entries } = readTooltipGlossary(children, title);
  return { entries, markup: renderToStaticMarkup(<>{content}</>) };
}

describe('tooltip keyword glossary', () => {
  it('defines the mechanic a card property tip names', () => {
    const { entries, markup } = read(
      <span>{RUN_CARD_TYPE_REFERENCE.legatine.effect}</span>,
      'Legatine',
    );
    expect(entries.map((entry) => entry.id)).toEqual(['adlected']);
    expect(entries[0]?.term).toBe('Adlected');
    expect(markup).toContain('<b class="tooltip-keyword" data-glossary-term="adlected">Adlected</b>');
    // The rest of the sentence is untouched text, not a rebuilt string.
    expect(markup).toContain('to one contained unit when the card is acquired.');
  });

  it('does not restate the very thing the tip is about', () => {
    const { entries } = read(<span>{CACOCHYMIC_DESCRIPTION}</span>, CACOCHYMIC_DISPLAY_NAME);
    expect(entries).toEqual([]);
    const selfNamed = read(
      <span>{`A ${CACOCHYMIC_DISPLAY_NAME} unit is lost after the next victorious Battle.`}</span>,
      CACOCHYMIC_DISPLAY_NAME,
    );
    expect(selfNamed.entries).toEqual([]);
    expect(selfNamed.markup).not.toContain('tooltip-keyword');
  });

  it('reaches a term nested inside the caller’s own markup', () => {
    const { entries, markup } = read(
      <span><span>Grants Adlected on purchase.</span><small>Lipsanon source</small></span>,
    );
    expect(entries.map((entry) => entry.id)).toEqual(['adlected']);
    expect(markup).toContain('tooltip-keyword');
    expect(markup).toContain('Lipsanon source');
  });

  it('defines each named mechanic once, in reading order', () => {
    const { entries } = read(
      <span>Pestiferous cards mark a unit Cacochymic; Pestiferous offers are discounted.</span>,
    );
    expect(entries.map((entry) => entry.id)).toEqual(['pestiferous', 'cacochymic']);
  });

  it('stops at three definitions and leaves the overflow unmarked', () => {
    const { entries, markup } = read(
      <span>Legatine, Concinnous, Hieratic and Pestiferous cards exist.</span>,
    );
    expect(entries.map((entry) => entry.id)).toEqual(['legatine', 'concinnous', 'hieratic']);
    // A mark that points at no definition below it would be a broken promise.
    expect(markup).not.toContain('data-glossary-term="pestiferous"');
    expect(markup).toContain('Pestiferous cards exist.');
  });

  it('leaves a tip that names nothing exactly as its caller wrote it', () => {
    const { entries, markup } = read(<span>Sell this unit for half its gold value.</span>);
    expect(entries).toEqual([]);
    expect(markup).toBe('<span>Sell this unit for half its gold value.</span>');
  });
});
