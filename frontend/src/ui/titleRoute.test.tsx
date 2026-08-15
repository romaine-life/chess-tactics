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

  // The trail answers a brand column narrower than itself by giving up whole crumbs, so the
  // markup has to say which crumb goes when. Order is what the fitter reads; the numbers are
  // the contract, not the fitting, which needs a laid-out browser.
  it('gives up the middle first and the place you are never', () => {
    const html = renderToStaticMarkup(
      <TitleRoute segments={[
        { label: 'Battle', to: '/run?run=1' },
        { label: 'Strategikon', to: '/run/strategikon?run=1' },
        { label: 'Enchiridion', to: '/run/strategikon/enchiridion?run=1' },
        { label: 'Chartulary', to: '/run/strategikon/chartulary?run=1' },
      ]} />,
    );

    // In document order, each crumb is paired with the separator that FOLLOWS it and carries
    // the same number: 1 and 2 are the middles, given up shallowest-first, and 3 is the screen
    // the route names, given up only once nothing else is left.
    expect(html.match(/data-title-route-shed="\d+"/g)).toEqual([
      'data-title-route-shed="3"', // Battle
      'data-title-route-shed="3"', // › before Strategikon
      'data-title-route-shed="1"', // Strategikon
      'data-title-route-shed="1"', // › before Enchiridion
      'data-title-route-shed="2"', // Enchiridion
      'data-title-route-shed="2"', // › before Chartulary
    ]);
    // Where you actually are carries no number, so no pass can reach it.
    expect(html.slice(html.lastIndexOf('<button'))).toBe(
      '<button type="button" data-nav="/run/strategikon/chartulary?run=1"'
      + ' class="title-route-button" aria-current="location">Chartulary</button></span>',
    );

    // The ellipsis stands in for whatever was given up, and carries the separator a name
    // would have had after it. Both start hidden: nothing is shed until the trail is measured.
    expect(html.match(/data-title-route-elision="" hidden/g)).toHaveLength(2);
  });

  it('has nothing to give up when the route is a single segment', () => {
    const html = renderToStaticMarkup(
      <TitleRoute segments={[{ label: 'Sectio', to: '/run?run=1' }]} />,
    );

    expect(html).not.toContain('data-title-route-shed');
    expect(html).not.toContain('data-title-route-elision');
  });
});
