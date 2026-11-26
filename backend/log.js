// The backend's log: the estate's one log line (romaine-life/logline, AHT-204) on stdout,
// which the cluster ships.
//
//   2026-11-26T14:02:11.408-08:00 pid=12 warn slow request method=GET path=/api/levels status=200 ms=2310
//
// A message is fixed text; what varies goes in fields. Text from outside the program (an
// error, a request path, an upstream's answer) goes through `outside` or `errorText`, which
// mask what looks like a credential: the session store holds OAuth tokens, and an error from
// it or from auth.romaine.life can carry one.
//
// @romaine-life/logline is an ES module; Node 22 loads it with require().
const { Logger, parse, redact } = require('@romaine-life/logline');

const stdout = Logger.stream(process.stdout);

// A field whose value is undefined or null is left out.
function present(fields) {
  return Object.entries(fields || {}).filter(([, value]) => value !== undefined && value !== null);
}

const log = {
  log(level, message, fields) { stdout.log(level, message, present(fields)); },
  info(message, fields) { log.log('info', message, fields); },
  warn(message, fields) { log.log('warn', message, fields); },
  error(message, fields) { log.log('error', message, fields); },
};

// The most a field holding outside text keeps, so one upstream answer can't flood the log.
const OUTSIDE_LIMIT = 4096;

// Text from outside the program, masked and capped for a field.
function outside(text) {
  const masked = redact(String(text));
  return masked.length > OUTSIDE_LIMIT ? `${masked.slice(0, OUTSIDE_LIMIT)}...` : masked;
}

// An error for the `error` field: its stack (which starts with its message), masked. Pass
// { stack: false } for its message alone, where the stack says nothing.
function errorText(error, { stack = true } = {}) {
  if (error instanceof Error) return outside(stack && error.stack ? error.stack : `${error.name}: ${error.message}`);
  if (error && typeof error === 'object' && 'message' in error) return outside(error.message);
  return outside(error);
}

// The standard lines in a process's output, read back (for tests that wait on a line).
function entries(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    let entry;
    try { entry = parse(line); } catch { continue; } // not a log line
    out.push({ ...entry, fields: Object.fromEntries(entry.fields) });
  }
  return out;
}

// A line key: lowercase snake_case (the standard's keys), so etaSeconds is eta_seconds.
const snake = (key) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// The solve and train Jobs' events ({ event: 'done', secs: 4.2, ... }): the event is the
// message and every other key a field, an object or array written as JSON. An `error` field
// is masked; an `error` event or one ending `_error` or `_failed` is logged at error.
function workerEvent({ event = 'event', ...rest }) {
  const level = event === 'error' || /_(error|failed)$/.test(event) ? 'error' : 'info';
  const fields = {};
  for (const [key, value] of Object.entries(rest)) {
    const text = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    fields[snake(key)] = key === 'error' ? outside(text) : text;
  }
  log.log(level, event, fields);
}

module.exports = { log, outside, errorText, entries, workerEvent, OUTSIDE_LIMIT };
