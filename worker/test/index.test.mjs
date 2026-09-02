import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import worker from "../src/index.js";

const WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function withFetchMock(mock, request) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ init, input });
    return mock(input, init);
  };

  try {
    const response = await worker.fetch(request);
    return { calls, response };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("the Worker forwards a platform-routed miss to the origin exactly once", async () => {
  const request = new Request("https://autonomi.com/missing.md?source=test", {
    headers: { "X-Test-Request": "unchanged" },
  });
  const originResponse = new Response("framer", {
    headers: { "X-Test-Origin": "framer" },
    status: 203,
  });
  const { calls, response } = await withFetchMock((input, init) => {
    assert.strictEqual(input, request);
    assert.equal(init, undefined);
    return originResponse;
  }, request);

  assert.equal(calls.length, 1);
  assert.strictEqual(response, originResponse);
});

test("GET and HEAD misses each fall through once without an assets binding", async (t) => {
  for (const method of ["GET", "HEAD"]) {
    await t.test(method, async () => {
      const request = new Request("https://autonomi.com/missing.md", {
        method,
      });
      const environment = {
        get ASSETS() {
          throw new Error("the fallback-only Worker must not read ASSETS");
        },
      };
      const originalFetch = globalThis.fetch;
      let calls = 0;

      globalThis.fetch = async (input, init) => {
        calls += 1;
        assert.strictEqual(input, request);
        assert.equal(init, undefined);
        return new Response(method === "HEAD" ? null : "framer", {
          status: 203,
        });
      };

      try {
        const response = await worker.fetch(request, environment);
        assert.equal(response.status, 203);
        assert.equal(calls, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test("routed writing methods on non-assets each fall through once", async (t) => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    await t.test(method, async () => {
      const request = new Request("https://autonomi.com/not-an-asset", {
        method,
      });
      const { calls, response } = await withFetchMock((input) => {
        assert.strictEqual(input, request);
        return new Response("framer", { status: 203 });
      }, request);

      assert.equal(calls.length, 1);
      assert.equal(response.status, 203);
    });
  }
});

test("an origin fetch error is propagated without retry or telemetry", async () => {
  const request = new Request("https://autonomi.com/unavailable");
  const expectedError = new Error("origin unavailable");
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (input) => {
    calls += 1;
    assert.strictEqual(input, request);
    throw expectedError;
  };

  try {
    await assert.rejects(
      worker.fetch(request),
      (error) => error === expectedError,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker source contains no runtime GitHub fetch or fallback telemetry", () => {
  const source = readFileSync(
    path.join(WORKER_PATH, "src", "index.js"),
    "utf8",
  );

  assert.equal(source.includes("raw.githubusercontent.com"), false);
  assert.equal(source.includes("github_raw_"), false);
  assert.equal(source.includes("console.warn"), false);
  assert.equal(source.includes("console.error"), false);
  assert.equal(source.match(/return fetch\(request\);/gu)?.length, 1);
});
