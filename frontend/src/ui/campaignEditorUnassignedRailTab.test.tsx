import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { campaignCollectionFromSearch, campaignCollectionHref, UnassignedRailTab } from './CampaignEditor';

describe('UnassignedRailTab', () => {
  it('restores collection state from an Editor return URL', () => {
    expect(campaignCollectionFromSearch('?collection=unassigned')).toBe('unassigned');
    expect(campaignCollectionFromSearch('?collection=skirmish-profiles')).toBe('skirmish-profiles');
    expect(campaignCollectionFromSearch('?collection=unknown')).toBe('campaign');
    expect(campaignCollectionFromSearch('')).toBe('campaign');
    expect(campaignCollectionHref('/editor?keep=yes#section', 'unassigned'))
      .toBe('/editor?keep=yes&collection=unassigned#section');
    expect(campaignCollectionHref('/editor?keep=yes&collection=unassigned', 'campaign'))
      .toBe('/editor?keep=yes');
  });

  it('marks unsaved editor work without changing the canonical level count', () => {
    const markup = renderToStaticMarkup(
      <UnassignedRailTab
        count={3}
        active={false}
        index={4}
        hasUnsavedDrafts
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain('aria-label="Unassigned levels, 3 levels, unsaved drafts available"');
    expect(markup).toContain('<small>3 levels</small>');
    expect(markup).toContain('data-testid="unassigned-draft-attention"');
    expect(markup).toContain('title="Unsaved drafts available"');
    expect(markup).toContain('>!</span>');
  });

  it('omits the attention marker when no resumable drafts exist', () => {
    const markup = renderToStaticMarkup(
      <UnassignedRailTab count={1} active index={2} onSelect={() => {}} />,
    );

    expect(markup).toContain('aria-label="Unassigned levels, 1 level"');
    expect(markup).not.toContain('unassigned-draft-attention');
    expect(markup).not.toContain('unsaved draft');
  });
});
