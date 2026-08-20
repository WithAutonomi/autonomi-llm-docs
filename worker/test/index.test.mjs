import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const GITHUB_PREFIX =
  "https://raw.githubusercontent.com/WithAutonomi/autonomi-llm-docs/main";

async function withFetchMock(handler, pathname, requestInit = undefined) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    return handler(url, init ?? input);
  };

  try {
    const response = await worker.fetch(
      new Request(`https://autonomi.com${pathname}`, requestInit),
    );
    return { calls, response };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withConsoleCapture(method, handler) {
  const originalMethod = console[method];
  const calls = [];
  console[method] = (...args) => calls.push(args);

  try {
    return { calls, result: await handler() };
  } finally {
    console[method] = originalMethod;
  }
}

function singleJsonEvent(calls) {
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(typeof calls[0][0], "string");
  return JSON.parse(calls[0][0]);
}

function fallbackResponse(url) {
  return new Response(`fallback:${new URL(url).pathname}`, {
    status: 203,
  });
}

function encodeRepeatedly(value, times) {
  let encoded = value;

  for (let index = 0; index < times; index += 1) {
    encoded = encodeURIComponent(encoded);
  }

  return encoded;
}

test("proxies public markdown paths from GitHub", async () => {
  const { calls: warningCalls, result: errorCapture } =
    await withConsoleCapture("warn", () =>
      withConsoleCapture("error", () =>
        withFetchMock((url) => {
          assert.equal(url, `${GITHUB_PREFIX}/overview.md`);
          return new Response("overview", { status: 200 });
        }, "/overview.md"),
      ),
    );
  const { calls: errorCalls, result } = errorCapture;
  const { calls, response } = result;

  assert.deepEqual(calls, [`${GITHUB_PREFIX}/overview.md`]);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "overview");
  assert.equal(
    response.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
  assert.deepEqual(warningCalls, []);
  assert.deepEqual(errorCalls, []);
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

test("proxies HEAD requests for public documentation paths", async () => {
  const { calls, response } = await withFetchMock(
    (url, input) => {
      assert.equal(url, `${GITHUB_PREFIX}/overview.md`);
      assert.equal(input.method, "HEAD");
      return new Response(null, { status: 200 });
    },
    "/overview.md",
    { method: "HEAD" },
  );

  assert.deepEqual(calls, [`${GITHUB_PREFIX}/overview.md`]);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
});

test("falls through for non-GET and non-HEAD documentation requests", async () => {
  const { calls, response } = await withFetchMock(
    (url, input) => {
      assert.equal(input.method, "POST");
      assert.ok(
        !url.startsWith(GITHUB_PREFIX),
        `non-GET request fetched GitHub raw: ${url}`,
      );

      return fallbackResponse(url);
    },
    "/overview.md",
    { method: "POST" },
  );

  assert.deepEqual(calls, ["https://autonomi.com/overview.md"]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/overview.md");
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

test("falls through for encoded internal-prefix bypass attempts", async (t) => {
  const cases = [
    ["encoded worker slash", "/worker%2FREADME.md"],
    ["encoded worker backslash", "/worker%5CREADME.md"],
    ["encoded worker letters", "/%77orker/README.md"],
    ["encoded .github dot", "/%2Egithub/PULL_REQUEST_TEMPLATE.md"],
    ["encoded .github backslash", "/.github%5CPULL_REQUEST_TEMPLATE.md"],
    ["encoded .github letters", "/.%67ithub/PULL_REQUEST_TEMPLATE.md"],
    ["encoded dot segment to worker", "/public%2F..%2Fworker%2FREADME.md"],
    [
      "encoded backslash dot segment to worker",
      "/public%5C..%5Cworker%5CREADME.md",
    ],
    [
      "encoded dot segment to .github",
      "/public%2F..%2F.github%2FPULL_REQUEST_TEMPLATE.md",
    ],
    [
      "encoded backslash dot segment to .github",
      "/public%5C..%5C.github%5CPULL_REQUEST_TEMPLATE.md",
    ],
  ];

  for (const [name, pathname] of cases) {
    await t.test(name, async () => {
      const requestUrl = new URL(`https://autonomi.com${pathname}`).href;
      const { calls, response } = await withFetchMock((url) => {
        assert.ok(
          !url.startsWith(GITHUB_PREFIX),
          `encoded internal path fetched GitHub raw: ${url}`,
        );

        return fallbackResponse(url);
      }, pathname);

      assert.deepEqual(calls, [requestUrl]);
      assert.equal(response.status, 203);
      assert.equal(
        await response.text(),
        `fallback:${new URL(requestUrl).pathname}`,
      );
    });
  }
});

test("falls through for repeatedly encoded internal-prefix bypass attempts", async (t) => {
  const cases = [
    ["deeply encoded worker letters", "/%252525252577orker/README.md"],
    [
      "deeply encoded .github dot",
      "/%25252525252Egithub/PULL_REQUEST_TEMPLATE.md",
    ],
    ["deeply encoded worker slash", "/worker%25252525252FREADME.md"],
    [
      "deeply encoded dot segment to worker",
      "/public%25252525252F..%25252525252Fworker%25252525252FREADME.md",
    ],
    [
      "deeply encoded dot segment to .github",
      "/public%25252525252F..%25252525252F.github%25252525252FPULL_REQUEST_TEMPLATE.md",
    ],
  ];

  for (const [name, pathname] of cases) {
    await t.test(name, async () => {
      const requestUrl = new URL(`https://autonomi.com${pathname}`).href;
      const { calls, response } = await withFetchMock((url) => {
        assert.ok(
          !url.startsWith(GITHUB_PREFIX),
          `deeply encoded internal path fetched GitHub raw: ${url}`,
        );

        return fallbackResponse(url);
      }, pathname);

      assert.deepEqual(calls, [requestUrl]);
      assert.equal(response.status, 203);
      assert.equal(
        await response.text(),
        `fallback:${new URL(requestUrl).pathname}`,
      );
    });
  }
});

test("falls through for over-budget repeated percent encoding", async () => {
  const repeatedEncodedLetter = encodeRepeatedly("%70", 16);
  const pathname = `/${repeatedEncodedLetter}ublic.md`;
  const requestUrl = new URL(`https://autonomi.com${pathname}`).href;
  const { calls, response } = await withFetchMock((url) => {
    assert.ok(
      !url.startsWith(GITHUB_PREFIX),
      `over-budget encoded path fetched GitHub raw: ${url}`,
    );

    return fallbackResponse(url);
  }, pathname);

  assert.deepEqual(calls, [requestUrl]);
  assert.equal(response.status, 203);
  assert.equal(
    await response.text(),
    `fallback:${new URL(requestUrl).pathname}`,
  );
});

test("falls through when GitHub returns a miss", async () => {
  const { calls: warningCalls, result } = await withConsoleCapture("warn", () =>
    withFetchMock((url) => {
      if (url === `${GITHUB_PREFIX}/missing.md`) {
        return new Response("not found", { status: 404 });
      }

      return fallbackResponse(url);
    }, "/missing.md"),
  );
  const { calls, response } = result;

  assert.deepEqual(calls, [
    `${GITHUB_PREFIX}/missing.md`,
    "https://autonomi.com/missing.md",
  ]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/missing.md");
  assert.deepEqual(singleJsonEvent(warningCalls), {
    event: "github_raw_non_ok",
    pathname: "/missing.md",
    status: 404,
    retry_after: null,
    rate_limit_remaining: null,
    github_request_id: null,
  });
});

test("falls through unchanged and logs diagnostics when GitHub returns 429", async () => {
  const pathname = "/rate-limited.md?private=do-not-log";
  const { calls: warningCalls, result } = await withConsoleCapture("warn", () =>
    withFetchMock((url) => {
      if (url === `${GITHUB_PREFIX}/rate-limited.md`) {
        return new Response("rate limit details must not be logged", {
          status: 429,
          headers: {
            "Retry-After": "120",
            "X-RateLimit-Remaining": "0",
            "X-GitHub-Request-Id": "ABC:123",
          },
        });
      }

      return fallbackResponse(url);
    }, pathname),
  );
  const { calls, response } = result;

  assert.deepEqual(calls, [
    `${GITHUB_PREFIX}/rate-limited.md`,
    `https://autonomi.com${pathname}`,
  ]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/rate-limited.md");
  assert.deepEqual(singleJsonEvent(warningCalls), {
    event: "github_raw_non_ok",
    pathname: "/rate-limited.md",
    status: 429,
    retry_after: "120",
    rate_limit_remaining: "0",
    github_request_id: "ABC:123",
  });
});

test("falls through when GitHub fetch throws", async () => {
  const { calls: errorCalls, result } = await withConsoleCapture("error", () =>
    withFetchMock((url) => {
      if (url === `${GITHUB_PREFIX}/transient.md`) {
        throw new Error("upstream unavailable");
      }

      return fallbackResponse(url);
    }, "/transient.md"),
  );
  const { calls, response } = result;

  assert.deepEqual(calls, [
    `${GITHUB_PREFIX}/transient.md`,
    "https://autonomi.com/transient.md",
  ]);
  assert.equal(response.status, 203);
  assert.equal(await response.text(), "fallback:/transient.md");
  assert.deepEqual(singleJsonEvent(errorCalls), {
    event: "github_raw_fetch_error",
    pathname: "/transient.md",
    error_name: "Error",
    error_message: "upstream unavailable",
  });
});
