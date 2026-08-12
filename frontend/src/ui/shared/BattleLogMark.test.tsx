import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { installedUiMedia } from '../installedUiMedia';
import { logNote } from '../../game/store';
import {
  BATTLE_LOG_MARK_MEDIA_ROLE,
  BATTLE_LOG_MARK_SLOT,
  BattleLogMarks,
  EventLogRow,
  battleLogDefeatMarkUrl,
} from './BattleLogMark';

describe('BattleLogMarks', () => {
  it('names one slot and one app-ui role, so a second seat cannot answer to different art', () => {
    expect(BATTLE_LOG_MARK_MEDIA_ROLE).toBe('ui-kit-icons-game-defeat-png');
    expect(BATTLE_LOG_MARK_SLOT).toBe('ui/kit/icons/game/defeat.png');
  });

  it('draws nothing at all for an unmarked line', () => {
    expect(renderToStaticMarkup(<BattleLogMarks marks={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<BattleLogMarks marks={[]} />)).toBe('');
  });

  it('keeps the defeat seat before its art decision exists', () => {
    // Reserved, not fail-closed (ADR-0318): the seat holds its box so installing a mark
    // later cannot shift the line beside it.
    expect(battleLogDefeatMarkUrl()).toBeNull();
    const markup = renderToStaticMarkup(<BattleLogMarks marks={['defeat']} />);
    expect(markup).toContain('data-battle-log-mark="defeat"');
    expect(markup).not.toContain('<img');
  });

  it('wears outcome and cause together, in the order the line wrote them', () => {
    const markup = renderToStaticMarkup(<BattleLogMarks marks={['defeat', 'clock']} />);
    expect(markup.indexOf('data-battle-log-mark="defeat"'))
      .toBeLessThan(markup.indexOf('data-battle-log-mark="clock"'));
    expect(markup).toContain('aria-label="Defeat, Clock"');
  });

  it('reuses the installed marks the game already has for the clock and the coin', () => {
    // Not a second forged hourglass and not a second coin (ADR-0059) — the title bar's own
    // glyph and the Run's own RunGoldIcon, so the log agrees with the screen beside it.
    // Asserted against the resolved role, which is what proves it is the SAME installed
    // bytes rather than a lookalike that happens to be an hourglass.
    expect(renderToStaticMarkup(<BattleLogMarks marks={['clock']} />))
      .toContain(`src="${installedUiMedia('ui-kit-icons-game-wait-png')}"`);
    expect(renderToStaticMarkup(<BattleLogMarks marks={['gold']} />)).toContain('run-gold-icon');
  });

  it('paints exact candidate bytes in the real seat for a review, without installing them', () => {
    const markup = renderToStaticMarkup(
      <BattleLogMarks marks={['defeat']} defeatSrc="/api/admin/media/abc" />,
    );
    expect(markup).toContain('src="/api/admin/media/abc"');
  });
});

describe('EventLogRow', () => {
  it('spends the move-number column on a prose row’s marks', () => {
    const markup = renderToStaticMarkup(
      <EventLogRow entry={logNote('Defeat — your clock ran out.', 'defeat', 'clock')} />,
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
