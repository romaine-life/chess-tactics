const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parse } = require('@romaine-life/logline');
const { log, outside, errorText, entries, workerEvent, OUTSIDE_LIMIT } = require('./log');

// The lines the backend writes to stdout while fn runs, each read back with logline's parse:
// a line that doesn't fit the standard fails the test.
function captured(fn) {
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stdout.write = write; }
  return lines.join('').split('\n').filter(Boolean).map((line) => {
    const entry = parse(line);
    return { ...entry, fields: Object.fromEntries(entry.fields) };
  });
}

test('log writes standard lines, leaving out absent fields', () => {
  const [entry] = captured(() => log.warn('slow request', { method: 'GET', path: '/api/levels', status: 200, ms: 2310, extra: undefined }));
  assert.equal(entry.level, 'warn');
  assert.equal(entry.message, 'slow request');
  assert.deepEqual(entry.fields, { method: 'GET', path: '/api/levels', status: '200', ms: '2310' });
  assert.equal(entry.pid, process.pid);
});

test('outside and errorText mask credentials', () => {
  assert.equal(outside('refresh failed: /token?refresh_token=abc123&x=1'), 'refresh failed: /token?refresh_token=***&x=1');
  assert.equal(outside('x'.repeat(OUTSIDE_LIMIT + 10)).length, OUTSIDE_LIMIT + 3);
  assert.equal(errorText(new Error('Authorization: Bearer abc.def'), { stack: false }), 'Error: Authorization: Bearer ***');
  assert.match(errorText(new Error('boom')), /^Error: boom\n {4}at /);
  assert.equal(errorText({ message: 'password=hunter2' }), 'password=***');
});

test("workerEvent writes a Job's event as a line", () => {
  const [done, failed] = captured(() => {
    workerEvent({ event: 'done', secs: 4.2, rootValue: 1, restarts: [{ r: 0 }] });
    workerEvent({ event: 'tablebase_upload_failed', error: 'GET /bgm?sig=abc denied' });
  });
  assert.equal(done.level, 'info');
  assert.equal(done.message, 'done');
  assert.deepEqual(done.fields, { secs: '4.2', root_value: '1', restarts: '[{"r":0}]' });
  assert.equal(failed.level, 'error');
  assert.equal(failed.fields.error, 'GET /bgm?sig=*** denied');
});

test('entries reads the standard lines out of mixed output', () => {
  const text = 'not a log line\n'
    + '2026-11-26T14:02:11.408-08:00 pid=12 info "chess-tactics listening" port=3000\r\n';
  const found = entries(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].message, 'chess-tactics listening');
  assert.equal(found[0].fields.port, '3000');
});

test('the backend starts and writes only standard lines', () => {
  // A fresh process loads log.js with require(), as server.js does; its line must parse.
  const result = spawnSync(process.execPath, ['-e', "require('./log').log.info('chess-tactics listening', { port: 3000 })"], {
    cwd: path.join(__dirname),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.equal(parse(lines[0]).message, 'chess-tactics listening');
  assert.equal(result.stderr, '', 'loading logline with require() warns nothing');
});
