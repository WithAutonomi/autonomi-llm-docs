import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

export const MAX_ASSET_SIZE = 26_214_400;
export const MAX_ASSET_PATHS = 20_000;

export const HEADERS = `/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=300

/llms.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=300

/llms-full.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=300
`;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const RESERVED_ROOT_NAMES = new Set([
  ".assetsignore",
  "_headers",
  "_redirects",
]);
const DEFAULT_FILE_OPERATIONS = Object.freeze({ readdir, rename, rm });

export class StagingError extends Error {
  constructor(message) {
    super(message);
    this.name = "StagingError";
  }
}

function stagingError(message) {
  return new StagingError(message);
}

function isMissingPathError(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function normalizeStagingFailure(error) {
  return error instanceof StagingError
    ? error
    : stagingError("Could not build or replace the staged asset directory");
}

function appendFailureDetail(error, detail) {
  return stagingError(`${normalizeStagingFailure(error).message}; ${detail}`);
}

async function runGit(repoPath, args, operation, input = undefined) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["--no-replace-objects", ...args], {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    let settled = false;

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.resume();
    child.on("error", () => {
      if (!settled) {
        settled = true;
        reject(stagingError(`Git ${operation} failed`));
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(stagingError(`Git ${operation} failed`));
        return;
      }

      resolve(Buffer.concat(stdout));
    });

    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function isExactBuffer(buffer, value) {
  return buffer.equals(Buffer.from(value));
}

function firstRawSegment(pathBuffer) {
  const slash = pathBuffer.indexOf(0x2f);
  return slash === -1 ? pathBuffer : pathBuffer.subarray(0, slash);
}

function looksSelected(pathBuffer) {
  if (
    isExactBuffer(pathBuffer, "llms.txt") ||
    isExactBuffer(pathBuffer, "llms-full.txt")
  ) {
    return true;
  }

  if (!pathBuffer.subarray(-3).equals(Buffer.from(".md"))) return false;

  const firstSegment = firstRawSegment(pathBuffer);
  return !["worker", ".github"].some((segment) =>
    isExactBuffer(firstSegment, segment),
  );
}

export function validateAssetPath(assetPath) {
  if (typeof assetPath !== "string" || assetPath.length === 0) {
    throw stagingError("Selected path is empty");
  }
  if (assetPath.startsWith("/") || assetPath.endsWith("/")) {
    throw stagingError("Selected path is not relative and slash-separated");
  }
  if (assetPath.includes("\\")) {
    throw stagingError("Selected path contains a backslash");
  }
  if (assetPath.includes("?") || assetPath.includes("#")) {
    throw stagingError("Selected path contains a query or fragment delimiter");
  }
  if (/%[0-9a-fA-F]{2}/u.test(assetPath)) {
    throw stagingError("Selected path contains a percent-octet form");
  }
  if (/\p{Cc}|\p{Cf}/u.test(assetPath)) {
    throw stagingError("Selected path contains a control or format character");
  }
  if (assetPath.normalize("NFC") !== assetPath) {
    throw stagingError("Selected path is not normalized as NFC");
  }

  const segments = assetPath.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw stagingError("Selected path contains an unsafe segment");
  }
  if (segments.length === 1 && RESERVED_ROOT_NAMES.has(assetPath)) {
    throw stagingError("Selected path collides with a reserved root name");
  }
  if (assetPath === "_worker.js" || assetPath.startsWith("_worker.js/")) {
    throw stagingError(
      "Selected path collides with the reserved _worker.js prefix",
    );
  }
  if (segments[0] === "cdn-cgi") {
    throw stagingError("Selected path uses the reserved cdn-cgi first segment");
  }
}

function decodeSelectedPath(pathBuffer) {
  let assetPath;

  try {
    assetPath = UTF8_DECODER.decode(pathBuffer);
  } catch {
    throw stagingError("Selected path is not valid UTF-8");
  }

  validateAssetPath(assetPath);
  return assetPath;
}

function parseMetadata(metadataBuffer) {
  if (metadataBuffer.some((byte) => byte > 0x7f)) {
    throw stagingError("Git inventory contains malformed metadata");
  }

  const match = metadataBuffer
    .toString("ascii")
    .match(
      /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64}) +(-|[0-9]+)$/u,
    );

  if (match === null) {
    throw stagingError("Git inventory contains malformed metadata");
  }

  return {
    mode: match[1],
    type: match[2],
    objectId: match[3],
    sizeText: match[4],
  };
}

