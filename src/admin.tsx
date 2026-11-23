import { lazyPage } from "./admin-ui/lazy-page";

/** EmDash native admin entry — pages keyed by path, widgets by id. */
export const pages = {
  "/forms": lazyPage(() => import("./admin-ui/FormsPage"), "FormsPage"),
  "/submissions": lazyPage(
    () => import("./admin-ui/SubmissionsPage"),
    "SubmissionsPage",
  ),
  "/settings": lazyPage(() => import("./admin-ui/SettingsPage"), "SettingsPage"),
  "/settings/email": lazyPage(
    () => import("./admin-ui/EmailSettingsPage"),
    "EmailSettingsPage",
  ),
  "/settings/templates": lazyPage(
    () => import("./admin-ui/TemplatesSettingsPage"),
    "TemplatesSettingsPage",
  ),
  "/settings/webhooks": lazyPage(
    () => import("./admin-ui/WebhooksSettingsPage"),
    "WebhooksSettingsPage",
  ),
  "/settings/ai": lazyPage(
    () => import("./admin-ui/AiSettingsPage"),
    "AiSettingsPage",
  ),
};

/** Lazy so the dashboard shell does not pull Freeform React into the first paint. */
export const widgets = {
  stats: lazyPage(() => import("./admin-ui/StatsWidget"), "StatsWidget"),
};
