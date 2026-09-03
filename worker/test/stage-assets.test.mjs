import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { rename as renameAsync, rm as rmAsync } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  enforceAssetLimits,
  MAX_ASSET_PATHS,
  MAX_ASSET_SIZE,
  parseInventory,
  stageAssets,
  StagingError,
  validateAssetPath,
} from "../scripts/stage-assets.mjs";

const EXPECTED_HEADERS = `/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=300

/llms.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=300

/llms-full.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=300
`;

const BLOB_ID = "0123456789012345678901234567890123456789";
const WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PRETTIER_PATH = path.join(
  WORKER_PATH,
  "node_modules",
  "prettier",
  "bin",
  "prettier.cjs",
);

function git(repoPath, args, options = {}) {
  return execFileSync("git", ["--no-replace-objects", ...args], {
    cwd: repoPath,
    encoding: options.encoding ?? "utf8",
    env: options.env,
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function makeRepo(t) {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "stage-assets-test-"));
  t.after(() => rmSync(repoPath, { force: true, recursive: true }));
  git(repoPath, ["init", "-q"]);
  git(repoPath, ["config", "user.email", "staging-test@example.invalid"]);
  git(repoPath, ["config", "user.name", "Staging Test"]);
  writeFileSync(path.join(repoPath, ".gitignore"), ".staged-assets/\n");
  return repoPath;
}

function write(repoPath, relativePath, contents) {
  const destination = path.join(repoPath, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function commit(repoPath, message) {
  git(repoPath, ["add", "-A"]);
  git(repoPath, ["commit", "-qm", message]);
  return git(repoPath, ["rev-parse", "HEAD"]).trim();
}

function outputFiles(rootPath, relativePath = "") {
  const files = [];

  for (const child of readdirSync(path.join(rootPath, relativePath), {
    withFileTypes: true,
  })) {
    const childPath = relativePath
      ? `${relativePath}/${child.name}`
      : child.name;
    if (child.isDirectory()) files.push(...outputFiles(rootPath, childPath));
    else files.push(childPath);
  }

  return files.sort();
}

function generatedSiblingNames(rootPath) {
  return readdirSync(rootPath)
    .filter(
      (name) =>
        name.startsWith(".staged-assets.tmp-") ||
        name.startsWith(".staged-assets.backup-"),
    )
    .sort();
}

function injectedFailure(message) {
  return Object.assign(new Error(message), { code: "EIO" });
}

async function captureRejection(promise) {
  let rejection;

  try {
    await promise;
  } catch (error) {
    rejection = error;
  }

  assert.ok(rejection instanceof Error, "expected the operation to reject");
  return rejection;
}

function inventoryRecord({
  mode = "100644",
  objectId = BLOB_ID,
  pathBuffer,
  size = 1,
  type = "blob",
}) {
  return Buffer.concat([
    Buffer.from(`${mode} ${type} ${objectId} ${size}\t`),
    pathBuffer,
    Buffer.from([0]),
  ]);
}

function hashBlob(repoPath, contents) {
  return git(repoPath, ["hash-object", "-w", "--stdin"], {
    input: contents,
  }).trim();
}

function makeTree(repoPath, entries) {
  const input = Buffer.concat(
    entries.flatMap((entry) => [
      Buffer.from(`${entry.mode} ${entry.type} ${entry.objectId}\t`),
      entry.pathBuffer ?? Buffer.from(entry.path),
      Buffer.from([0]),
    ]),
  );
  return git(repoPath, ["mktree", "-z"], { input }).trim();
}

function commitTree(repoPath, treeId, message) {
  return git(repoPath, ["commit-tree", treeId], {
    input: `${message}\n`,
  }).trim();
}

test("stages exactly the ADR-0006 paths and exact Git blob bytes", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");
  const arbitraryBytes = Buffer.from([0x00, 0xff, 0x80, 0x0a, 0x41]);

  write(repoPath, "public.md", arbitraryBytes);
  write(repoPath, "nested/public.md", "nested\r\nbytes\n");
  write(repoPath, "nested/worker/public.md", "nested worker is public");
  write(repoPath, "workerish/public.md", "workerish is public");
  write(repoPath, "worker/private.md", "private");
  write(repoPath, ".github/private.md", "private");
  write(repoPath, "uppercase.MD", "wrong case");
  write(repoPath, "public.md.more", "wrong suffix");
  write(repoPath, "nested/llms.txt", "not a root index");
  write(repoPath, "llms.txt", "index bytes");
  write(repoPath, "llms-full.txt", "full index bytes");
  write(repoPath, "ignored.txt", "ignored");
  chmodSync(path.join(repoPath, "public.md"), 0o755);
  const sourceCommit = commit(repoPath, "source");

  write(repoPath, "public.md", "unstaged worktree replacement");
  write(repoPath, "nested/public.md", "staged index replacement");
  git(repoPath, ["add", "nested/public.md"]);

  const result = await stageAssets({
    outputPath,
    repoPath,
    treeish: sourceCommit,
  });

  assert.equal(result.commitId, sourceCommit);
  assert.deepEqual(outputFiles(outputPath), [
    "_headers",
    "llms-full.txt",
    "llms.txt",
    "nested/public.md",
    "nested/worker/public.md",
    "public.md",
    "workerish/public.md",
  ]);
  assert.deepEqual(
    readFileSync(path.join(outputPath, "public.md")),
    arbitraryBytes,
  );
  assert.equal(
    readFileSync(path.join(outputPath, "nested/public.md"), "utf8"),
    "nested\r\nbytes\n",
  );
  assert.equal(
    readFileSync(path.join(outputPath, "_headers"), "utf8"),
    EXPECTED_HEADERS,
  );
});

test("fresh replacement handles add, update, delete, rename, and repeatability", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "rename-me.md", "old");
  write(repoPath, "delete-me.md", "delete");
  const firstCommit = commit(repoPath, "first");
  await stageAssets({ outputPath, repoPath, treeish: firstCommit });

  git(repoPath, ["mv", "rename-me.md", "renamed.md"]);
  write(repoPath, "renamed.md", "updated");
  rmSync(path.join(repoPath, "delete-me.md"));
  write(repoPath, "added.md", "added");
  const secondCommit = commit(repoPath, "second");
  write(outputPath, "stale.md", "must disappear");

  await stageAssets({ outputPath, repoPath, treeish: secondCommit });
  const firstResult = new Map(
    outputFiles(outputPath).map((assetPath) => [
      assetPath,
      readFileSync(path.join(outputPath, assetPath)),
    ]),
  );

  await stageAssets({ outputPath, repoPath, treeish: secondCommit });
  const secondResult = new Map(
    outputFiles(outputPath).map((assetPath) => [
      assetPath,
      readFileSync(path.join(outputPath, assetPath)),
    ]),
  );

  assert.deepEqual(
    [...firstResult.keys()],
    ["_headers", "added.md", "renamed.md"],
  );
  assert.equal(firstResult.get("renamed.md").toString(), "updated");
  assert.deepEqual(secondResult, firstResult);
});

