import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApparatusRailColumn } from './shared/ApparatusRailTab';
import {
  campaignCollectionFromSearch,
  campaignCollectionHref,
  editorCampaignHref,
  editorCampaignIdFromSearch,
  editorCollectionFromLocation,
  UnassignedRailTab,
} from './CampaignEditor';

describe('UnassignedRailTab', () => {
  it('restores collection state from an Editor return URL', () => {
    expect(campaignCollectionFromSearch('?collection=unassigned')).toBe('unassigned');
    // The retired Skirmish profiles collection resolves to Campaigns, not a dead panel.
    expect(campaignCollectionFromSearch('?collection=skirmish-profiles')).toBe('campaign');
    expect(campaignCollectionFromSearch('?collection=unknown')).toBe('campaign');
    expect(campaignCollectionFromSearch('')).toBe('campaign');
    expect(campaignCollectionHref('/editor?keep=yes#section', 'unassigned'))
      .toBe('/editor?keep=yes&collection=unassigned#section');
    expect(campaignCollectionHref('/editor?keep=yes&collection=unassigned', 'campaign'))
      .toBe('/editor?keep=yes');
    expect(editorCollectionFromLocation('/editor/wars', '?collection=unassigned')).toBe('wars');
    expect(editorCollectionFromLocation('/editor', '?collection=unassigned')).toBe('unassigned');
    // The Editor's default page is Wars: a bare address names no collection, so it must not
    // open the campaign panel with no campaign in it.
    expect(editorCollectionFromLocation('/editor', '')).toBe('wars');
    expect(editorCollectionFromLocation('/editor', '?returnTo=%2F')).toBe('wars');
    expect(editorCollectionFromLocation('/editor', '?campaign=crown')).toBe('campaign');
    expect(editorCollectionFromLocation('/editor', '?campaign=%20')).toBe('wars');
    expect(editorCollectionFromLocation('/editor', '?collection=unknown')).toBe('campaign');
    expect(campaignCollectionHref('/editor?keep=yes#section', 'wars'))
      .toBe('/editor/wars?keep=yes#section');
    expect(campaignCollectionHref('/editor/wars?keep=yes#section', 'campaign'))
      .toBe('/editor?keep=yes#section');
    expect(campaignCollectionHref('/editor/wars?keep=yes#section', 'unassigned'))
      .toBe('/editor?keep=yes&collection=unassigned#section');
    expect(editorCampaignHref('/editor?collection=unassigned&keep=yes#section', 'crown'))
      .toBe('/editor?keep=yes&campaign=crown#section');
    expect(editorCampaignIdFromSearch('?keep=yes&campaign=crown')).toBe('crown');
    expect(editorCampaignIdFromSearch('?keep=yes')).toBeNull();
  });

  // A rail tab renders inside its COLUMN, which is what declares whether its tabs open a panel
  // beside the rail — the tab throws without one rather than guessing.
  const inRail = (tab: ReactElement): string => renderToStaticMarkup(
    <ApparatusRailColumn opens="panel-beside">{tab}</ApparatusRailColumn>,
  );

  it('marks unsaved editor work without changing the canonical level count', () => {
    const markup = inRail(
      <UnassignedRailTab
        count={3}
        active={false}
        index={4}
        hasUnsavedDrafts
        onSelect={() => {}}
        opensAddress="/editor?collection=unassigned"
      />,
    );

    expect(markup).toContain('aria-label="Levels, 3 levels, unsaved drafts available"');
    expect(markup).toContain('<small>3 levels</small>');
    expect(markup).toContain('data-testid="unassigned-draft-attention"');
    expect(markup).toContain('title="Unsaved drafts available"');
    expect(markup).toContain('>!</span>');
  });

  it('omits the attention marker when no resumable drafts exist', () => {
    const markup = inRail(
      <UnassignedRailTab count={1} active index={2} onSelect={() => {}} opensAddress="/editor?collection=unassigned" />,
    );

    expect(markup).toContain('aria-label="Levels, 1 level"');
    expect(markup).not.toContain('unassigned-draft-attention');
    expect(markup).not.toContain('unsaved draft');
  });
});
