import type { Campaign, Level } from '../core/level';
import type { PersistedMatch } from '../game/matchPersistence';
import { ATARAXIA_BY_TIER, formatGold, runBattleActivityId, type RunDocument } from '../run/model';
import { playContinueSelectorHref, type PlayContinueChoice } from './playHubRoute';
import { playSkirmishLevelHref } from './skirmishMaps';
import { isSkirmishProfileLevel } from './skirmishProfiles';

export interface ContinueActivity {
  mode: PlayContinueChoice;
  summary: string;
  title: string;
  playHref: string;
  updatedAt: number;
  facts: readonly { label: string; value: string }[];
}

export interface ContinueOption {
  mode: PlayContinueChoice;
  label: string;
  activity: ContinueActivity | null;
}

export interface ContinueInventory {
  options: readonly ContinueOption[];
  defaultMode: PlayContinueChoice | null;
}

function parsedTime(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function runPhase(run: RunDocument): string {
  return run.phase === 'battle'
    ? `Battle ${run.battleIndex + 1} of ${run.war.battles.length}`
    : run.phase === 'shop'
      ? `Shop after Battle ${run.battleIndex + 1}`
      : run.phase === 'victory'
        ? 'War won'
        : run.phase === 'deployment'
          ? `Deploy for Battle ${run.battleIndex + 1}`
          : 'Opening muster';
}

export function continueInventory(
  run: RunDocument | null,
  match: PersistedMatch | null,
  campaigns: readonly Campaign[],
  levels: Record<string, Level>,
): ContinueInventory {
  const matchBelongsToRun = Boolean(
    run
    && run.phase === 'battle'
    && match?.activityId === runBattleActivityId(run.id, run.battleIndex),
  );
  const runTime = parsedTime(run?.updatedAt);
  const matchTime = parsedTime(match?.savedAt);
  const activities = new Map<PlayContinueChoice, ContinueActivity>();

  if (run) {
    const phase = runPhase(run);
    activities.set('run', {
      mode: 'run',
      summary: `${run.war.name} · ${phase}`,
      title: 'Current Run',
      playHref: '/run',
      updatedAt: matchBelongsToRun ? Math.max(runTime, matchTime) : runTime,
      facts: [
        { label: 'War', value: run.war.name },
        { label: 'Progress', value: phase },
        { label: 'Army', value: `${run.army.length} units` },
        { label: 'Gold', value: formatGold(run.goldTenths) },
        { label: 'Ataraxia', value: ATARAXIA_BY_TIER[run.ataraxiaTier].label },
      ],
    });
  }

  if (match?.levelId && !matchBelongsToRun) {
    const level = levels[match.levelId];
    const campaign = campaigns.find((candidate) => candidate.levels.some((ref) => ref.levelId === match.levelId));
    if (level && campaign) {
      activities.set('campaign', {
        mode: 'campaign',
        summary: `${campaign.name} · ${level.name}`,
        title: campaign.name,
        playHref: `/play?campaignId=${encodeURIComponent(campaign.id)}&levelId=${encodeURIComponent(match.levelId)}`,
        updatedAt: matchTime,
        facts: [
          { label: 'Mode', value: 'Campaign' },
          { label: 'Battle', value: level.name },
        ],
      });
    } else if (level) {
      const mode: PlayContinueChoice = isSkirmishProfileLevel(level) ? 'skirmish' : 'levels';
      activities.set(mode, {
        mode,
        summary: level.name,
        title: level.name,
        playHref: playSkirmishLevelHref(match.levelId, playContinueSelectorHref(mode)),
        updatedAt: matchTime,
        facts: [
          { label: 'Mode', value: mode === 'skirmish' ? 'Skirmish' : 'Levels' },
          { label: 'Battle', value: 'In progress' },
        ],
      });
    }
  }

  const options: ContinueOption[] = [
    { mode: 'campaign', label: 'Campaign', activity: activities.get('campaign') ?? null },
    { mode: 'skirmish', label: 'Skirmish', activity: activities.get('skirmish') ?? null },
    { mode: 'run', label: 'Run', activity: activities.get('run') ?? null },
    { mode: 'levels', label: 'Levels', activity: activities.get('levels') ?? null },
  ];
  const mostRecent = options
    .filter((option): option is ContinueOption & { activity: ContinueActivity } => Boolean(option.activity))
    .sort((left, right) => right.activity.updatedAt - left.activity.updatedAt)[0];
  return { options, defaultMode: mostRecent?.mode ?? null };
}
