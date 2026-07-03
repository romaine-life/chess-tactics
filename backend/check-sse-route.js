// CI guard: the lobby SSE routes MUST disable Envoy Gateway's default 15s HTTPRoute
// request timeout. That default is incompatible with streaming responses — with it, the
// long-lived lobby event streams (GET /api/lobbies/events and /api/lobbies/<id>/events)
// are severed roughly every 15s and live sync silently breaks (the original "friend
// joined but never appeared" bug). This asserts the httproute template still carries the
// events-scoped `timeouts.request: "0s"` override, so the regression can't slip back in
// unnoticed. It reads the raw Helm template (no render needed) and greps for the invariant.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'k8s', 'templates', 'httproute.yaml');
const src = fs.readFileSync(file, 'utf8');

const hasListChannelMatch = src.includes('value: /api/lobbies/events');
const hasPerLobbyChannelMatch = src.includes('/api/lobbies/[^/]+/events');
const hasDisabledRequestTimeout = /timeouts:[\s\S]*?request:\s*"0s"/.test(src);

if (!hasListChannelMatch || !hasPerLobbyChannelMatch || !hasDisabledRequestTimeout) {
  console.error(
    'check-sse-route: k8s/templates/httproute.yaml is missing the SSE events rule with ' +
    'timeouts.request: "0s". Without it, Envoy Gateway applies its default 15s request ' +
    'timeout and severs the lobby SSE streams every ~15s, breaking live lobby sync. ' +
    'Restore a rule matching /api/lobbies/events (Exact) and /api/lobbies/[^/]+/events ' +
    '(RegularExpression) with timeouts.request/backendRequest set to "0s".',
  );
  process.exit(1);
}

console.log('check-sse-route: SSE events route keeps Envoy request timeout disabled (ok).');
