# Autonomi LLM Documentation

Machine-readable documentation for the Autonomi Network, designed to help AI assistants understand and explain the platform to developers.

## What This Is

This repository contains:

- **llms.txt** - Main index file following the [llms.txt standard](https://llmstxt.org/)
- **Markdown documentation** - Clean, comprehensive content about Autonomi's architecture, features, and developer experience
- **Page variants** - `.md` versions of key autonomi.com pages for AI consumption
- **Cloudflare Worker config** - Source-controlled Worker code and manual deployment workflows in [`worker/`](worker/README.md)

## How It Works

Content in this repo is served at `autonomi.com` via Cloudflare Worker.

Files appear to live on autonomi.com but are actually served from this GitHub repo, giving us:
- Version control for all LLM documentation
- Easy collaborative editing
- Single source of truth
- Clean content without HTML wrappers

## Who This Is For

**Primary audience:** AI assistants (Claude, ChatGPT, etc.) helping developers build on Autonomi

**Secondary audience:** Developers who want clean, comprehensive technical documentation

## Contributing

This repo is maintained by the MaidSafe team. Content should be:

- Written in clear, accessible markdown
- Comprehensive enough for AI assistants to guide developers and inform those wishing to understand the technology
- Free of HTML or formatting that would confuse machine readers

## Related

- [Autonomi Website](https://autonomi.com)
- [Developer Documentation](https://docs.autonomi.com)
- [llms.txt Standard](https://llmstxt.org/)
