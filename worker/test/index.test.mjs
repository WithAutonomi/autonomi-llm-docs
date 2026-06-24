import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const GITHUB_PREFIX =
  "https://raw.githubusercontent.com/maidsafe/autonomi-llm-docs/main";

async function withFetchMock(handler, pathname) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    return handler(url, input);
  };

  try {
    const response = await worker.fetch(
      new Request(`https://autonomi.com${pathname}`),
    );
    return { calls, response };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function fallbackResponse(url) {
  return new Response(`fallback:${new URL(url).pathname}`, {
    status: 203,
  });
}

test("proxies public markdown paths from GitHub", async () => {
  const { calls, response } = await withFetchMock((url) => {
    assert.equal(url, `${GITHUB_PREFIX}/overview.md`);
    return new Response("overview", { status: 200 });
  }, "/overview.md");

  assert.deepEqual(calls, [`${GITHUB_PREFIX}/overview.md`]);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "overview");
  assert.equal(
    response.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
});

test("proxies llms.txt as plain text", async () => {
  const { response } = await withFetchMock((url) => {
    assert.equal(url, `${GITHUB_PREFIX}/llms.txt`);
    return new Response("llms", { status: 200 });
  }, "/llms.txt");

  assert.equal(await response.text(), "llms");
  assert.equal(
    response.headers.get("Content-Type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
});

test("proxies llms-full.txt as plain text", async () => {
  const { response } = await withFetchMock((url) => {
    assert.equal(url, `${GITHUB_PREFIX}/llms-full.txt`);
    return new Response("llms-full", { status: 200 });
  }, "/llms-full.txt");

  assert.equal(await response.text(), "llms-full");
  assert.equal(
    response.headers.get("Content-Type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
});

test("falls through for worker internal markdown paths", async () => {
  const { calls, response } = await withFetchMock(
    fallbackResponse,
    "/worker/README.md",
  );

  assert.deepEqual(calls, ["https://autonomi.com/worker/README.md"]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/worker/README.md");
});

test("falls through for GitHub workflow markdown paths", async () => {
  const { calls, response } = await withFetchMock(
    fallbackResponse,
    "/.github/PULL_REQUEST_TEMPLATE.md",
  );

  assert.deepEqual(calls, [
    "https://autonomi.com/.github/PULL_REQUEST_TEMPLATE.md",
  ]);
  assert.equal(response.status, 203);
  assert.equal(
    await response.text(),
    "fallback:/.github/PULL_REQUEST_TEMPLATE.md",
  );
});

test("falls through when GitHub returns a miss", async () => {
  const { calls, response } = await withFetchMock((url) => {
    if (url === `${GITHUB_PREFIX}/missing.md`) {
      return new Response("not found", { status: 404 });
    }

    return fallbackResponse(url);
  }, "/missing.md");

  assert.deepEqual(calls, [
    `${GITHUB_PREFIX}/missing.md`,
    "https://autonomi.com/missing.md",
  ]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/missing.md");
});

test("falls through when GitHub fetch throws", async () => {
  const { calls, response } = await withFetchMock((url) => {
    if (url === `${GITHUB_PREFIX}/transient.md`) {
      throw new Error("upstream unavailable");
    }

    return fallbackResponse(url);
  }, "/transient.md");

  assert.deepEqual(calls, [
    `${GITHUB_PREFIX}/transient.md`,
    "https://autonomi.com/transient.md",
  ]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/transient.md");
});
