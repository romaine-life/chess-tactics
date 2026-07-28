import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PredrawnOcclusionEditor } from './PredrawnOcclusionEditor';

describe('PredrawnOcclusionEditor workspace contract', () => {
  it('renders the exact native raster contract and every required edit control', () => {
    const markup = renderToStaticMarkup(
      <PredrawnOcclusionEditor
        imageId="warped-version-7"
        imageUrl="/api/background-versions/warped-version-7/content"
        imageWidth={1672}
        imageHeight={941}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('1672 × 941 px');
    expect(markup).toContain('The exact warped artwork is the only image examined');
    expect(markup).toContain('Legacy tile artwork is never loaded or consulted');
    expect(markup).toContain('width="1672"');
    expect(markup).toContain('height="941"');
    expect(markup).toContain('Positive point');
    expect(markup).toContain('Negative point');
    expect(markup).toContain('Brush');
    expect(markup).toContain('Eraser');
    expect(markup).toContain('Undo');
    expect(markup).toContain('Redo');
    expect(markup).toContain('Reset all');
    expect(markup).toContain('Previous');
    expect(markup).toContain('Next');
    expect(markup).toContain('Add candidate to mask');
    expect(markup).toContain('Discard candidate');
    expect(markup).toContain('No submit callback is connected');
    expect(markup).toMatch(/class="predrawn-occlusion-editor-stage"[^>]*role="group"/);
    expect(markup).not.toContain('role="application"');
  });

  it('keeps authoring available while explaining an external submit gate', () => {
    const markup = renderToStaticMarkup(
      <PredrawnOcclusionEditor
        imageId="warped-version-8"
        imageUrl="/api/background-versions/warped-version-8/content"
        imageWidth={800}
        imageHeight={600}
        submitDisabledReason="Take over editing before this mask can be attached."
        onSubmit={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('Take over editing before this mask can be attached.');
    expect(markup).not.toContain('No submit callback is connected');
    expect(markup).toMatch(/data-testid="predrawn-occlusion-submit"[^>]*disabled/);
    expect(markup).not.toMatch(/data-testid="predrawn-occlusion-brush-tool"[^>]*disabled/);
    expect(markup).not.toMatch(/data-testid="predrawn-occlusion-eraser-tool"[^>]*disabled/);
  });

  it('shows retry success inside the reopened editor with the clearer artifact name', () => {
    const markup = renderToStaticMarkup(
      <PredrawnOcclusionEditor
        imageId="warped-version-9"
        imageUrl="/api/background-versions/warped-version-9/content"
        imageWidth={800}
        imageHeight={600}
        notice="Mask discarded. The warped board, saved grid, and tile highlights remain."
        submitLabel="Create board with occlusion mask"
        onSubmit={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('Mask discarded. The warped board, saved grid, and tile highlights remain.');
    expect(markup).toContain('Create board with occlusion mask');
    expect(markup).not.toContain('occlusion-ready board');
  });
});
