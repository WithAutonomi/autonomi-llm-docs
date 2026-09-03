import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_PATH = path.resolve(WORKER_PATH, "..");
const WORKFLOW_PATH = path.join(REPO_PATH, ".github", "workflows");

function workflow(name) {
  return readFileSync(path.join(WORKFLOW_PATH, name), "utf8");
}

const automatic = workflow("publish-assets-production.yml");
const preview = workflow("deploy-worker-preview.yml");
const production = workflow("deploy-worker-production.yml");
const workerCheck = workflow("worker-check.yml");
const packageConfig = JSON.parse(
  readFileSync(path.join(WORKER_PATH, "package.json"), "utf8"),
);

function indexOfRequired(source, text) {
  const index = source.indexOf(text);
  assert.notEqual(index, -1, `missing ${JSON.stringify(text)}`);
  return index;
}

function steps(source) {
  return source.split(/\n(?=      - name: )/u).slice(1);
}

function assertSecretsOnlyInDeployStep(source, deployStepName) {
  const workflowSteps = steps(source);
  const deployStep = workflowSteps.find((step) =>
    step.startsWith(`      - name: ${deployStepName}\n`),
  );
  assert.notEqual(deployStep, undefined);

  const secretNames = [...source.matchAll(/secrets\.([A-Z0-9_]+)/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(secretNames, [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
  ]);

  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    const reference = `secrets.${name}`;
    assert.equal(source.split(reference).length - 1, 1, reference);
    assert.equal(deployStep.includes(reference), true, reference);
  }

  for (const step of workflowSteps) {
    if (step === deployStep) continue;
    assert.equal(step.includes("secrets."), false);
  }
}

test("Worker CI stages the exact checked-out complete set before checks", () => {
  assert.match(
    workerCheck,
    /on:\n  pull_request:\n  push:\n    branches:\n      - main\n/u,
  );
  assert.equal(workerCheck.includes("paths:"), false);
  assert.match(workerCheck, /ref: \$\{\{ github\.sha \}\}/u);
  assert.ok(
    indexOfRequired(workerCheck, 'npm run stage:assets -- "$GITHUB_SHA"') <
      indexOfRequired(workerCheck, "npm run check"),
  );
});

test("automatic publication is inert unless exactly enabled", () => {
  assert.match(automatic, /on:\n  push:\n    branches:\n      - main\n/u);
  assert.equal(automatic.includes("paths:"), false);
  assert.equal(automatic.includes("workflow_dispatch"), false);
  assert.match(
    automatic,
    /if: vars\.AUTOMATIC_PRODUCTION_PUBLICATION == 'enabled'/u,
  );
  assert.equal(automatic.includes("environment:"), false);
});

test("automatic publication checks current main and baseline before credentials", () => {
  const fetchIndex = indexOfRequired(
    automatic,
    "+refs/heads/main:refs/remotes/origin/main",
  );
  const guardIndex = indexOfRequired(automatic, "npm run guard:production");
  const finalStageIndex = automatic.lastIndexOf(
    'npm run stage:assets -- "$GITHUB_SHA"',
  );
  const deployIndex = indexOfRequired(automatic, "npm run deploy:production");

  assert.ok(fetchIndex < guardIndex);
  assert.ok(guardIndex < finalStageIndex);
  assert.ok(finalStageIndex < deployIndex);
  assert.match(automatic, /vars\.PRODUCTION_BASELINE_SHA/u);
  assertSecretsOnlyInDeployStep(
    automatic,
    "Publish complete public set to production",
  );
});

test("manual deployments stage exact bytes and keep protection boundaries", () => {
  for (const source of [preview, production]) {
    assert.match(source, /ref: \$\{\{ github\.sha \}\}/u);
    assert.match(source, /if: github\.ref == 'refs\/heads\/main'/u);
    assert.match(source, /environment: production/u);
    assert.ok(
      indexOfRequired(source, 'npm run stage:assets -- "$GITHUB_SHA"') <
        indexOfRequired(source, "npm run check"),
    );
  }

  assert.match(
    production,
    /--message "Protected manual baseline commit \$GITHUB_SHA"/u,
  );
  assertSecretsOnlyInDeployStep(production, "Deploy production Worker");
  assertSecretsOnlyInDeployStep(preview, "Deploy preview Worker");
});

test("all repository production writes share non-cancelling concurrency", () => {
  for (const source of [automatic, production]) {
    assert.match(source, /group: autonomi-worker-production/u);
    assert.match(source, /cancel-in-progress: false/u);
  }

  assert.equal(preview.includes("group: autonomi-worker-production"), false);
  assert.match(preview, /group: deploy-worker-preview/u);
  assert.match(preview, /cancel-in-progress: false/u);
});

test("workflows use hosted runners, mutable-major Actions, and fixed deploys", () => {
  for (const source of [automatic, preview, production, workerCheck]) {
    assert.match(source, /runs-on: ubuntu-latest/u);
    for (const action of source.matchAll(/uses: ([^\s]+)@([^\s]+)/gu)) {
      assert.match(action[2], /^v\d+$/u, action[0]);
    }
  }

  assert.match(automatic, /npm run deploy:production --\s+--message/u);
  assert.match(production, /npm run deploy:production --\s+--message/u);
  assert.match(preview, /npm run deploy:preview --\s+--message/u);
  assert.equal(packageConfig.devDependencies.wrangler, "4.119.0");
  assert.equal(
    packageConfig.scripts["deploy:production"],
    "npm run assert:production && wrangler deploy --config wrangler.jsonc",
  );
  assert.equal(
    packageConfig.scripts["deploy:preview"],
    "npm run assert:preview && wrangler deploy --config wrangler.preview.jsonc",
  );
  for (const source of [automatic, preview, production]) {
    assert.equal(source.includes("wrangler@"), false);
    assert.equal(source.includes("api.cloudflare.com"), false);
    assert.equal(source.includes("curl "), false);
    assert.equal(source.includes("workflow-runs"), false);
  }
});
