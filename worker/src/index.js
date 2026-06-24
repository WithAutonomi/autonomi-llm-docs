export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Intercept .md files AND llms.txt
    if (
      url.pathname.endsWith(".md") ||
      url.pathname === "/llms.txt" ||
      url.pathname === "/llms-full.txt"
    ) {
      // Try to fetch from GitHub
      const githubUrl = `https://raw.githubusercontent.com/maidsafe/autonomi-llm-docs/main${url.pathname}`;

      const ghResponse = await fetch(githubUrl);

      // If file exists in GitHub, serve it
      if (ghResponse.ok) {
        // Determine content type based on extension
        const contentType = url.pathname.endsWith(".md")
          ? "text/markdown; charset=utf-8"
          : "text/plain; charset=utf-8";

        return new Response(ghResponse.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=300",
          },
        });
      }

      // If  not in GitHub, pass through to Framer (graceful fallback)
    }

    // Everything else passes to Framer unchanged
    return fetch(request);
  },
};
