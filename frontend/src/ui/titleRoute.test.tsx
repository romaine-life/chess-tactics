import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TitleRoute } from './shell/TitleRoute';

describe('TitleRoute', () => {
  it('renders every breadcrumb segment as a canonical NavButton', () => {
    const html = renderToStaticMarkup(
      <TitleRoute segments={[
        { label: 'Strategikon', to: '/run/strategikon/enchiridion/units?run=1' },
        { label: 'Lipsana', to: '/run/strategikon/enchiridion/lipsana?run=1' },
      ]} />,
    );

    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('data-nav="/run/strategikon/enchiridion/units?run=1"');
    expect(html).toContain('data-nav="/run/strategikon/enchiridion/lipsana?run=1"');
    expect(html).toContain('aria-current="location"');
    expect(html).not.toContain('<a');
  });
});