export function enforceAssetLimits(entries) {
  if (entries.length > MAX_ASSET_PATHS) {
    throw stagingError(`Selected asset count exceeds ${MAX_ASSET_PATHS}`);
  }

  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > MAX_ASSET_SIZE
    ) {
      throw stagingError(`Selected asset exceeds ${MAX_ASSET_SIZE} bytes`);
    }
  }
}

export function parseInventory(inventory) {
  if (!Buffer.isBuffer(inventory)) {
    throw stagingError("Git inventory is not a byte buffer");
  }
  if (inventory.length === 0) return [];
  if (inventory[inventory.length - 1] !== 0) {
    throw stagingError("Git inventory is incomplete");
  }

  const entries = [];
  const selectedPaths = new Set();
  let offset = 0;

  while (offset < inventory.length) {
    const terminator = inventory.indexOf(0, offset);
    if (terminator === offset || terminator === -1) {
      throw stagingError("Git inventory contains a malformed record");
    }

    const record = inventory.subarray(offset, terminator);
    const tab = record.indexOf(0x09);
    if (tab <= 0 || tab === record.length - 1) {
      throw stagingError("Git inventory contains a malformed record");
    }

    const metadata = parseMetadata(record.subarray(0, tab));
    const pathBuffer = record.subarray(tab + 1);
    offset = terminator + 1;

    if (!looksSelected(pathBuffer)) continue;
    if (
      metadata.type !== "blob" ||
      (metadata.mode !== "100644" && metadata.mode !== "100755")
    ) {
      throw stagingError("Selected entry is not a regular Git blob");
    }
    if (metadata.sizeText === "-") {
      throw stagingError("Selected Git blob has no readable size");
    }

    const assetPath = decodeSelectedPath(pathBuffer);
    if (selectedPaths.has(assetPath)) {
      throw stagingError("Git inventory contains a duplicate selected path");
    }
    selectedPaths.add(assetPath);

    const size = BigInt(metadata.sizeText);
    if (size > BigInt(MAX_ASSET_SIZE)) {
      throw stagingError(`Selected asset exceeds ${MAX_ASSET_SIZE} bytes`);
    }

    entries.push({
      mode: metadata.mode,
      objectId: metadata.objectId,
      path: assetPath,
      pathBuffer: Buffer.from(pathBuffer),
      size: Number(size),
    });
    if (entries.length > MAX_ASSET_PATHS) {
      throw stagingError(`Selected asset count exceeds ${MAX_ASSET_PATHS}`);
    }
  }

  entries.sort((left, right) =>
    Buffer.compare(left.pathBuffer, right.pathBuffer),
  );
  enforceAssetLimits(entries);
  return entries;
}

async function resolveCommit(repoPath, treeish) {
  if (
    typeof treeish !== "string" ||
    treeish.length === 0 ||
    /[\0\r\n]/u.test(treeish)
  ) {
    throw stagingError("Supplied commit is empty or unsafe");
  }

  const output = await runGit(
    repoPath,
    ["rev-parse", "--verify", "--end-of-options", `${treeish}^{commit}`],
    "commit resolution",
  );
  const match = output
    .toString("ascii")
    .match(/^([0-9a-f]{40}|[0-9a-f]{64})\n$/u);

  if (match === null) {
    throw stagingError("Git commit resolution returned malformed output");
  }

  return match[1];
}

async function inventoryCommit(repoPath, commitId) {
  const output = await runGit(
    repoPath,
    ["ls-tree", "-rzlt", "--full-tree", commitId, "--"],
    "tree inventory",
  );
  return parseInventory(output);
}

async function readBlob(repoPath, entry) {
  const contents = await runGit(
    repoPath,
    ["cat-file", "blob", entry.objectId],
    "blob read",
  );

  if (contents.length !== entry.size) {
    throw stagingError("Git blob size does not match the tree inventory");
  }

  return contents;
}

async function listOutputFiles(rootPath, fileOperations, relativePath = "") {
  const directory = path.join(rootPath, relativePath);
  const children = await fileOperations.readdir(directory, {
    withFileTypes: true,
  });
  const files = [];

  for (const child of children) {
    const childRelativePath = relativePath
      ? `${relativePath}/${child.name}`
      : child.name;

    if (child.isDirectory()) {
      files.push(
        ...(await listOutputFiles(rootPath, fileOperations, childRelativePath)),
      );
    } else if (child.isFile()) {
      const details = await lstat(path.join(rootPath, childRelativePath));
      if (!details.isFile()) {
        throw stagingError("Temporary output contains a non-regular entry");
      }
      files.push(childRelativePath);
    } else {
      throw stagingError("Temporary output contains a non-regular entry");
    }
  }

  return files;
}

