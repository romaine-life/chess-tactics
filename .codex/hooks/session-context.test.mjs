import assert from 'node:assert/strict';
import test from 'node:test';
import { formatEnvironmentContext } from './session-context.mjs';

test('injects the stable URL and treats the port as internal', () => {
  const context = formatEnvironmentContext({
    name: 'loading-feature',
    url: 'http://loading-feature.chess-tactics.localhost',
    frontend_port: 5182,
  });
  assert.match(context, /loading-feature/);
  assert.match(context, /http:\/\/loading-feature\.chess-tactics\.localhost/);
  assert.match(context, /internal Vite port 5182/);
  assert.match(context, /do not substitute a localhost:PORT URL/);
});

test('reports setup that has not completed', () => {
  assert.match(formatEnvironmentContext(null), /has not completed/);
});
