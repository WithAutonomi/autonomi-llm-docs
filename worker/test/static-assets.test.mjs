import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createTestHarness } from "wrangler";

import { stageAssets } from "../scripts/stage-assets.mjs";

const WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_PATH = path.resolve(WORKER_PATH, "..");
const OUTPUT_PATH = path.join(WORKER_PATH, ".staged-assets");
const ROUTED_METHODS = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

let harness;
let origin;
let originUrl;
let originRequests = [];

function resetOriginRequests() {
  originRequests = [];
}

function assertOneOriginRequest(method, pathname) {
  assert.deepEqual(originRequests, [{ method, pathname }]);
}

before(async () => {
  await stageAssets({
    outputPath: OUTPUT_PATH,
    repoPath: REPO_PATH,
    treeish: "HEAD",
  });

  origin = createServer((request, response) => {
    originRequests.push({
      method: request.method,
      pathname: request.url,
    });
    response.statusCode = 203;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("X-Test-Origin", "framer");
    response.end(`origin:${request.method}:${request.url}`);
  });
  origin.listen(0, "127.0.0.1");
  await once(origin, "listening");
  const address = origin.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  originUrl = `http://127.0.0.1:${address.port}`;

  harness = createTestHarness({
    root: WORKER_PATH,
    workers: [{ configPath: "wrangler.preview.jsonc" }],
  });
  await harness.listen();
});

after(async () => {
  await harness?.close();
  if (origin?.listening) {
    origin.close();
    await once(origin, "close");
  }
});

test("pinned Wrangler locally exercises asset-first GET and HEAD", async () => {
  resetOriginRequests();
  const expected = readFileSync(path.join(OUTPUT_PATH, "overview.md"));

  const getResponse = await harness.fetch(`${originUrl}/overview.md`);
  assert.equal(getResponse.status, 200);
  assert.deepEqual(Buffer.from(await getResponse.arrayBuffer()), expected);
  assert.equal(
    getResponse.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(getResponse.headers.get("Cache-Control"), "public, max-age=300");

  const headResponse = await harness.fetch(`${originUrl}/overview.md`, {
    method: "HEAD",
  });
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.body, null);
  assert.equal(await headResponse.text(), "");
  assert.equal(
    headResponse.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(
    headResponse.headers.get("Cache-Control"),
    "public, max-age=300",
  );

  for (const pathname of ["/llms.txt", "/llms-full.txt"]) {
    const response = await harness.fetch(`${originUrl}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.equal(
      response.headers.get("Content-Type"),
      "text/plain; charset=utf-8",
      pathname,
    );
    assert.equal(
      response.headers.get("Cache-Control"),
      "public, max-age=300",
      pathname,
    );
  }

  assert.deepEqual(originRequests, []);
});

test("pinned Wrangler locally returns native 405 for all five routed methods on assets", async () => {
  resetOriginRequests();

  for (const method of ROUTED_METHODS) {
    const response = await harness.fetch(`${originUrl}/overview.md`, {
      method,
    });

    assert.equal(response.status, 405, method);
    assert.equal(response.statusText, "Method Not Allowed", method);
    assert.equal(response.headers.get("Allow"), null, method);
    assert.equal(await response.text(), "", method);
  }

  assert.deepEqual(originRequests, []);
});

test("GET and HEAD asset misses each fall through to the origin once", async () => {
  for (const method of ["GET", "HEAD"]) {
    resetOriginRequests();
    const response = await harness.fetch(`${originUrl}/missing.md`, { method });

    assert.equal(response.status, 203, method);
    assert.equal(response.headers.get("X-Test-Origin"), "framer", method);
    assertOneOriginRequest(method, "/missing.md");
  }
});

test("all five routed methods on a non-asset fall through once", async () => {
  for (const method of ROUTED_METHODS) {
    resetOriginRequests();
    const response = await harness.fetch(`${originUrl}/not-an-asset`, {
      method,
    });

    assert.equal(response.status, 203, method);
    assert.equal(response.headers.get("X-Test-Origin"), "framer", method);
    assertOneOriginRequest(method, "/not-an-asset");
  }
});

test("representative non-asset paths each fall through once", async () => {
  // Staging tests prove internal-prefix exclusion. These absent internal paths
  // exercise only the runtime's one-fallback behaviour for non-assets.
  const representativeNonAssetPaths = [
    "/worker/README.md",
    "/.github/PULL_REQUEST_TEMPLATE.md",
    "/whitepapers/Autonomous-Network.pdf",
    "/missing.md",
    "/overview",
    "/_headers",
    "/.assetsignore",
    "/_redirects",
    "/_worker.js",
  ];

  for (const pathname of representativeNonAssetPaths) {
    resetOriginRequests();
    const response = await harness.fetch(`${originUrl}${pathname}`);

    assert.equal(response.status, 203, pathname);
    assert.equal(response.headers.get("X-Test-Origin"), "framer", pathname);
    assertOneOriginRequest("GET", pathname);
  }
});

test("the user Worker receives no assets binding", async () => {
  const environment = await harness.getWorker().getEnv();

  assert.equal("ASSETS" in environment, false);
});
