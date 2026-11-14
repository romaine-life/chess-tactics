import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ciPath = `${root}.forgejo/workflows/ci.yml`;
const backendPackagePath = `${root}backend/package.json`;
const ci = readFileSync(ciPath, 'utf8').replaceAll('\r\n', '\n');
const candidate = workflowJob(ci, 'image');
const production = workflowJob(ci, 'deploy');
const backendPackage = JSON.parse(readFileSync(backendPackagePath, 'utf8'));

function workflowStep(source, name) {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = source.indexOf('\n      - name:', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function workflowJob(source, id) {
  const marker = `  ${id}:\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job: ${id}`);
  const remainder = source.slice(start + marker.length);
  const next = remainder.search(/^  [a-z0-9-]+:\n/m);
  return source.slice(start, next === -1 ? source.length : start + marker.length + next);
}

test('backend and frontend validation run once in parallel before image work', () => {
  const backend = workflowJob(ci, 'backend-tests');
  const frontend = workflowJob(ci, 'frontend-checks');

  assert.match(backend, /name: Test backend/);
  assert.match(backend, /DATABASE_URL:/);
  assert.match(backend, /\bnpm test\b/);
  assert.doesNotMatch(backend, /npm run check/);

  assert.match(frontend, /name: Check frontend contracts/);
  assert.match(frontend, /\bnpm run check\b/);
  assert.match(frontend, /node --test scripts\/immutable-image-release\.test\.mjs/);
  assert.doesNotMatch(frontend, /DATABASE_URL:/);

  assert.match(candidate, /name: Test and build app image/);
  assert.match(candidate, /needs: \[changes, backend-tests, frontend-checks\]/);
  assert.match(production, /name: Build merged image and pin Helm digest/);
  assert.match(production, /needs: \[changes, backend-tests, frontend-checks, image\]/);
  for (const final of [candidate, production]) {
    assert.doesNotMatch(final, /\bnpm test\b|\bnpm run check\b|DATABASE_URL:/);
  }

  assert.equal(
    (ci.match(/\bnpm run check\b/g) ?? []).length,
    1,
    'CI must run the frontend gate exactly once',
  );

  assert.equal(backendPackage.scripts.test, 'npm run test:prepare && npm run test:backend');
  assert.match(backendPackage.scripts['test:prepare'], /frontend run build &&/);
  assert.match(backendPackage.scripts['test:prepare'], /frontend run build:trainer/);
  assert.doesNotMatch(backendPackage.scripts['test:prepare'], /frontend run check/);
  assert.doesNotMatch(backendPackage.scripts['test:backend'], /frontend/);
});

test('pull-request CI publishes the tested ref for validation without owning production release state', () => {
  const build = workflowStep(candidate, 'Build and push image');
  const alias = workflowStep(candidate, 'Tag app image by commit');

  assert.match(candidate, /^    if: github\.event_name != 'push'$/m);
  const deployIf = production.match(/^    if: >-\n((?: {6}.*\n)+)/m)?.[1] ?? '';
  assert.match(deployIf, /github\.event_name != 'pull_request'/);
  for (const need of ['changes', 'backend-tests', 'frontend-checks']) {
    assert.match(deployIf, new RegExp(`needs\\.${need}\\.result == 'success'`));
  }
  assert.match(deployIf, /needs\.image\.result == 'success' \|\| \(github\.event_name == 'push' && needs\.image\.result == 'skipped'\)/);
  assert.doesNotMatch(deployIf, /failure\(\)/);

  assert.match(build, /uses: docker\/build-push-action@v7/);
  assert.match(build, /platforms: linux\/amd64/);
  assert.match(build, /push: true/);
  assert.match(build, /tags: \$\{\{ env\.REGISTRY \}\}\/\$\{\{ env\.IMAGE \}\}:\$\{\{ steps\.fingerprint\.outputs\.proof_tag \}\}/);

  assert.match(alias, /commit_tag="sha-\$\{\{ steps\.source\.outputs\.sha \}\}"/);
  assert.match(alias, /az acr import/);
  assert.match(alias, /--force/);

  assert.doesNotMatch(candidate, /Compute prospective release version/);
  assert.doesNotMatch(candidate, /candidate-\$\{GITHUB_RUN_ID\}/);
  assert.doesNotMatch(candidate, /trusted[-_ ]approver/i);
  assert.doesNotMatch(candidate, /gh pr comment/);
});

test('main builds the merged revision and deploys its immutable digest', () => {
  const resolve = workflowStep(production, 'Resolve requested ref');
  const build = workflowStep(production, 'Build and push merged image');
  const capture = workflowStep(production, 'Capture immutable deployment image');
  const publish = workflowStep(production, 'Publish tag + version to the prod deploy branch');

  assert.match(resolve, /target_ref="\$\{INPUT_REF:-\$GITHUB_SHA\}"/);
  assert.match(build, /id: build/);
  assert.match(build, /uses: docker\/build-push-action@v7/);
  assert.match(build, /platforms: linux\/amd64/);
  assert.match(build, /push: true/);
  assert.match(build, /tags: \$\{\{ env\.REGISTRY \}\}\/\$\{\{ env\.IMAGE \}\}:\$\{\{ env\.TAG \}\}/);

  assert.match(capture, /BUILT_DIGEST: \$\{\{ steps\.build\.outputs\.digest \}\}/);
  assert.match(capture, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(capture, /--write-enabled false/);
  assert.match(capture, /--delete-enabled false/);
  assert.match(capture, /--image "\$\{IMAGE\}@\$\{canonical_digest\}"/);
  assert.match(capture, /manifest_write_enabled/);
  assert.match(capture, /manifest_delete_enabled/);
  assert.match(capture, /image_ref="\$\{REGISTRY\}\/\$\{IMAGE\}@\$\{canonical_digest\}"/);
  assert.match(capture, /DEPLOY_IMAGE_REF=\$\{image_ref\}/);

  assert.match(publish, /tag: \\"\$\{DEPLOY_IMAGE_REF\}\\"/);
  assert.match(publish, /git -C prod-deploy .*push origin HEAD:prod/);
  for (const step of [publish, workflowStep(production, 'Cut source release on Forgejo')]) {
    assert.match(step, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main' && !inputs\.git_ref\n/);
  }
  assert.doesNotMatch(production, /trusted[-_ ]approver/i);
  assert.doesNotMatch(production, /gh pr comment/);
  assert.doesNotMatch(production, /requires exactly one merged-to-main PR/i);
});

test('the base image is pinned in the Dockerfile, whose hash the fingerprint covers', () => {
  const dockerfile = readFileSync(`${root}Dockerfile`, 'utf8');
  assert.match(dockerfile, /^ARG NODE_BASE=\S+@sha256:[0-9a-f]{64}\r?$/m);
  assert.doesNotMatch(candidate, /NODE_BASE/);
  assert.doesNotMatch(production, /NODE_BASE/);
});

test('the completed cutover approval implementation stays deleted', () => {
  const retiredScript = ['exact', 'image', 'approval'].join('-');
  assert.equal(existsSync(`${root}scripts/${retiredScript}.mjs`), false);
  assert.equal(existsSync(`${root}scripts/${retiredScript}.test.mjs`), false);
  assert.equal(existsSync(`${root}backend/scripts/verify-live-media-cutover.mjs`), false);
  assert.equal(existsSync(`${root}backend/scripts/verify-live-media-cutover.test.mjs`), false);
  assert.equal(existsSync(`${root}docs/runtime-asset-cutover-runbook.md`), false);
  assert.doesNotMatch(candidate, new RegExp(retiredScript));
  assert.doesNotMatch(production, new RegExp(retiredScript));
});
