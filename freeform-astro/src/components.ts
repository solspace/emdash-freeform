// Component barrel — import from "@solspace/freeform-astro/components"
// (NOT from "@solspace/freeform-astro" directly, as that entry is loaded at
// astro.config.mjs parse time before Astro's Vite plugin handles .astro files)
export { default as FreeformForm } from "./components/FreeformForm.astro";
export { default as FreeformChat } from "./components/FreeformChat.astro";
export { default as FreeformDiscovery } from "./components/FreeformDiscovery.astro";
