
export type RunSelfInspectionView = 'army' | 'relics';
export type RunWorkspaceView = 'primary' | 'sell' | RunSelfInspectionView;

export function runWorkspaceViewFromSearch(search: string): RunWorkspaceView {
  const view = new URLSearchParams(search).get('view');
  return view === 'army' || view === 'relics' || view === 'sell' ? view : 'primary';
}

export function runWorkspaceHref(currentHref: string, view: RunWorkspaceView): string {
  const url = new URL(currentHref, 'http://localhost');
  if (view !== 'primary') url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

export function runSelfInspectionViewFromSearch(search: string): RunSelfInspectionView | null {
  const view = runWorkspaceViewFromSearch(search);
  return view === 'army' || view === 'relics' ? view : null;
}

export function runSelfInspectionHref(currentHref: string, view: RunSelfInspectionView | null): string {
  return runWorkspaceHref(currentHref, view ?? 'primary');
}