test("post-build verification failure preserves output and removes the temporary sibling", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "previous output");
  const previousCommit = commit(repoPath, "previous");
  await stageAssets({ outputPath, repoPath, treeish: previousCommit });

  write(repoPath, "public.md", "candidate output");
  const candidateCommit = commit(repoPath, "candidate");
  let verificationPath;

  await assert.rejects(
    stageAssets(
      { outputPath, repoPath, treeish: candidateCommit },
      {
        readdir: async (directory) => {
          verificationPath = directory;
          assert.equal(
            readFileSync(path.join(directory, "public.md"), "utf8"),
            "candidate output",
          );
          assert.equal(
            readFileSync(path.join(directory, "_headers"), "utf8"),
            EXPECTED_HEADERS,
          );
          throw injectedFailure("injected post-build verification failure");
        },
      },
    ),
    /Could not build or replace the staged asset directory/u,
  );

  assert.match(path.basename(verificationPath), /^\.staged-assets\.tmp-/u);
  assert.equal(
    readFileSync(path.join(outputPath, "public.md"), "utf8"),
    "previous output",
  );
  assert.deepEqual(generatedSiblingNames(repoPath), []);
});

test("replacement failure restores prior completed output without residue", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "previous output");
  const previousCommit = commit(repoPath, "previous");
  await stageAssets({ outputPath, repoPath, treeish: previousCommit });

  write(repoPath, "public.md", "candidate output");
  const candidateCommit = commit(repoPath, "candidate");
  let replacementWasAttempted = false;

  await assert.rejects(
    stageAssets(
      { outputPath, repoPath, treeish: candidateCommit },
      {
        rename: async (source, destination) => {
          if (
            destination === outputPath &&
            path.basename(source).startsWith(".staged-assets.tmp-")
          ) {
            replacementWasAttempted = true;
            assert.equal(
              readFileSync(path.join(source, "public.md"), "utf8"),
              "candidate output",
            );
            throw injectedFailure("injected final replacement failure");
          }

          await renameAsync(source, destination);
        },
      },
    ),
    /Could not build or replace the staged asset directory/u,
  );

  assert.equal(replacementWasAttempted, true);
  assert.equal(
    readFileSync(path.join(outputPath, "public.md"), "utf8"),
    "previous output",
  );
  assert.equal(
    readFileSync(path.join(outputPath, "_headers"), "utf8"),
    EXPECTED_HEADERS,
  );
  assert.deepEqual(generatedSiblingNames(repoPath), []);
});

