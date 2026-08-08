import type { Campaign, Level } from '../core/level';
import type { PersistedMatch } from '../game/matchPersistence';
import { ATARAXIA_BY_TIER, formatGold, runBattleActivityId, type RunDocument } from '../run/model';
import { playContinueSelectorHref, type PlayContinueChoice } from './playHubRoute';
import { playSkirmishLevelHref } from './skirmishMaps';
import { isSkirmishProfileLevel } from './skirmishProfiles';
import { playModeEntryEnabled } from './playModeAvailability';

export interface ContinueActivity {
  mode: PlayContinueChoice;
  summary: string;
  title: string;
  playHref: string;
  updatedAt: number;
  facts: readonly { label: string; value: string }[];
}

/** Resumable activities, most recently updated first. Continue shows only the first —
 * candidates are collected solely to decide which one that is (ADR-0356). */
export interface ContinueInventory {
  activities: readonly ContinueActivity[];
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
    : run.phase === 'aftermath'
      ? `Battle ${run.battleIndex + 1} won`
      : run.phase === 'sectio'
      ? `Sectio after Battle ${run.battleIndex + 1}`
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
    && (run.phase === 'battle' || run.phase === 'aftermath')
    && match?.activityId === runBattleActivityId(run.id, run.battleIndex),
  );
  const runTime = parsedTime(run?.updatedAt);
  const matchTime = parsedTime(match?.savedAt);
  const activities = new Map<PlayContinueChoice, ContinueActivity>();

  if (run && playModeEntryEnabled('run')) {
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
    if (level && campaign && playModeEntryEnabled('campaign')) {
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
    } else if (level && !campaign) {
      const mode: PlayContinueChoice = isSkirmishProfileLevel(level) ? 'skirmish' : 'levels';
      if (playModeEntryEnabled(mode)) {
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
  }

  // Recency orders enabled candidates only. Dormant modes keep their saved state but
  // do not re-enter ordinary navigation through the retained Continue surface (ADR-0514).
  const ordered = [...activities.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  return { activities: ordered, defaultMode: ordered[0]?.mode ?? null };
}
