import test from 'node:test';
import assert from 'node:assert/strict';
import { brokenLinksIn, markdownLinks, run } from './check-doc-links.mjs';

const has = (...paths) => {
  const set = new Set(paths);
  return (candidate) => set.has(candidate);
};

test('external targets, anchors and non-markdown files are not link checks', () => {
  const source = [
    '[web](https://example.test/a.md)',
    '[anchor](#section)',
    '[mail](mailto:a@b.test)',
    '[art](art/plate.png)',
    '[doc](sibling.md)',
  ].join('\n');
  assert.deepEqual(markdownLinks(source).map((l) => l.target), ['sibling.md']);
});

test('a target is read without its anchor or query', () => {
  assert.deepEqual(
    markdownLinks('[a](0001-a.md#decision) and [b](0002-b.md?x=1)').map((l) => l.target),
    ['0001-a.md', '0002-b.md'],
  );
});

test('a resolving link passes and a missing one fails, with file and line', () => {
  const source = '\n[gone](0002-b.md)\n[here](0001-a.md)';
  const failures = brokenLinksIn('docs/adr/0003-c.md', source, has('docs/adr/0001-a.md'));
  assert.deepEqual(failures, ['docs/adr/0003-c.md:2 → 0002-b.md']);
});

test('links are resolved relative to the citing file, not the repo root', () => {
  assert.deepEqual(brokenLinksIn('docs/game-concept.md', '[a](adr/0001-a.md)', has('docs/adr/0001-a.md')), []);
  assert.deepEqual(brokenLinksIn('docs/adr/0001-a.md', '[c](../game-concept.md)', has('docs/game-concept.md')), []);
  assert.equal(brokenLinksIn('docs/adr/0001-a.md', '[c](game-concept.md)', has('docs/game-concept.md')).length, 1);
});

test('a renamed ADR still linked under its old slug is caught', () => {
  const failures = brokenLinksIn(
    'docs/adr/0059-x.md',
    '[ADR-0058](0058-studio-editors-are-viewer-kinds-not-routes.md)',
    has('docs/adr/0058-every-route-is-click-reachable.md'),
  );
  assert.equal(failures.length, 1);
});

test('every markdown link in the live docs resolves', () => {
  assert.deepEqual(run().failures, []);
});
