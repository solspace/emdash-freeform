# `@solspace/freeform-plugin-dist`

**Registry distribution only.** This package is not an SDK and is not meant to be installed into an app.

It publishes the Freeform EmDash plugin tarball (`freeform-<version>.tar.gz`) to npm so public CDNs (jsDelivr, unpkg) can serve it. The [EmDash plugin registry](https://plugins.emdashcms.com/plugins/@solspace.com/freeform) downloads that tarball when sites install **Freeform**.

## What this is for

| Use | Package / place |
| --- | --- |
| Install Freeform on an EmDash site | EmDash admin → **Plugins → Registry** → `@solspace.com/freeform` |
| Render forms in Astro | [`@solspace/freeform-astro`](https://www.npmjs.com/package/@solspace/freeform-astro) |
| CDN URL for the plugin tarball (this package) | `https://cdn.jsdelivr.net/npm/@solspace/freeform-plugin-dist@<version>/freeform-<version>.tar.gz` |

## Do not

- `npm install @solspace/freeform-plugin-dist` in a project — there is no runtime API here
- Treat this as the Craft Freeform headless client (`@solspace/freeform-react`, etc.)

## Source

Built from [solspace/emdash-freeform](https://github.com/solspace/emdash-freeform). Version matches the Freeform plugin release (e.g. `1.1.0`).
