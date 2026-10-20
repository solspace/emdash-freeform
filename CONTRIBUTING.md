# Contributing to Freeform

Thanks for your interest in Freeform. This guide covers local development and the release process.

## Repository layout

```
emdash/
  freeform/          This repo — the repo root IS the plugin package
    src/               Plugin source (admin UI, routes, AI, lib)
    emdash-plugin.jsonc  Registry manifest
    packages/
      astro/           @solspace/freeform-astro — Astro integration + components
      mcp/             emdash-freeform-mcp — standalone MCP Cloudflare Worker
    docs/              Registry listing sections + guides
  cms/               Demo/test EmDash site (separate repo, NOT part of this one)
```

The demo site consumes this repo through `file:` links (`file:../freeform`,
`file:../freeform/packages/astro`), so plugin changes show up in the site
after a rebuild — no publishing needed while developing.

## Setup

Requirements: Node.js ≥ 22 (Node 24 recommended), pnpm ≥ 11.

```bash
cd freeform
pnpm install

# Build the plugin once (the demo site loads dist/)
pnpm run build
```

## Daily development — two terminals

```bash
# 1 — demo site → http://localhost:4321 (admin, /demo, /contact)
cd ../cms && pnpm run dev:clean

# 2 — plugin rebuild on save (optional)
cd freeform && pnpm run build:watch
```

Useful URLs on the demo site:

| URL | What |
| --- | --- |
| http://localhost:4321/demo | Freeform demo form |
| http://localhost:4321/contact | Styled form example |
| http://localhost:4321/_emdash/admin | EmDash admin → Freeform |

If the dev server acts up (stale Vite cache, wrong port), stop everything and
re-run `pnpm run dev:clean` in `../cms`. Only one process should own port 4321.

## Builds

```bash
pnpm run build            # compile src/ → dist/ + emdash-plugin build
pnpm run bundle           # produce dist/freeform-<version>.tar.gz
pnpm run bundle:validate  # validate the bundle without publishing
pnpm run typecheck        # tsc --noEmit
```

Before submitting a change, `bundle:validate` and `typecheck` should pass.

## Releases

Releases are published by the maintainers from version tags
(`freeform/v*` for the plugin, `freeform-astro/v*` for the Astro package).
The release process and credentials are intentionally not documented in
this public repository.

## Code notes

- The plugin runs sandboxed (`format: "standard"`); admin UI is EmDash **Block Kit** only — no custom JS in the admin.
- Anything needing a raw HTTP `Response` (MCP, file downloads) lives outside the plugin — in `packages/astro` routes or the `packages/mcp` Worker. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- Customer API keys are stored in the site's own plugin storage and are never sent to Solspace.