test("failed replacement and restoration report the recoverable prior output", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "previous output");
  const previousCommit = commit(repoPath, "previous");
  await stageAssets({ outputPath, repoPath, treeish: previousCommit });

  write(repoPath, "public.md", "candidate output");
  const candidateCommit = commit(repoPath, "candidate");
  let backupPath;

  const error = await captureRejection(
    stageAssets(
      { outputPath, repoPath, treeish: candidateCommit },
      {
        rename: async (source, destination) => {
          if (
            destination === outputPath &&
            path.basename(source).startsWith(".staged-assets.tmp-")
          ) {
            throw injectedFailure("injected final replacement failure");
          }
          if (
            destination === outputPath &&
            path.basename(source).startsWith(".staged-assets.backup-")
          ) {
            backupPath = source;
            throw injectedFailure("injected prior output restoration failure");
          }

          await renameAsync(source, destination);
        },
      },
    ),
  );

  assert.match(
    error.message,
    /previous completed output remains recoverable at /u,
  );
  assert.equal(error.message.includes(backupPath), true);
  assert.equal(
    readFileSync(path.join(backupPath, "public.md"), "utf8"),
    "previous output",
  );
  assert.equal(readdirSync(repoPath).includes(".staged-assets"), false);
  assert.deepEqual(generatedSiblingNames(repoPath), [
    path.basename(backupPath),
  ]);
});

test("temporary cleanup failure is surfaced with its exact residue", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "previous output");
  const previousCommit = commit(repoPath, "previous");
  await stageAssets({ outputPath, repoPath, treeish: previousCommit });

  write(repoPath, "public.md", "candidate output");
  const candidateCommit = commit(repoPath, "candidate");
  let tempPath;

  const error = await captureRejection(
    stageAssets(
      { outputPath, repoPath, treeish: candidateCommit },
      {
        readdir: async (directory) => {
          tempPath = directory;
          throw injectedFailure("injected post-build verification failure");
        },
        rm: async (target, options) => {
          if (target === tempPath) {
            throw injectedFailure("injected temporary cleanup failure");
          }
          await rmAsync(target, options);
        },
      },
    ),
  );

  assert.match(error.message, /could not clean temporary staged asset/u);
  assert.equal(error.message.includes(tempPath), true);
  assert.equal(
    readFileSync(path.join(outputPath, "public.md"), "utf8"),
    "previous output",
  );
  assert.deepEqual(generatedSiblingNames(repoPath), [path.basename(tempPath)]);
});

test("backup cleanup failure is surfaced while both completed outputs remain recoverable", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "previous output");
  const previousCommit = commit(repoPath, "previous");
  await stageAssets({ outputPath, repoPath, treeish: previousCommit });

  write(repoPath, "public.md", "candidate output");
  const candidateCommit = commit(repoPath, "candidate");
  let backupPath;

  const error = await captureRejection(
    stageAssets(
      { outputPath, repoPath, treeish: candidateCommit },
      {
        rm: async (target, options) => {
          if (path.basename(target).startsWith(".staged-assets.backup-")) {
            backupPath = target;
            throw injectedFailure("injected backup cleanup failure");
          }
          await rmAsync(target, options);
        },
      },
    ),
  );

  assert.match(error.message, /Could not clean previous staged asset/u);
  assert.equal(error.message.includes(backupPath), true);
  assert.equal(
    readFileSync(path.join(outputPath, "public.md"), "utf8"),
    "candidate output",
  );
  assert.equal(
    readFileSync(path.join(backupPath, "public.md"), "utf8"),
    "previous output",
  );
  assert.deepEqual(generatedSiblingNames(repoPath), [
    path.basename(backupPath),
  ]);
});

