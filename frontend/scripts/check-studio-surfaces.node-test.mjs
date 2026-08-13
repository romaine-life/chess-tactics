import assert from 'node:assert/strict';
import test from 'node:test';
import { check, offendingLines, scrollOwnerFailures } from './check-studio-surfaces.mjs';

test('passes the Studio its own bare route', () => {
  assert.deepEqual(check("  if (path === '/studio' || path === '/tileset-studio') return <TilesetStudio />;\n"), []);
});

test('fails a screen that pairs the Studio path with a query flag', () => {
  const source = "  if (path === '/studio' && new URLSearchParams(search).get('menuIconReview') === '1') return <MenuIconReview />;\n";
  const failures = check(source);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ui\/App\.tsx:1/);
  assert.match(failures[0], /StudioCategory/);
});

test('fails however the query is read, because the path pairing is the tell', () => {
  assert.equal(check("if (path === '/studio' && search.includes('x')) return <X />;").length, 1);
  assert.equal(check("if (path === '/studio' && params.get('y')) return <Y />;").length, 1);
});

test('reports every offender with its line, not just the first', () => {
  const source = [
    "if (path === '/studio' && a) return <A />;",
    "if (path === '/editor' && b) return <B />;",
    "if (path === '/studio' && c) return <C />;",
  ].join('\n');
  assert.deepEqual(offendingLines(source).map(({ line }) => line), [1, 3]);
});

test('leaves the Studio path aliases alone — they are entry points, not screens', () => {
  const source = [
    "if (path === '/studio/wall-candidates') return <TilesetStudio initialCategory=\"walls\" />;",
    "if (path === '/unit-studio') return <TilesetStudio initialCategory=\"units\" />;",
  ].join('\n');
  assert.deepEqual(check(source), []);
});

test('the seventh arrived while the six were being converted, which is the point', () => {
  // `?commandCardMarkReview=1` landed on main mid-conversion, written by copying the last one.
  assert.equal(check("if (path === '/studio' && new URLSearchParams(search).get('commandCardMarkReview') === '1') return <X />;").length, 1);
});

// ---- the scroll owner ----------------------------------------------------------------
// The failure this half exists for is silent: the shell is overflow:hidden at the viewport's
// height, so an unnamed wrapper simply ends mid-content with no error and nothing to click.

const SCROLL_RULE = (...wrappers) => `${wrappers
  .map((wrapper) => `.tileset-studio-shell.is-catalog > .${wrapper}`)
  .join(',\n')} {\n  min-height: 0;\n  overflow-y: auto;\n}\n`;

test('passes a catalog whose wrapper the scroll rule names', () => {
  assert.deepEqual(
    scrollOwnerFailures(
      [['FooCatalog.tsx', '<div className="foo-mark-page">']],
      SCROLL_RULE('tileset-studio-grid', 'foo-mark-page'),
    ),
    [],
  );
});

test('fails a catalog whose wrapper it does not, and names the selector to add', () => {
  const failures = scrollOwnerFailures(
    [['FooCatalog.tsx', '<div className="foo-mark-page">']],
    SCROLL_RULE('tileset-studio-grid'),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ui\/FooCatalog\.tsx wraps its catalog in \.foo-mark-page/);
  assert.match(failures[0], /"\.tileset-studio-shell\.is-catalog > \.foo-mark-page"/);
});

test('a catalog that returns the grid itself needs no wrapper of its own', () => {
  assert.deepEqual(
    scrollOwnerFailures(
      [['BarCatalog.tsx', '<div className="tileset-studio-grid bar-grid">']],
      SCROLL_RULE('tileset-studio-grid'),
    ),
    [],
  );
});

test('reads the scroll rule, not merely the presence of the class anywhere in the stylesheet', () => {
  // A wrapper mentioned only by its own layout rule is exactly the state that clips.
  const css = `.foo-mark-page {\n  display: grid;\n}\n${SCROLL_RULE('tileset-studio-grid')}`;
  assert.equal(scrollOwnerFailures([['FooCatalog.tsx', '<div className="foo-mark-page">']], css).length, 1);
});

test('reports every catalog, not just the first offender', () => {
  const failures = scrollOwnerFailures(
    [
      ['FooCatalog.tsx', '<div className="foo-mark-page">'],
      ['BazCatalog.tsx', '<div className="baz-mark-page">'],
    ],
    SCROLL_RULE('tileset-studio-grid'),
  );
  assert.equal(failures.length, 2);
});
