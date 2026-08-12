import assert from 'node:assert/strict';
import test from 'node:test';
import { check, offendingLines } from './check-studio-surfaces.mjs';

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