test("replacement refs do not change the explicit commit that is staged", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "public.md", "original");
  const originalCommit = commit(repoPath, "original");
  write(repoPath, "public.md", "replacement");
  const replacementCommit = commit(repoPath, "replacement");
  git(repoPath, ["replace", originalCommit, replacementCommit]);

  await stageAssets({ outputPath, repoPath, treeish: originalCommit });

  assert.equal(
    readFileSync(path.join(outputPath, "public.md"), "utf8"),
    "original",
  );
});

test("selected symlinks and gitlinks fail without exposing partial output", async (t) => {
  await t.test("symlink", async (t) => {
    const repoPath = makeRepo(t);
    const outputPath = path.join(repoPath, ".staged-assets");
    mkdirSync(outputPath);
    write(outputPath, "previous.md", "previous output");
    write(repoPath, "target", "target");
    symlinkSync("target", path.join(repoPath, "linked.md"));
    const sourceCommit = commit(repoPath, "symlink");

    await assert.rejects(
      stageAssets({ outputPath, repoPath, treeish: sourceCommit }),
      (error) =>
        error instanceof StagingError &&
        error.message === "Selected entry is not a regular Git blob",
    );
    assert.deepEqual(outputFiles(outputPath), ["previous.md"]);
    assert.equal(
      readFileSync(path.join(outputPath, "previous.md"), "utf8"),
      "previous output",
    );
  });

  await t.test("gitlink", async (t) => {
    const repoPath = makeRepo(t);
    const outputPath = path.join(repoPath, ".staged-assets");
    const ordinaryTree = makeTree(repoPath, []);
    const linkedCommit = commitTree(repoPath, ordinaryTree, "linked commit");
    const treeId = makeTree(repoPath, [
      {
        mode: "160000",
        objectId: linkedCommit,
        path: "linked.md",
        type: "commit",
      },
    ]);
    const sourceCommit = commitTree(repoPath, treeId, "gitlink tree");

    await assert.rejects(
      stageAssets({ outputPath, repoPath, treeish: sourceCommit }),
      /Selected entry is not a regular Git blob/u,
    );
    assert.equal(
      readdirSync(repoPath).some((name) =>
        name.startsWith(".staged-assets.tmp-"),
      ),
      false,
    );
  });
});

test("real Git tree inventory rejects selected-looking trees but permits ordinary ancestors", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  write(repoPath, "docs/adr/public.md", "nested public Markdown");
  const ordinaryCommit = commit(repoPath, "ordinary ancestors");
  await stageAssets({ outputPath, repoPath, treeish: ordinaryCommit });

  assert.deepEqual(outputFiles(outputPath), ["_headers", "docs/adr/public.md"]);
  assert.equal(
    readFileSync(path.join(outputPath, "docs/adr/public.md"), "utf8"),
    "nested public Markdown",
  );

  write(repoPath, "public.md/child.txt", "not a blob named public.md");
  const selectedTreeCommit = commit(repoPath, "selected-looking tree");

  await assert.rejects(
    stageAssets({ outputPath, repoPath, treeish: selectedTreeCommit }),
    /Selected entry is not a regular Git blob/u,
  );
  assert.deepEqual(outputFiles(outputPath), ["_headers", "docs/adr/public.md"]);
});

test("unsafe and reserved selected paths are refused", () => {
  const unsafePaths = [
    "/absolute.md",
    "trailing.md/",
    "empty//segment.md",
    "./relative.md",
    "../parent.md",
    "back\\slash.md",
    "query?name.md",
    "fragment#name.md",
    "percent%2fname.md",
    "control\u0001.md",
    "format\u200e.md",
    "Cafe\u0301.md",
    ".assetsignore",
    "_headers",
    "_redirects",
    "_worker.js",
    "_worker.js/public.md",
    "cdn-cgi/public.md",
  ];

  for (const assetPath of unsafePaths) {
    assert.throws(() => validateAssetPath(assetPath), StagingError, assetPath);
  }
});

test("invalid UTF-8 in a selected-looking Git path is refused", () => {
  const inventory = inventoryRecord({
    pathBuffer: Buffer.from([0xff, 0x2e, 0x6d, 0x64]),
  });

  assert.throws(() => parseInventory(inventory), /not valid UTF-8/u);
});

