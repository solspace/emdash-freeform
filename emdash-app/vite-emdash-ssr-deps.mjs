/**
 * SSR dep optimizer for EmDash + Astro 6 + @astrojs/cloudflare (workerd dev).
 *
 * @astrojs/cloudflare already sets optimizeDeps for the "ssr" environment. A naive
 * configEnvironment plugin REPLACES that config and drops `virtual:astro:*` excludes —
 * that causes "Astro is not defined" in getComponentByRoute.
 *
 * This plugin runs with enforce:"post" and re-declares Cloudflare's excludes plus
 * EmDash paths that must not be pre-bundled (cloudflare:workers, plugin sandboxes).
 *
 * @see https://github.com/withastro/astro/issues/16248
 * @see https://edgekits.dev/en/blog/astro-5-to-6-migration-react-islands-cloudflare/
 */

/** Keep in sync with @astrojs/cloudflare dist/index.js optimizeDeps.exclude */
const CLOUDFLARE_OPTIMIZE_EXCLUDE = [
  "unstorage/drivers/cloudflare-kv-binding",
  "astro:*",
  "virtual:astro:*",
  "virtual:astro-cloudflare:*",
  "virtual:@astrojs/*",
  "@astrojs/starlight",
];

/** EmDash subpaths that import cloudflare:workers or sandboxes — do not pre-bundle */
const EMDASH_OPTIMIZE_EXCLUDE = [
  "@emdash-cms/cloudflare/db/d1",
  "@emdash-cms/cloudflare/storage/r2",
  "emdash/plugins/adapt-sandbox-entry",
  "emdash/media/local-runtime",
  "emdash/ui",
];

export function emdashSsrDeps() {
  return {
    name: "emdash-ssr-deps",
    enforce: "post",
    configEnvironment(name, options) {
      if (name === "client") return;

      const prevExclude = options.optimizeDeps?.exclude ?? [];

      return {
        optimizeDeps: {
          exclude: [
            ...new Set([
              ...prevExclude,
              ...CLOUDFLARE_OPTIMIZE_EXCLUDE,
              ...EMDASH_OPTIMIZE_EXCLUDE,
            ]),
          ],
        },
      };
    },
  };
}
