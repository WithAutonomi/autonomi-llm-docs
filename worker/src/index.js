const INTERNAL_PREFIXES = ["/worker/", "/.github/"];

function shouldProxy(pathname) {
  const publicDocsPath =
    pathname.endsWith(".md") ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt";

  const internalPath = INTERNAL_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  return publicDocsPath && !internalPath;
}

function contentTypeFor(pathname) {
  return pathname.endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : "text/plain; charset=utf-8";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Intercept public .md files AND llms.txt
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

export { INTERNAL_PREFIXES, shouldProxy };
