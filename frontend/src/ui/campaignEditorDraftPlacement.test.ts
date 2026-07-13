// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repository's source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');

describe('Campaign Editor draft placement', () => {
  it('mounts Continue editing only inside the Unassigned Levels collection', () => {
    const unassignedBranch = source.indexOf(') : isUnassignedSelected ? (');
    const continueSection = source.indexOf('<SettingsSection title="Continue editing">');
    const unassignedSection = source.indexOf('<SettingsSection title="Unassigned Levels">');
    const campaignBranch = source.indexOf(') : camp ? (');

    expect(unassignedBranch).toBeGreaterThan(-1);
    expect(continueSection).toBeGreaterThan(unassignedBranch);
    expect(unassignedSection).toBeGreaterThan(continueSection);
    expect(campaignBranch).toBeGreaterThan(unassignedSection);
    expect(source.match(/<SettingsSection title="Continue editing">/g)).toHaveLength(1);
  });
});
