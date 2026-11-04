import { AiSettingsPage } from "./admin-ui/AiSettingsPage";
import { EmailSettingsPage } from "./admin-ui/EmailSettingsPage";
import { FormsPage } from "./admin-ui/FormsPage";
import { SettingsPage } from "./admin-ui/SettingsPage";
import { StatsWidget } from "./admin-ui/StatsWidget";
import { SubmissionsPage } from "./admin-ui/SubmissionsPage";
import { TemplatesSettingsPage } from "./admin-ui/TemplatesSettingsPage";
import { WebhooksSettingsPage } from "./admin-ui/WebhooksSettingsPage";

/** EmDash native admin entry — pages keyed by path, widgets by id. */
export const pages = {
  "/forms": FormsPage,
  "/submissions": SubmissionsPage,
  "/settings": SettingsPage,
  // Settings detail pages (hub-only in sidebar; resolved via splat route)
  "/settings/email": EmailSettingsPage,
  "/settings/templates": TemplatesSettingsPage,
  "/settings/webhooks": WebhooksSettingsPage,
  "/settings/ai": AiSettingsPage,
};

export const widgets = {
  stats: StatsWidget,
};
