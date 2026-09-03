import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MACHINERY_PATHS = Object.freeze([
  "worker",
  ".github/workflows",
  ".github/actions",
]);

const CURRENT_MAIN_REF = "refs/remotes/origin/main";
const FULL_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export class BaselineGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "BaselineGuardError";
  }
}

function runGit(repoPath, args) {
  const result = spawnSync("git", ["--no-replace-objects", ...args], {
    cwd: repoPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error !== undefined) {
    throw new BaselineGuardError("Could not run Git baseline checks");
  }

  return result;
}

function resolveExactCommit(repoPath, label, identity) {
  if (typeof identity !== "string" || !FULL_OBJECT_ID.test(identity)) {
    throw new BaselineGuardError(
      `${label} must be one full lowercase Git commit identity`,
    );
  }

  const result = runGit(repoPath, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${identity}^{commit}`,
  ]);
  if (result.status !== 0 || result.stdout.trim() !== identity) {
    throw new BaselineGuardError(
      `${label} does not name one available exact commit`,
    );
  }

  return identity;
}

function resolveRequiredRef(repoPath, ref) {
  const result = runGit(repoPath, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
  const identity = result.stdout.trim();

  if (result.status !== 0 || !FULL_OBJECT_ID.test(identity)) {
    throw new BaselineGuardError(`Required Git ref ${ref} is unavailable`);
  }

  return identity;
}

export function checkBaseline({ baselineCommit, currentCommit, repoPath }) {
  const absoluteRepoPath = path.resolve(repoPath);
  const baseline = resolveExactCommit(
    absoluteRepoPath,
    "Production baseline",
    baselineCommit,
  );
  const current = resolveExactCommit(
    absoluteRepoPath,
    "Current source",
    currentCommit,
  );
  const head = resolveRequiredRef(absoluteRepoPath, "HEAD");
  const networkMain = resolveRequiredRef(absoluteRepoPath, CURRENT_MAIN_REF);

  if (head !== current) {
    throw new BaselineGuardError(
      "Checked-out HEAD does not match the current source identity",
    );
  }
  if (networkMain !== current) {
    throw new BaselineGuardError(
      "Network-current main does not match the current source identity",
    );
  }

  const ancestry = runGit(absoluteRepoPath, [
    "merge-base",
    "--is-ancestor",
    baseline,
    current,
  ]);
  if (ancestry.status === 1) {
    throw new BaselineGuardError(
      "Production baseline is not an ancestor of current main",
    );
  }
  if (ancestry.status !== 0) {
    throw new BaselineGuardError("Could not verify baseline ancestry");
  }

  const machineryDiff = runGit(absoluteRepoPath, [
    "diff",
    "--quiet",
    "--exit-code",
    baseline,
    current,
    "--",
    ...MACHINERY_PATHS,
  ]);
  if (machineryDiff.status === 1) {
    throw new BaselineGuardError(
      "Serving machinery differs from the protected production baseline",
    );
  }
  if (machineryDiff.status !== 0) {
    throw new BaselineGuardError("Could not compare serving machinery");
  }

  return { baselineCommit: baseline, currentCommit: current };
}

function main() {
  if (process.argv.length !== 4) {
    throw new BaselineGuardError(
      "Usage: npm run guard:production -- <baseline-commit> <current-commit>",
    );
  }

  const workerPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const result = checkBaseline({
    baselineCommit: process.argv[2],
    currentCommit: process.argv[3],
    repoPath: path.resolve(workerPath, ".."),
  });

  console.log(
    `Baseline guard passed: serving machinery is unchanged from ${result.baselineCommit} to ${result.currentCommit}`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    const message =
      error instanceof BaselineGuardError
        ? error.message
        : "Unexpected baseline guard failure";
    console.error(`Production publication refused: ${message}`);
    process.exitCode = 1;
  }
}
