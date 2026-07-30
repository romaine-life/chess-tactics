import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidatePath = `${root}.github/workflows/docker-build-check.yaml`;
const productionPath = `${root}.github/workflows/build-and-deploy.yaml`;
const backendPackagePath = `${root}backend/package.json`;
const readWorkflow = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const candidate = readWorkflow(candidatePath);
const production = readWorkflow(productionPath);
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
  for (const [label, source, finalJobId, finalJobName] of [
    ['pull-request', candidate, 'test-and-build', 'Test and build app image'],
    ['production', production, 'build-and-deploy', 'Build merged image and pin Helm digest'],
  ]) {
    const backend = workflowJob(source, 'backend-tests');
    const frontend = workflowJob(source, 'frontend-checks');
    const final = workflowJob(source, finalJobId);

    assert.match(backend, /name: Test backend/);
    assert.match(backend, /DATABASE_URL:/);
    assert.match(backend, /\bnpm test\b/);
    assert.doesNotMatch(backend, /npm run check/);

    assert.match(frontend, /name: Check frontend contracts/);
    assert.match(frontend, /\bnpm run check\b/);
    assert.match(frontend, /node --test scripts\/immutable-image-release\.test\.mjs/);
    assert.doesNotMatch(frontend, /DATABASE_URL:/);

    assert.match(final, new RegExp(`name: ${finalJobName}`));
    assert.match(final, /needs: \[backend-tests, frontend-checks\]/);
    assert.doesNotMatch(final, /\bnpm test\b|\bnpm run check\b|DATABASE_URL:/);

    assert.equal(
      (source.match(/\bnpm run check\b/g) ?? []).length,
      1,
      `${label} workflow must run the frontend gate exactly once`,
    );
  }

  assert.equal(backendPackage.scripts.test, 'npm run test:prepare && npm run test:backend');
  assert.match(backendPackage.scripts['test:prepare'], /frontend run build &&/);
  assert.match(backendPackage.scripts['test:prepare'], /frontend run build:trainer/);
  assert.doesNotMatch(backendPackage.scripts['test:prepare'], /frontend run check/);
  assert.doesNotMatch(backendPackage.scripts['test:backend'], /frontend/);
});

test('pull-request CI publishes the tested ref for validation without owning production release state', () => {
  const build = workflowStep(candidate, 'Build and push image');
  const alias = workflowStep(candidate, 'Tag app image by commit');

  assert.match(build, /uses: docker\/build-push-action@v7/);
  assert.match(build, /platforms: linux\/amd64/);
  assert.match(build, /NODE_BASE=\$\{\{ steps\.fingerprint\.outputs\.resolved_base_ref \}\}/);
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
  assert.match(build, /NODE_BASE=\$\{\{ steps\.fingerprint\.outputs\.resolved_base_ref \}\}/);
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
  assert.match(publish, /git -C prod-deploy push origin HEAD:prod/);
  assert.doesNotMatch(production, /trusted[-_ ]approver/i);
  assert.doesNotMatch(production, /gh pr comment/);
  assert.doesNotMatch(production, /requires exactly one merged-to-main PR/i);
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
