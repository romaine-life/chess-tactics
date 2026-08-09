export const PREDRAWN_GRID_FITTER_PARAM = 'predrawnGridFitter';

/**
 * The exact Raw Pipeline Source the grid fitter is open against.
 *
 * The fitter is the surface a candidate's geometry is actually judged on, so it has to be an
 * address like every other review destination: a link that lands on the pipeline leaves the
 * reviewer one click short, in a panel where they still have to find the right board.
 */
export function predrawnGridFitterArtifactId(search: string): string | null {
  const value = new URLSearchParams(search).get(PREDRAWN_GRID_FITTER_PARAM)?.trim();
  return value || null;
}

export function predrawnGridFitterHref(href: string, artifactId: string | null): string {
  const url = new URL(href);
  if (artifactId) url.searchParams.set(PREDRAWN_GRID_FITTER_PARAM, artifactId);
  else url.searchParams.delete(PREDRAWN_GRID_FITTER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
