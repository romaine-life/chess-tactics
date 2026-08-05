
export type RunSelfInspectionView = 'army' | 'lipsana';
export type RunWorkspaceView = 'primary' | 'alienatio' | 'expunctio' | 'battle-preview' | 'battle-review' | RunSelfInspectionView;

export const SECTIO_WORKSPACE_VIEWS = ['battle-preview', 'alienatio', 'expunctio'] as const;
export type SectioWorkspaceView = typeof SECTIO_WORKSPACE_VIEWS[number];

/** One label inventory for Run workspace controls and the persistent title breadcrumb. */
export const RUN_WORKSPACE_VIEW_LABEL: Readonly<Record<Exclude<RunWorkspaceView, 'primary'>, string>> = Object.freeze({
  army: 'Army',
  lipsana: 'Lipsana',
  alienatio: 'Alienatio',
  expunctio: 'Expunctio',
  'battle-preview': 'View Battle',
  'battle-review': 'Battle',
});

export function isSectioWorkspaceView(view: RunWorkspaceView): view is SectioWorkspaceView {
  return (SECTIO_WORKSPACE_VIEWS as readonly RunWorkspaceView[]).includes(view);
}

export function runWorkspaceViewFromSearch(search: string): RunWorkspaceView {
  const view = new URLSearchParams(search).get('view');
  return view === 'army' || view === 'lipsana' || view === 'alienatio' || view === 'expunctio' || view === 'battle-preview' || view === 'battle-review'
    ? view
    : 'primary';
}

export function runWorkspaceHref(currentHref: string, view: RunWorkspaceView): string {
  const url = new URL(currentHref, 'http://localhost');
  if (view !== 'primary') url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  url.searchParams.delete('lipsanon');
  url.searchParams.delete('unit');
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function runWorkspaceTitleSegment(
  currentHref: string,
  view: RunWorkspaceView,
): Readonly<{ label: string; to: string }> | null {
  return view === 'primary' || view === 'battle-review'
    ? null
    : Object.freeze({
      label: RUN_WORKSPACE_VIEW_LABEL[view],
      to: runWorkspaceHref(currentHref, view),
    });
}

export function runArmyUnitHref(currentHref: string, unitId: string | null): string {
  const url = new URL(runWorkspaceHref(currentHref, 'army'), 'http://localhost');
  if (unitId) url.searchParams.set('unit', unitId);
  else url.searchParams.delete('unit');
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function runBonaTargetHref(
  currentHref: string,
  lipsanonId: string,
  unitId: string | null = null,
): string {
  const url = new URL(currentHref, 'http://localhost');
  url.searchParams.set('view', 'bona-target');
  url.searchParams.set('lipsanon', lipsanonId);
  if (unitId) url.searchParams.set('unit', unitId);
  else url.searchParams.delete('unit');
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function runSelfInspectionViewFromSearch(search: string): RunSelfInspectionView | null {
  const view = runWorkspaceViewFromSearch(search);
  return view === 'army' || view === 'lipsana' ? view : null;
}

export function runSelfInspectionHref(currentHref: string, view: RunSelfInspectionView | null): string {
  return runWorkspaceHref(currentHref, view ?? 'primary');
}
