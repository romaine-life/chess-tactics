import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS,
  RUN_DEPLOYMENT_REROLL_COST_TENTHS,
} from '../run/model';
import { RunDeploymentRerollButton } from './RunDeploymentRerollButton';

describe('RunDeploymentRerollButton', () => {
  it('states the ten-gold Deployment price', () => {
    const markup = renderToStaticMarkup(
      <RunDeploymentRerollButton
        testId="deployment-reroll-test"
        costTenths={RUN_DEPLOYMENT_REROLL_COST_TENTHS}
        canReroll
        onReroll={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Reroll deployment for 10 gold"');
    expect(markup).toContain('Redo every unit placement.');
    expect(markup).toContain('data-ui-sfx="gold"');
    expect(markup).toContain('aria-label="10 gold"');
  });

  it('states the fifty-gold Battle price and disables an unaffordable reroll', () => {
    const markup = renderToStaticMarkup(
      <RunDeploymentRerollButton
        testId="battle-deployment-reroll-test"
        costTenths={RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS}
        canReroll={false}
        onReroll={vi.fn()}
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Reroll deployment for 50 gold"');
    expect(markup).toContain('title="Reroll deployment costs 50 gold."');
    expect(markup).toContain('aria-label="50 gold"');
  });

  it('keeps the paid action visibly occupied while units withdraw', () => {
    const markup = renderToStaticMarkup(
      <RunDeploymentRerollButton
        testId="deployment-reroll-departing"
        costTenths={RUN_DEPLOYMENT_REROLL_COST_TENTHS}
        canReroll
        departing
        onReroll={vi.fn()}
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Units withdrawing for deployment reroll');
    expect(markup).toContain('Withdrawing…');
  });
});
