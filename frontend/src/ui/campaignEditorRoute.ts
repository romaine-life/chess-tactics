/**
 * The Campaign Editor's address grammar, stated ONCE.
 *
 * Every sectioned shell keeps its address grammar in its own route module so the shell registry
 * (`shell/sectionedShells.ts`) and the screen itself cannot drift apart — see that file's header.
 * The Editor's grammar is query parameters plus one path segment, not path segments alone:
 * `/editor/wars` is Wars, `?collection=unassigned` is Unassigned levels, `?campaign=<id>` is that
 * campaign, and a bare `/editor` is the default page.
 */

export type CampaignCollection = 'campaign' | 'wars' | 'unassigned';

export function campaignCollectionFromSearch(search: string): CampaignCollection {
  // A retired collection value resolves to Campaigns rather than 404ing, so an old
  // bookmark of a withdrawn collection tab still lands somewhere real (ADR-0529).
  return new URLSearchParams(search).get('collection') === 'unassigned' ? 'unassigned' : 'campaign';
}

export function campaignCollectionHref(href: string, collection: CampaignCollection): string {
  const url = new URL(href, 'http://localhost');
  if (collection === 'wars') {
    url.pathname = '/editor/wars';
    url.searchParams.delete('collection');
    url.searchParams.delete('campaign');
  } else {
    if (url.pathname.replace(/\/+$/, '') === '/editor/wars') url.pathname = '/editor';
    if (collection === 'campaign') {
      url.searchParams.delete('collection');
    } else {
      url.searchParams.set('collection', collection);
      url.searchParams.delete('campaign');
    }
  }
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function editorCampaignIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('campaign')?.trim() || null;
}

export function editorCampaignHref(href: string, campaignId: string): string {
  const url = new URL(href, 'http://localhost');
  url.pathname = '/editor';
  url.searchParams.delete('collection');
  url.searchParams.set('campaign', campaignId);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function editorCollectionFromLocation(pathname: string, search: string): CampaignCollection {
  if (pathname.replace(/\/+$/, '') === '/editor/wars') return 'wars';
  const params = new URLSearchParams(search);
  // The Editor's default page is Wars. Runs replaced campaigns as how the game is played
  // (ADR-0529) and the rail no longer advertises them, so an address that names neither a
  // collection nor a campaign used to open the Campaigns panel with no campaign in it — a
  // default page whose entire content was "No campaign selected". Only an address that
  // actually names its collection leaves Wars.
  if (!params.get('collection') && !params.get('campaign')?.trim()) return 'wars';
  return campaignCollectionFromSearch(search);
}
