// The backend re-declares parts of the level schema as plain-JS Sets because `server.js` cannot
// import the TypeScript core. That mirror is load-bearing: `validateWorkspaceLevel` rejects any
// level whose zone type it does not recognize, and the editor reports that rejection to the author
// only as "Cloud autosave is unavailable" — with no hint that a zone type is the reason. Adding a
// zone type to the shared core and forgetting this file therefore breaks saving silently.
//
// These tests read both sources as text and compare them, so the mirror cannot drift again.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const CORE_LEVEL = path.join(__dirname, '..', 'packages', 'board-render', 'src', 'core', 'level.ts');
const CORE_PIECES = path.join(__dirname, '..', 'packages', 'board-render', 'src', 'core', 'pieces.ts');
const SERVER = path.join(__dirname, 'server.js');

/** Pull a `const NAME = [...]` / `new Set([...])` string-array literal out of a source file. */
function stringArrayLiteral(file, declaration) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `${path.basename(file)} no longer declares ${declaration}`);
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  assert.ok(open >= 0 && close > open, `${declaration} is no longer a bracketed literal`);
  return source.slice(open + 1, close)
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

test('the backend zone-type mirror matches core ZONE_TYPES exactly', () => {
  const core = stringArrayLiteral(CORE_LEVEL, 'export const ZONE_TYPES =');
  const backend = stringArrayLiteral(SERVER, 'const WORKSPACE_ZONE_TYPES = new Set(');
  assert.deepStrictEqual(
    [...backend].sort(),
    [...core].sort(),
    'WORKSPACE_ZONE_TYPES in backend/server.js has drifted from ZONE_TYPES in core/level.ts. '
      + 'A zone type missing here makes every save of a level using it fail as invalid_level_body.',
  );
});

test('the backend roster-piece mirror matches core PLAYABLE_PIECE_TYPES exactly', () => {
  const core = stringArrayLiteral(CORE_PIECES, 'export const PLAYABLE_PIECE_TYPES =');
  const backend = stringArrayLiteral(SERVER, 'const WORKSPACE_ROSTER_PIECES = new Set(');
  assert.deepStrictEqual([...backend].sort(), [...core].sort());
});

test('a zone carrying excludedPieceTypes may bar only the still-supported King', () => {
  const source = fs.readFileSync(SERVER, 'utf8');
  assert.match(
    source,
    /zone\.excludedPieceTypes !== undefined/,
    'validateWorkspaceLevel must check excludedPieceTypes so a malformed bar cannot reach the DB',
  );
  assert.match(source, /excludedPieceTypes\.some\(\(type\) => type !== 'king'\)/);
});
