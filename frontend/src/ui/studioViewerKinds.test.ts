import { describe, expect, it } from 'vitest';
import {
  STUDIO_VIEWER_KIND_LABELS,
  STUDIO_VIEWER_KIND_OPTIONS,
  isViewerKind,
} from './studioViewerKinds';

describe('Studio viewer kind registry', () => {
  it('derives every dropdown option from the registry in alphabetical label order', () => {
    const labels = STUDIO_VIEWER_KIND_OPTIONS.map((option) => option.label);
    const expected = Object.values(STUDIO_VIEWER_KIND_LABELS)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    expect(labels).toEqual(expected);
    expect(STUDIO_VIEWER_KIND_OPTIONS).toHaveLength(Object.keys(STUDIO_VIEWER_KIND_LABELS).length);
    expect(new Set(STUDIO_VIEWER_KIND_OPTIONS.map((option) => option.id)).size).toBe(STUDIO_VIEWER_KIND_OPTIONS.length);
  });

  it('uses the same registry for route validation', () => {
    expect(isViewerKind('divider')).toBe(true);
    expect(isViewerKind('unitart')).toBe(true);
    expect(isViewerKind('not-a-viewer')).toBe(false);
    expect(isViewerKind(null)).toBe(false);
  });
});
