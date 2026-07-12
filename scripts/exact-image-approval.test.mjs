import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { approvalMarker, trustedApprovals } from './exact-image-approval.mjs';

const expected = {
  head: 'a'.repeat(40),
  fingerprint: 'b'.repeat(64),
  digest: `sha256:${'c'.repeat(64)}`,
};

test('approval marker binds head, complete fingerprint, and immutable digest', () => {
  assert.equal(
    approvalMarker(expected),
    `<!-- exact-image-approval:v1 head=${'a'.repeat(40)} fingerprint=${'b'.repeat(64)} digest=sha256:${'c'.repeat(64)} -->`,
  );
});

test('only exact markers from trusted repository relationships count', () => {
  const marker = approvalMarker(expected);
  const comments = [
    { author_association: 'MEMBER', body: marker, user: { login: 'nelson' } },
    { author_association: 'CONTRIBUTOR', body: marker, user: { login: 'untrusted' } },
    { author_association: 'OWNER', body: marker.replace('fingerprint=', 'fingerprint=0'), user: { login: 'stale' } },
  ];
  assert.deepEqual(trustedApprovals(comments, expected).map((comment) => comment.user.login), ['nelson']);
});

test('paginated gh api output is flattened', () => {
  const marker = approvalMarker(expected);
  const pages = [[], [{ author_association: 'COLLABORATOR', body: `\n${marker}\n` }]];
  assert.equal(trustedApprovals(pages, expected).length, 1);
});

test('malformed identities are rejected', () => {
  assert.throws(() => approvalMarker({ ...expected, digest: 'latest' }), /Invalid --digest/);
});

test('release workflows preserve immutable candidate and explicit approval gates', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const candidate = readFileSync(`${root}.github/workflows/docker-build-check.yaml`, 'utf8');
  const production = readFileSync(`${root}.github/workflows/build-and-deploy.yaml`, 'utf8');

  assert.match(candidate, /staging_tag=candidate-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(candidate, /--source "\$\{REGISTRY\}\/\$\{IMAGE\}@\$\{BUILT_DIGEST\}"/);
  assert.doesNotMatch(candidate, /az acr import[\s\S]{0,300}\s--force(?:\s|$)/);
  assert.doesNotMatch(candidate, /commit_tag=|sha-\$\{/);
  assert.match(candidate, /--platform linux\/amd64/);
  assert.match(candidate, /NODE_BASE=\$\{\{ steps\.fingerprint\.outputs\.resolved_base_ref \}\}/);
  assert.match(candidate, /--write-enabled false/);
  assert.match(candidate, /--delete-enabled false/);

  assert.doesNotMatch(production, /uses: docker\/build-push-action/);
  assert.doesNotMatch(production, /sha-\$\{|sha-<pr-head>/);
  assert.match(production, /exact-image-approval\.mjs verify/);
  assert.match(production, /--fingerprint "\$\{FINGERPRINT\}"/);
  assert.match(production, /DEPLOY_IMAGE_REF=\$\{image_ref\}/);
  assert.match(production, /Candidate identity .* is not registry-locked/);
});
