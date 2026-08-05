import { describe, expect, it } from 'vitest';
import { runBattlePresentationKey } from './Skirmish';

describe('Run Deployment promotion identity', () => {
  it('promotes a rerolled formation again without changing the mounted Battle activity', () => {
    const activityId = 'run:run-1:battle:0';
    expect(runBattlePresentationKey(activityId, 101)).not.toBe(runBattlePresentationKey(activityId, 202));
    expect(runBattlePresentationKey(activityId, 101)).toBe(runBattlePresentationKey(activityId, 101));
  });
});
