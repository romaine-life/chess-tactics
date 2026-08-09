
export type RunSelfInspectionView = 'army' | 'lipsana';
export type RunWorkspaceView = 'primary' | 'expunctio' | 'battle-preview' | 'battle-review' | RunSelfInspectionView;

export const SECTIO_WORKSPACE_VIEWS = ['battle-preview', 'expunctio'] as const;
export type SectioWorkspaceView = typeof SECTIO_WORKSPACE_VIEWS[number];

/**
 * One label inventory for Run workspace controls and the persistent title breadcrumb.
 *
 * `battle-preview` is named **Exploratio** — the Roman army's own word for going and looking at
 * the ground before it is fought over, and the same -atio the Run's other movements answer to
 * (Adlectio, Commendatio, Deditio, Expunctio). The workspace ID and its `?view=battle-preview`
 * address are deliberately unchanged: they are machinery, and every craft link and ADR that
 * names them still resolves (ADR-0549).
 */
export const RUN_WORKSPACE_VIEW_LABEL: Readonly<Record<Exclude<RunWorkspaceView, 'primary'>, string>> = Object.freeze({
  army: 'Army',
  lipsana: 'Lipsana',
  expunctio: 'Expunctio',
  'battle-preview': 'Exploratio',
  'battle-review': 'Battle',
});

/**
 * Every Sectio control's mark, as an installed `app-ui` media role.
 *
 * A rail of words is a rail nobody can find anything on at a glance — the destinations are named
 * in a Latin the player is still learning, so the mark is what carries the meaning until the word
 * does. Each is a real kit glyph chosen for what the control DOES: the adlected file for the
 * Sectio itself (Adlectio is the Sectio's one act), the Run's own Battle mark for reconnaissance
 * of a Battle, the strike-through for Expunctio, the reset arrow for Reset, a drawn sword for
 * leaving into the fighting, and the door for abandoning the Run entirely.
 *
 * One inventory, so a destination cannot answer to two different marks (ADR-0059).
 */
export const RUN_SECTIO_CONTROL_ICON_ROLE = Object.freeze({
  primary: 'ui-kit-icons-game-adlected-png',
  'battle-preview': 'ui-kit-icons-run-battle-png',
  expunctio: 'ui-kit-icons-delete-png',
  'reset-sectio': 'ui-kit-icons-reset-png',
  continue: 'ui-kit-icons-game-attack-png',
  abandon: 'ui-kit-icons-sign-out-png',
}) satisfies Readonly<Record<string, string>>;

export type RunSectioControl = keyof typeof RUN_SECTIO_CONTROL_ICON_ROLE;

export function isSectioWorkspaceView(view: RunWorkspaceView): view is SectioWorkspaceView {
  return (SECTIO_WORKSPACE_VIEWS as readonly RunWorkspaceView[]).includes(view);
}

export function runWorkspaceViewFromSearch(search: string): RunWorkspaceView {
  const view = new URLSearchParams(search).get('view');
  return view === 'army' || view === 'lipsana' || view === 'expunctio' || view === 'battle-preview' || view === 'battle-review'
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

export function runSelfInspectionViewFromSearch(search: string): RunSelfInspectionView | null {
  const view = runWorkspaceViewFromSearch(search);
  return view === 'army' || view === 'lipsana' ? view : null;
}

export function runSelfInspectionHref(currentHref: string, view: RunSelfInspectionView | null): string {
  return runWorkspaceHref(currentHref, view ?? 'primary');
}
