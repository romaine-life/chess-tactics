/** Player-facing Play-menu availability (ADR-0514).
 *
 * Disabled modes remain implemented and directly routable. Keeping the policy in
 * one Git-owned registry lets a later product decision restore an entry without
 * reconstructing retired gameplay or navigation code.
 */
export type PlayerFacingPlayMode = 'campaign' | 'skirmish' | 'run' | 'levels';

export const PLAY_MODE_ENTRY_ENABLED: Readonly<Record<PlayerFacingPlayMode, boolean>> = Object.freeze({
  campaign: false,
  skirmish: false,
  run: true,
  levels: false,
});

const FIXED_PLAY_MODE_ORDER: readonly Exclude<PlayerFacingPlayMode, 'campaign'>[] = Object.freeze([
  'skirmish',
  'run',
  'levels',
]);

export const PLAY_SOURCE_RAIL_ENABLED = Object.values(PLAY_MODE_ENTRY_ENABLED)
  .filter(Boolean).length > 1;

export const CAMPAIGN_RAIL_START_INDEX = 1 + FIXED_PLAY_MODE_ORDER
  .filter((mode) => PLAY_MODE_ENTRY_ENABLED[mode]).length;

export function playModeEntryEnabled(mode: PlayerFacingPlayMode): boolean {
  return PLAY_MODE_ENTRY_ENABLED[mode];
}

export function playModeRailIndex(mode: Exclude<PlayerFacingPlayMode, 'campaign'>): number {
  return 1 + FIXED_PLAY_MODE_ORDER
    .filter((candidate) => PLAY_MODE_ENTRY_ENABLED[candidate])
    .indexOf(mode);
}

export function enabledPlayModeNames(): string {
  const labels: Record<PlayerFacingPlayMode, string> = {
    campaign: 'Campaign',
    skirmish: 'Skirmish',
    run: 'Run',
    levels: 'Levels',
  };
  const names = (Object.keys(PLAY_MODE_ENTRY_ENABLED) as PlayerFacingPlayMode[])
    .filter((mode) => PLAY_MODE_ENTRY_ENABLED[mode])
    .map((mode) => labels[mode]);
  if (names.length <= 1) return names[0] ?? 'Play';
  return `${names.slice(0, -1).join(', ')}, or ${names.at(-1)}`;
}
