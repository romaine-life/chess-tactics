/**
 * React instance boundary for the document-owning Level Editor lifecycle.
 *
 * Presentation-only query changes (layer, generationFrame, crop, board snapshot) must not tear
 * down a live editor. Moving to another level/document must, because the mounted instance owns a
 * writer lease, page credential, recovery namespace, and navigation-release state for one doc.
 */
export function levelEditorRouteIdentity(search: string): string {
  const params = new URLSearchParams(search);
  const documentId = params.get('document')?.trim();
  if (documentId) return `document:${documentId}`;
  const legacyMapId = params.get('map')?.trim();
  if (legacyMapId) return `document:legacy-${legacyMapId}`;
  const levelId = params.get('levelId')?.trim();
  if (levelId) return `level:${levelId}`;
  return 'new-level';
}
