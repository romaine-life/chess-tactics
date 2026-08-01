import type { Campaign, Level } from '../core/level';
import type { PersistedMatch } from '../game/matchPersistence';
import { runBattleActivityId, type RunDocument } from '../run/model';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';

export type ContinueActivityIcon = 'solo-skirmish' | 'campaign-editor';

export interface ContinueActivity {
  label: string;
  detail: string;
  href: string;
  icon: ContinueActivityIcon;
}

function parsedTime(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function continueActivity(
  run: RunDocument | null,
  match: PersistedMatch | null,
  campaigns: readonly Campaign[],
  levels: Record<string, Level>,
): ContinueActivity | null {
  const matchBelongsToRun = Boolean(
    run
    && run.phase === 'battle'
    && match?.activityId === runBattleActivityId(run.id, run.battleIndex),
  );
  const runTime = parsedTime(run?.updatedAt);
  const matchTime = parsedTime(match?.savedAt);
  if (run && (matchBelongsToRun || !match || runTime >= matchTime)) {
    const phase = run.phase === 'battle'
      ? `Battle ${run.battleIndex + 1} of ${run.war.battles.length}`
      : run.phase === 'shop'
        ? `Shop after Battle ${run.battleIndex + 1}`
        : run.phase === 'victory'
          ? 'War won'
          : run.phase === 'deployment'
            ? `Deploy for Battle ${run.battleIndex + 1}`
            : 'Opening muster';
    return {
      label: 'Continue Run',
      detail: `${run.war.name} · ${phase}`,
      href: PLAY_RUN_SELECTOR_HREF,
      icon: 'campaign-editor',
    };
  }
  if (!match?.levelId) return null;
  const campaign = campaigns.find((candidate) => candidate.levels.some((ref) => ref.levelId === match.levelId));
  const level = levels[match.levelId];
  if (campaign) {
    return {
      label: 'Continue Campaign',
      detail: `${campaign.name} · ${level?.name ?? 'Current Battle'}`,
      href: `/play?campaignId=${encodeURIComponent(campaign.id)}&levelId=${encodeURIComponent(match.levelId)}`,
      icon: 'campaign-editor',
    };
  }
  return {
    label: 'Continue Skirmish',
    detail: level?.name ?? 'Current Battle',
    href: `/play?levelId=${encodeURIComponent(match.levelId)}`,
    icon: 'solo-skirmish',
  };
}
