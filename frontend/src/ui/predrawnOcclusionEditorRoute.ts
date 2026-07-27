export const PREDRAWN_OCCLUSION_EDITOR_PARAM = 'predrawnOcclusionEditor';

export function predrawnOcclusionEditorArtifactId(search: string): string | null {
  const value = new URLSearchParams(search)
    .get(PREDRAWN_OCCLUSION_EDITOR_PARAM)
    ?.trim();
  return value || null;
}

export function predrawnOcclusionEditorHref(
  href: string,
  artifactId: string | null,
): string {
  const url = new URL(href);
  if (artifactId) url.searchParams.set(PREDRAWN_OCCLUSION_EDITOR_PARAM, artifactId);
  else url.searchParams.delete(PREDRAWN_OCCLUSION_EDITOR_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
