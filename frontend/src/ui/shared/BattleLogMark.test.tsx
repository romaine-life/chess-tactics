import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { installedUiMedia } from '../installedUiMedia';
import { logNote } from '../../game/store';
import {
  BATTLE_LOG_FORGED_MARKS,
  BATTLE_LOG_MARK_MEDIA_ROLE,
  BATTLE_LOG_MARK_SLOT,
  BattleLogMarks,
  EventLogRow,
  battleLogForgedMarkUrl,
  isBattleLogForgedMark,
} from './BattleLogMark';

describe('BattleLogMarks', () => {
  it('names one slot and one app-ui role per forged mark, so two seats cannot drift', () => {
    // Outcomes first, then the causes they pair with — the order a row wears them.
    expect(BATTLE_LOG_FORGED_MARKS)
      .toEqual(['victory', 'defeat', 'draw', 'checkmate', 'resign', 'check', 'gold', 'gold-loss']);
    for (const mark of BATTLE_LOG_FORGED_MARKS) {
      expect(BATTLE_LOG_MARK_SLOT[mark]).toBe(`ui/kit/icons/game/${mark}.png`);
      expect(BATTLE_LOG_MARK_MEDIA_ROLE[mark]).toBe(`ui-kit-icons-game-${mark}-png`);
    }
    // The borrowed marks have no slot here on purpose — a slot for the clock or the coin
    // would be a second drawing of a fact the game already draws (ADR-0059).
    expect(isBattleLogForgedMark('clock')).toBe(false);
    // `gold` IS forged: the Run's coin is a RESOURCE mark stating no direction, and a payout
    // needs one, so this is a different fact rather than the same fact drawn twice.
    expect(isBattleLogForgedMark('gold')).toBe(true);
    expect(isBattleLogForgedMark('gold-loss')).toBe(true);
    expect(isBattleLogForgedMark('objective')).toBe(false);
  });

  it('draws nothing at all for an unmarked line', () => {
    expect(renderToStaticMarkup(<BattleLogMarks marks={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<BattleLogMarks marks={[]} />)).toBe('');
  });

  it('keeps every forged seat before its art decision exists', () => {
    // Reserved, not fail-closed (ADR-0318): the seat holds its box so installing a mark
    // later cannot shift the line beside it.
    for (const mark of BATTLE_LOG_FORGED_MARKS) {
      expect(battleLogForgedMarkUrl(mark)).toBeNull();
      const markup = renderToStaticMarkup(<BattleLogMarks marks={[mark]} />);
      expect(markup).toContain(`data-battle-log-mark="${mark}"`);
      expect(markup).not.toContain('<img');
    }
  });

  it('wears outcome and cause together, in the order the line wrote them', () => {
    const markup = renderToStaticMarkup(<BattleLogMarks marks={['defeat', 'clock']} />);
    expect(markup.indexOf('data-battle-log-mark="defeat"'))
      .toBeLessThan(markup.indexOf('data-battle-log-mark="clock"'));
    // The label is where the replaced words still exist: a row with no text at all still
    // reads as a sentence to a screen reader.
    expect(markup).toContain('aria-label="Defeat, Out of time"');
  });

  it('reuses the marks the game already has for the clock and the flag', () => {
    // Not a second forged hourglass, flag or coin (ADR-0059) — the title bar's own glyphs and
    // the Run's own coin components, so the log agrees with the screen beside it. Asserted
    // against the resolved role, which is what proves it is the SAME installed bytes rather
    // than a lookalike that happens to be an hourglass.
    expect(renderToStaticMarkup(<BattleLogMarks marks={['clock']} />))
      .toContain(`src="${installedUiMedia('ui-kit-icons-game-wait-png')}"`);
    expect(renderToStaticMarkup(<BattleLogMarks marks={['objective']} />))
      .toContain(`src="${installedUiMedia('ui-kit-icons-game-objective-png')}"`);
  });

  it('paints exact candidate bytes in the real seat for a review, without installing them', () => {
    const markup = renderToStaticMarkup(
      <BattleLogMarks marks={['defeat']} forgedSrc={{ defeat: "/api/admin/media/abc" }} />,
    );
    expect(markup).toContain('src="/api/admin/media/abc"');
  });
});

describe('EventLogRow', () => {
  it('spends the move-number column on a prose row’s marks', () => {
    const markup = renderToStaticMarkup(
      <EventLogRow entry={logNote('Out of time', 'defeat', 'clock')} />,
    );
    expect(markup).toContain('class="is-note"');
    expect(markup).toContain('data-battle-log-mark="defeat"');
    expect(markup).toContain('data-battle-log-mark="clock"');
    // The marks are INSIDE the number column, not a fourth cell bolted onto the grid —
    // that is what keeps a marked row and a numbered row starting their text in one place.
    expect(markup).toMatch(/<strong><span class="skirmish-log-marks"/);
  });

  it('leaves a move row exactly as it was: its number, and no marks', () => {
    const markup = renderToStaticMarkup(
      <EventLogRow entry={{ text: 'Nxb5+', side: 'player', ply: 10 }} />,
    );
    expect(markup).toContain('is-move is-player');
    expect(markup).toContain('<strong>6.</strong>');
    expect(markup).not.toContain('data-battle-log-mark');
  });

  it('draws an unmarked prose row with an empty number column', () => {
    const markup = renderToStaticMarkup(<EventLogRow entry={logNote('Check!')} />);
    expect(markup).toContain('<strong></strong>');
    expect(markup).not.toContain('data-battle-log-mark');
  });

  it('makes a row pressable only when a recorded board exists to show', () => {
    const entry = { text: 'Nxb5+', side: 'player' as const, ply: 10 };
    expect(renderToStaticMarkup(<EventLogRow entry={entry} seat={4} onReview={() => {}} />))
      .toContain('class="skirmish-log-move"');
    // No seat, or no handler (the review surface mounts it without one), stays plain text.
    expect(renderToStaticMarkup(<EventLogRow entry={entry} seat={null} onReview={() => {}} />))
      .not.toContain('skirmish-log-move');
    expect(renderToStaticMarkup(<EventLogRow entry={entry} seat={4} />))
      .not.toContain('skirmish-log-move');
  });

  it('marks the row whose board is on screen', () => {
    const markup = renderToStaticMarkup(
      <EventLogRow entry={{ text: 'Nxb5+', side: 'player', ply: 10 }} seat={4} showing onReview={() => {}} />,
    );
    expect(markup).toContain('is-showing');
    expect(markup).toContain('aria-current="true"');
  });
});
