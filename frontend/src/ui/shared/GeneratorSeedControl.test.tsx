import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GeneratorSeedControl } from './GeneratorSeedControl';

function render(fixed: boolean): string {
  return renderToStaticMarkup(
    <GeneratorSeedControl
      generatorName="this Forest"
      seedLabel="Forest seed"
      fixed={fixed}
      seed={4217}
      defaultSeed={1234}
      onFixedChange={vi.fn()}
      onSeedChange={vi.fn()}
    />,
  );
}

describe('GeneratorSeedControl', () => {
  it('keeps seed editing out of the normal automatic flow', () => {
    const markup = render(false);
    expect(markup).toContain('Generate automatically picks a fresh seed each time.');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).not.toContain('type="range"');
    expect(markup).not.toContain('Randomize');
  });

  it('reveals reproducibility controls only after fixed seed is enabled', () => {
    const markup = render(true);
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('Forest seed');
    expect(markup).toContain('Seed · 4217');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('Randomize');
  });
});