async function verifyOutputInventory(tempPath, entries, fileOperations) {
  const expected = [...entries.map((entry) => entry.path), "_headers"].sort();
  const actual = (await listOutputFiles(tempPath, fileOperations)).sort();

  if (
    actual.length !== expected.length ||
    actual.some((assetPath, index) => assetPath !== expected[index])
  ) {
    throw stagingError(
      "Temporary output inventory does not match selected assets",
    );
  }

  const headers = await readFile(path.join(tempPath, "_headers"));
  if (!headers.equals(Buffer.from(HEADERS, "utf8"))) {
    throw stagingError("Temporary output contains incorrect _headers bytes");
  }
}

async function buildTemporaryOutput(
  repoPath,
  tempPath,
  entries,
  fileOperations,
) {
  for (const entry of entries) {
    const contents = await readBlob(repoPath, entry);
    const destination = path.join(tempPath, ...entry.path.split("/"));

    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents, { flag: "wx" });
      const written = await readFile(destination);
      if (!written.equals(contents)) {
        throw stagingError("Written asset bytes do not match the Git blob");
      }
    } catch (error) {
      if (error instanceof StagingError) throw error;
      throw stagingError("Could not write a selected asset");
    }
  }

  await writeFile(path.join(tempPath, "_headers"), HEADERS, {
    encoding: "utf8",
    flag: "wx",
  });
  await verifyOutputInventory(tempPath, entries, fileOperations);
}

export async function stageAssets(
  { repoPath, treeish, outputPath },
  fileOperationOverrides = {},
) {
  const fileOperations = {
    ...DEFAULT_FILE_OPERATIONS,
    ...fileOperationOverrides,
  };
  const absoluteRepoPath = path.resolve(repoPath);
  const absoluteOutputPath = path.resolve(outputPath);
  const outputParent = path.dirname(absoluteOutputPath);
  const outputName = path.basename(absoluteOutputPath);
  const temporaryNamePrefix = `${outputName}.tmp-`;
  const temporaryPrefix = path.join(outputParent, temporaryNamePrefix);
  const commitId = await resolveCommit(absoluteRepoPath, treeish);
  const entries = await inventoryCommit(absoluteRepoPath, commitId);

  let tempPath;
  let backupPath;
  let tempExists = false;
  let backupExists = false;
  let replacementComplete = false;
  let failure;

  try {
    tempPath = await mkdtemp(temporaryPrefix);
    tempExists = true;
    await buildTemporaryOutput(
      absoluteRepoPath,
      tempPath,
      entries,
      fileOperations,
    );

    const temporarySuffix = path
      .basename(tempPath)
      .slice(temporaryNamePrefix.length);
    backupPath = path.join(
      outputParent,
      `${outputName}.backup-${temporarySuffix}`,
    );

    try {
      await fileOperations.rename(absoluteOutputPath, backupPath);
      backupExists = true;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }

    await fileOperations.rename(tempPath, absoluteOutputPath);
    tempExists = false;
    replacementComplete = true;

    if (backupExists) {
      try {
        await fileOperations.rm(backupPath, { recursive: true, force: true });
        backupExists = false;
      } catch {
        throw stagingError(
          `Could not clean previous staged asset directory at ${backupPath}`,
        );
      }
    }
  } catch (error) {
    failure = normalizeStagingFailure(error);

    if (backupExists && !replacementComplete) {
      try {
        await fileOperations.rename(backupPath, absoluteOutputPath);
        backupExists = false;
      } catch {
        failure = appendFailureDetail(
          failure,
          `previous completed output remains recoverable at ${backupPath}`,
        );
      }
    }
  }

  if (tempExists) {
    try {
      await fileOperations.rm(tempPath, { recursive: true, force: true });
      tempExists = false;
    } catch {
      failure = appendFailureDetail(
        failure,
        `could not clean temporary staged asset directory at ${tempPath}`,
      );
    }
  }

  if (failure !== undefined) throw failure;

  return {
    assetCount: entries.length,
    commitId,
    paths: entries.map((entry) => entry.path),
  };
}

async function main() {
  if (process.argv.length !== 3) {
    throw stagingError("Usage: npm run stage:assets -- <commit>");
  }

  const workerPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const repoPath = path.resolve(workerPath, "..");
  const outputPath = path.join(workerPath, ".staged-assets");
  const result = await stageAssets({
    outputPath,
    repoPath,
    treeish: process.argv[2],
  });

  console.log(
    `Staged ${result.assetCount} assets from ${result.commitId} into worker/.staged-assets`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    const message =
      error instanceof StagingError
        ? error.message
        : "Unexpected staging failure";
    console.error(`Asset staging failed: ${message}`);
    process.exitCode = 1;
  });
}
