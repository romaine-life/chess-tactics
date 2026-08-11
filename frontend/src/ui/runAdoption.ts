import { formatArmySize, formatGold, type RunDocument } from '../run/model';
import { runPhaseLabel } from './playContinue';
import { relativeTimeLabel } from './relativeTime';

/**
 * What to show about ONE of two Runs the account is being asked to choose between.
 *
 * The question used to be a single run-on sentence naming each side's War — and both sides
 * are almost always the same War, so it asked which Run to keep while saying nothing that
 * told them apart. These are the facts that actually separate two live Runs: where each one
 * stands, what it is carrying, and which one you were just playing.
 *
 * A fact that is IDENTICAL on both sides is not a distinguishing fact, so the War appears only
 * when the two disagree. `other` is the Run this one is being compared against — that is the
 * whole reason this takes two arguments. Ataraxia is deliberately absent: `AtaraxiaTier` has
 * exactly one member today, so a tier row could never do anything but repeat itself on both
 * sides. Add it here the moment a second tier ships, under the same differ-only rule.
 */
export function runAdoptionFacts(
  run: RunDocument,
  other: RunDocument,
  now = Date.now(),
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  if (run.war.name !== other.war.name) facts.push({ label: 'War', value: run.war.name });
  facts.push({ label: 'Progress', value: runPhaseLabel(run) });
  facts.push({ label: 'Army', value: formatArmySize(run.army.length) });
  facts.push({ label: 'Gold', value: formatGold(run.goldTenths) });
  facts.push({ label: 'Last played', value: relativeTimeLabel(run.updatedAt, now) });
  return facts;
}