test("inventory parsing refuses partial, malformed, and duplicate records", () => {
  const valid = inventoryRecord({ pathBuffer: Buffer.from("public.md") });
  const malformed = Buffer.from(`100644 blob ${BLOB_ID} 1 public.md\0`);

  assert.throws(() => parseInventory(valid.subarray(0, -1)), /incomplete/u);
  assert.throws(() => parseInventory(malformed), /malformed record/u);
  assert.throws(
    () => parseInventory(Buffer.concat([valid, valid])),
    /duplicate selected path/u,
  );
});

test("ordinary asset size limit is inclusive", () => {
  assert.doesNotThrow(() =>
    enforceAssetLimits([{ path: "maximum.md", size: MAX_ASSET_SIZE }]),
  );
  assert.throws(
    () =>
      enforceAssetLimits([{ path: "too-large.md", size: MAX_ASSET_SIZE + 1 }]),
    new RegExp(`${MAX_ASSET_SIZE} bytes`, "u"),
  );
});

test("ordinary selected path cap is inclusive", () => {
  const maximum = Array.from({ length: MAX_ASSET_PATHS }, (_, index) => ({
    path: `${index}.md`,
    size: 0,
  }));

  assert.doesNotThrow(() => enforceAssetLimits(maximum));
  assert.throws(
    () =>
      enforceAssetLimits([...maximum, { path: "one-too-many.md", size: 0 }]),
    new RegExp(`exceeds ${MAX_ASSET_PATHS}`, "u"),
  );
});

test("a non-commit input fails concisely and leaves no output", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");

  await assert.rejects(
    stageAssets({ outputPath, repoPath, treeish: "does-not-exist" }),
    (error) =>
      error instanceof StagingError &&
      error.message === "Git commit resolution failed",
  );
  assert.equal(readdirSync(repoPath).includes(".staged-assets"), false);
});

test("real Git inventory rejects a selected reserved prefix", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");
  write(repoPath, "_worker.js/public.md", "reserved");
  const sourceCommit = commit(repoPath, "reserved prefix");

  await assert.rejects(
    stageAssets({ outputPath, repoPath, treeish: sourceCommit }),
    /reserved _worker\.js prefix/u,
  );
});

test("real Git inventory rejects an invalid UTF-8 selected path", async (t) => {
  const repoPath = makeRepo(t);
  const outputPath = path.join(repoPath, ".staged-assets");
  const objectId = hashBlob(repoPath, Buffer.from("unsafe name"));
  const treeId = makeTree(repoPath, [
    {
      mode: "100644",
      objectId,
      pathBuffer: Buffer.from([0xff, 0x2e, 0x6d, 0x64]),
      type: "blob",
    },
  ]);
  const sourceCommit = commitTree(repoPath, treeId, "invalid UTF-8 path");

  await assert.rejects(
    stageAssets({ outputPath, repoPath, treeish: sourceCommit }),
    /not valid UTF-8/u,
  );
});

test("Prettier ignores final, temporary, and backup generated directories", (t) => {
  const fixturePath = mkdtempSync(
    path.join(os.tmpdir(), "stage-assets-format-"),
  );
  t.after(() => rmSync(fixturePath, { force: true, recursive: true }));

  writeFileSync(
    path.join(fixturePath, ".prettierignore"),
    readFileSync(path.join(WORKER_PATH, ".prettierignore")),
  );
  const generatedDirectories = [
    ".staged-assets",
    ".staged-assets.tmp-fixture",
    ".staged-assets.backup-fixture",
  ];
  const unformatted = '{"value":1}';

  for (const directory of generatedDirectories) {
    write(fixturePath, `${directory}/mutation.json`, unformatted);
    const info = JSON.parse(
      execFileSync(
        process.execPath,
        [
          PRETTIER_PATH,
          "--file-info",
          `${directory}/mutation.json`,
          "--ignore-path",
          ".prettierignore",
        ],
        { cwd: fixturePath, encoding: "utf8" },
      ),
    );
    assert.equal(info.ignored, true, directory);
  }

  write(fixturePath, "control.json", unformatted);
  execFileSync(
    process.execPath,
    [PRETTIER_PATH, "--write", ".", "--ignore-path", ".prettierignore"],
    { cwd: fixturePath, stdio: "pipe" },
  );

  assert.notEqual(
    readFileSync(path.join(fixturePath, "control.json"), "utf8"),
    unformatted,
  );
  for (const directory of generatedDirectories) {
    assert.equal(
      readFileSync(path.join(fixturePath, directory, "mutation.json"), "utf8"),
      unformatted,
      directory,
    );
  }
});
