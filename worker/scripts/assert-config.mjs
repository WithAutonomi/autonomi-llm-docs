import fs from "node:fs";

const mode = process.argv[2];

if (mode !== "preview" && mode !== "production") {
  console.error("Usage: node scripts/assert-config.mjs <preview|production>");
  process.exit(1);
}

const configPath =
  mode === "preview" ? "wrangler.preview.jsonc" : "wrangler.jsonc";
const configText = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(configText.replace(/,\s*([}\]])/g, "$1"));

function assert(condition, message) {
  if (!condition) {
    console.error(`${configPath}: ${message}`);
    process.exit(1);
  }
}

assert(config.main === "src/index.js", "main must remain src/index.js");
assert(
  config.compatibility_date === "2025-12-09",
  "compatibility_date must remain 2025-12-09",
);
assert(
  config.observability?.enabled === true,
  "observability.enabled must remain true",
);
assert(
  config.observability?.head_sampling_rate === 1,
  "observability.head_sampling_rate must remain 1",
);

if (mode === "preview") {
  assert(config.name === "autonomi-md-proxy-preview", "preview name changed");
  assert(config.workers_dev === true, "preview must use workers_dev");
  assert(config.route === undefined, "preview must not define route");
  assert(config.routes === undefined, "preview must not define routes");
  assert(
    config.custom_domain === undefined,
    "preview must not define custom_domain",
  );
} else {
  assert(config.name === "autonomi-md-proxy", "production name changed");
  assert(config.workers_dev === false, "production must disable workers_dev");
  assert(Array.isArray(config.routes), "production must define routes array");
  assert(
    config.routes.length === 1,
    "production must define exactly one route",
  );
  assert(
    config.routes[0].pattern === "autonomi.com/*",
    "production route pattern must remain autonomi.com/*",
  );
  assert(
    config.routes[0].zone_name === "autonomi.com",
    "production route zone_name must remain autonomi.com",
  );
}

console.log(`${configPath}: ${mode} config assertions passed`);
