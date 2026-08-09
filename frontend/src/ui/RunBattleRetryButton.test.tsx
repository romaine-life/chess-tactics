import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RUN_BATTLE_RETRY_COST_TENTHS } from '../run/model';
import { RunBattleRetryButton } from './RunBattleRetryButton';

describe('RunBattleRetryButton', () => {
  it('states the canonical thirty-gold price and disables an unaffordable retry', () => {
    const markup = renderToStaticMarkup(
      <RunBattleRetryButton
        testId="retry-test"
        costTenths={RUN_BATTLE_RETRY_COST_TENTHS}
        canRetry={false}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Retry Battle for 30 gold"');
    expect(markup).toContain('data-ui-sfx="gold"');
    expect(markup).toContain('aria-label="30 gold"');
  });

  it('explains a disabled first-turn restart without hiding its price', () => {
    const markup = renderToStaticMarkup(
      <RunBattleRetryButton
        testId="retry-test"
        costTenths={RUN_BATTLE_RETRY_COST_TENTHS}
        canRetry={false}
        unavailableReason="Retry becomes available after the first turn."
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('title="Retry becomes available after the first turn."');
    expect(markup).toContain('aria-label="30 gold"');
  });
});
