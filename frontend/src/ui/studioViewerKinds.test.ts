import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STUDIO_VIEWER_KIND_LABELS,
  isViewerKind,
} from './studioViewerKinds';

describe('Studio viewer kind registry', () => {
  it('uses the registry for route validation', () => {
    expect(isViewerKind('divider')).toBe(true);
    expect(isViewerKind('unitart')).toBe(true);
    expect(isViewerKind('cardicons')).toBe(true);
    expect(isViewerKind('carddivider')).toBe(true);
    expect(isViewerKind('deployment')).toBe(true);
    expect(isViewerKind('not-a-viewer')).toBe(false);
    expect(isViewerKind(null)).toBe(false);
  });

  it('keeps Viewer kinds addressable without rendering them as a second catalog', () => {
    const studio = readFileSync(new URL('./TilePreview.tsx', import.meta.url), 'utf8');

    expect(Object.keys(STUDIO_VIEWER_KIND_LABELS)).toContain('cardicons');
    expect(Object.keys(STUDIO_VIEWER_KIND_LABELS)).toContain('carddivider');
    expect(Object.keys(STUDIO_VIEWER_KIND_LABELS)).toContain('deployment');
    expect(studio).not.toContain('STUDIO_VIEWER_KIND_OPTIONS');
    expect(studio).not.toContain('aria-label="Viewer kind"');
    expect(studio).not.toContain('viewerKindSelect');
  });
});
