import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseSelect } from './HouseSelect';

describe('HouseSelect controlled value display', () => {
  const options = [
    { value: 'zone-a', label: 'Zone A' },
    { value: 'zone-b', label: 'Zone B' },
  ] as const;

  it('renders the matching controlled option label', () => {
    const markup = renderToStaticMarkup(
      <HouseSelect
        value="zone-b"
        options={options}
        ariaLabel="Event zone"
        onChange={() => {}}
      />,
    );

    expect(markup).toContain('>Zone B</button>');
  });

  it('stays blank when the controlled value is absent instead of claiming the first option', () => {
    const markup = renderToStaticMarkup(
      <HouseSelect
        value="deleted-zone"
        options={options}
        ariaLabel="Event zone"
        onChange={() => {}}
      />,
    );

    expect(markup).toMatch(/<button[^>]*aria-label="Event zone"[^>]*><\/button>/);
    expect(markup).not.toContain('Zone A');
  });
});
