const INTERNAL_PREFIXES = ["/worker/", "/.github/"];
const PERCENT_ENCODED_BYTE = /%([0-9a-fA-F]{2})/g;

function decodePercentEncodedBytes(pathname) {
  return pathname.replace(PERCENT_ENCODED_BYTE, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function normalizePathname(pathname) {
  const segments = [];

  for (const segment of pathname.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  const normalized = `/${segments.join("/")}`;
  return pathname.endsWith("/") && normalized !== "/"
    ? `${normalized}/`
    : normalized;
}

function policyPathVariants(pathname) {
  const variants = new Set();
  let current = pathname;

  while (true) {
    variants.add(current);
    variants.add(normalizePathname(current));

    const decoded = decodePercentEncodedBytes(current);
    if (decoded === current) {
      return variants;
    }

    // Each percent-byte decode replaces a three-character `%XX` escape with
    // one character, so repeated decoding strictly shortens the pathname until
    // there are no encoded bytes left.
    current = decoded;
  }
}

function isInternalPath(pathname) {
  return Array.from(policyPathVariants(pathname)).some((variant) =>
    INTERNAL_PREFIXES.some((prefix) => variant.startsWith(prefix)),
  );
}

function shouldProxy(pathname) {
  const publicDocsPath =
    pathname.endsWith(".md") ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt";

  return publicDocsPath && !isInternalPath(pathname);
}

function contentTypeFor(pathname) {
  return pathname.endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : "text/plain; charset=utf-8";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Intercept public .md files, llms.txt, and llms-full.txt.
    if (shouldProxy(url.pathname)) {
      // Try to fetch from GitHub
      const githubUrl = `https://raw.githubusercontent.com/maidsafe/autonomi-llm-docs/main${url.pathname}`;

      try {
        const ghResponse = await fetch(githubUrl);

        // If file exists in GitHub, serve it
        if (ghResponse.ok) {
          // Determine content type based on extension
          const contentType = contentTypeFor(url.pathname);

          return new Response(ghResponse.body, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=300",
            },
          });
        }
      } catch {
        // If GitHub is unreachable, pass through to Framer (graceful fallback)
      }

      // If not in GitHub, pass through to Framer (graceful fallback)
    }

    // Everything else passes to Framer unchanged
    return fetch(request);
  },
};
