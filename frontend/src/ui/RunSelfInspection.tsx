import type { ReactElement } from 'react';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';

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

export function RunSelfInspectionControls({
  view,
  onNavigate,
  testIdPrefix = 'run-view',
}: {
  view: RunSelfInspectionView | null;
  onNavigate: (view: RunSelfInspectionView) => void;
  testIdPrefix?: string;
}): ReactElement {
  return (
    <div className="run-meta-navigation">
      <ChromeButton unit="inner-text-button"
        data-testid={`${testIdPrefix}-army`}
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'army' && 'active')}
        aria-pressed={view === 'army'}
        onClick={() => onNavigate('army')}
      >
        Army
      </ChromeButton>
      <ChromeButton unit="inner-text-button"
        data-testid={`${testIdPrefix}-relics`}
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'relics' && 'active')}
        aria-pressed={view === 'relics'}
        onClick={() => onNavigate('relics')}
      >
        Relics
      </ChromeButton>
    </div>
  );
}
