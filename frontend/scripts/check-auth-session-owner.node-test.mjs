import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAuthOwnershipViolations } from './check-auth-session-owner.mjs';

test('rejects a screen-owned identity probe', () => {
  const violations = collectAuthOwnershipViolations([{
    path: 'src/ui/BadScreen.tsx',
    source: "fetch('/api/auth/me');",
  }]);
  assert.match(violations.map((entry) => entry.why).join('\n'), /direct identity endpoint/);
});

test('rejects a screen-owned retry path and identity cache', () => {
  const violations = collectAuthOwnershipViolations([{
    path: 'src/ui/BadScreen.tsx',
    source: "import { fetchReachableAuthStatus, type AuthUser } from '../net/auth';\nconst [me] = useState<AuthUser | null>(null);",
  }]);
  assert.match(violations.map((entry) => entry.why).join('\n'), /retired caller-owned auth retry/);
  assert.match(violations.map((entry) => entry.why).join('\n'), /screen-local identity/);
});

test('rejects screen-local 401 interpretation and inferred identity state', () => {
  const violations = collectAuthOwnershipViolations([{
    path: 'src/ui/BadScreen.tsx',
    source: "import { isUnauthorized } from '../net/auth';\nconst [signedIn, setSignedIn] = useState(false);",
  }]);
  assert.match(violations.map((entry) => entry.why).join('\n'), /screen-local 401 interpretation/);
  assert.match(violations.map((entry) => entry.why).join('\n'), /screen-local identity state/);
});

test('accepts the canonical transport and session owner', () => {
  assert.deepEqual(collectAuthOwnershipViolations([
    { path: 'src/net/auth.ts', source: "fetch('/api/auth/me');\nexport async function fetchMeStatus() {}" },
    { path: 'src/net/authSession.ts', source: "import { fetchMeStatus, type AuthUser } from './auth';" },
    { path: 'src/main.tsx', source: "import { startAuthSession } from './net/authSession';\nvoid startAuthSession();" },
  ]), []);
});
