import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BaselineGuardError,
  checkBaseline,
  MACHINERY_PATHS,
} from "../scripts/check-baseline.mjs";

function git(repoPath, args, options = {}) {
  return execFileSync("git", ["--no-replace-objects", ...args], {
    cwd: repoPath,
    encoding: "utf8",
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function write(repoPath, relativePath, contents) {
  const destination = path.join(repoPath, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function commit(repoPath, message) {
  git(repoPath, ["add", "-A"]);
  git(repoPath, ["commit", "-qm", message]);
  return git(repoPath, ["rev-parse", "HEAD"]);
}

function setNetworkMain(repoPath, commitId) {
  git(repoPath, ["update-ref", "refs/remotes/origin/main", commitId]);
}

function makeFixture(t) {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "baseline-guard-test-"));
  t.after(() => rmSync(repoPath, { force: true, recursive: true }));
  git(repoPath, ["init", "-q"]);
  git(repoPath, ["config", "user.email", "baseline-test@example.invalid"]);
  git(repoPath, ["config", "user.name", "Baseline Test"]);
  write(repoPath, "worker/src/index.js", "export default {};\n");
  write(repoPath, ".github/workflows/publish.yml", "name: Publish\n");
  write(repoPath, ".github/actions/helper/action.yml", "name: Helper\n");
  write(repoPath, "public.md", "baseline content\n");
  const baseline = commit(repoPath, "baseline");
  setNetworkMain(repoPath, baseline);
  return { baseline, repoPath };
}

test("equal baseline machinery passes", (t) => {
  const { baseline, repoPath } = makeFixture(t);

  assert.deepEqual(
    checkBaseline({
      baselineCommit: baseline,
      currentCommit: baseline,
      repoPath,
    }),
    { baselineCommit: baseline, currentCommit: baseline },
  );
});

test("content-only commits pass with a complete current tree", (t) => {
  const { baseline, repoPath } = makeFixture(t);
  write(repoPath, "public.md", "updated content\n");
  write(repoPath, "new-public.md", "new content\n");
  const current = commit(repoPath, "content only");
  setNetworkMain(repoPath, current);

  assert.doesNotThrow(() =>
    checkBaseline({
      baselineCommit: baseline,
      currentCommit: current,
      repoPath,
    }),
  );
});

test("every serving-machinery class refuses automatic publication", async (t) => {
  const machineryChanges = [
    ["worker", "worker/src/index.js"],
    ["workflow", ".github/workflows/publish.yml"],
    ["action", ".github/actions/helper/action.yml"],
  ];

  for (const [label, changedPath] of machineryChanges) {
    await t.test(label, () => {
      const { baseline, repoPath } = makeFixture(t);
      write(repoPath, changedPath, `${label} changed\n`);
      const current = commit(repoPath, `${label} change`);
      setNetworkMain(repoPath, current);

      assert.throws(
        () =>
          checkBaseline({
            baselineCommit: baseline,
            currentCommit: current,
            repoPath,
          }),
        /Serving machinery differs/u,
      );
    });
  }
});

test("the guard boundary includes its worker script and automatic workflow", () => {
  assert.deepEqual(MACHINERY_PATHS, [
    "worker",
    ".github/workflows",
    ".github/actions",
  ]);
});

test("missing, malformed, and unavailable baseline identities fail closed", (t) => {
  const { baseline, repoPath } = makeFixture(t);

  for (const invalidBaseline of ["", "abc123", "0".repeat(40)]) {
    assert.throws(
      () =>
        checkBaseline({
          baselineCommit: invalidBaseline,
          currentCommit: baseline,
          repoPath,
        }),
      BaselineGuardError,
      invalidBaseline || "missing baseline",
    );
  }
});

test("missing, malformed, and unavailable current identities fail closed", (t) => {
  const { baseline, repoPath } = makeFixture(t);

  for (const invalidCurrent of ["", "abc123", "0".repeat(40)]) {
    assert.throws(
      () =>
        checkBaseline({
          baselineCommit: baseline,
          currentCommit: invalidCurrent,
          repoPath,
        }),
      BaselineGuardError,
      invalidCurrent || "missing current source",
    );
  }
});

test("a baseline that is not an ancestor of current main fails closed", (t) => {
  const { baseline, repoPath } = makeFixture(t);
  write(repoPath, "public.md", "current content\n");
  const current = commit(repoPath, "current");
  setNetworkMain(repoPath, current);
  const baselineTree = git(repoPath, ["rev-parse", `${baseline}^{tree}`]);
  const unrelatedBaseline = git(repoPath, ["commit-tree", baselineTree], {
    input: "unrelated baseline\n",
  });

  assert.throws(
    () =>
      checkBaseline({
        baselineCommit: unrelatedBaseline,
        currentCommit: current,
        repoPath,
      }),
    /not an ancestor/u,
  );
});

test("stale network main and stale checked-out HEAD each fail closed", async (t) => {
  await t.test("network main", () => {
    const { baseline, repoPath } = makeFixture(t);
    write(repoPath, "public.md", "current content\n");
    const current = commit(repoPath, "current");

    assert.throws(
      () =>
        checkBaseline({
          baselineCommit: baseline,
          currentCommit: current,
          repoPath,
        }),
      /Network-current main does not match/u,
    );
  });

  await t.test("checked-out HEAD", () => {
    const { baseline, repoPath } = makeFixture(t);
    write(repoPath, "public.md", "next content\n");
    const current = commit(repoPath, "next");
    setNetworkMain(repoPath, baseline);

    assert.throws(
      () =>
        checkBaseline({
          baselineCommit: baseline,
          currentCommit: baseline,
          repoPath,
        }),
      /Checked-out HEAD does not match/u,
    );

    assert.notEqual(current, baseline);
  });
});
