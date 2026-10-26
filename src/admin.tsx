import { FormsPage } from "./admin-ui/FormsPage";
import { SettingsPage } from "./admin-ui/SettingsPage";
import { StatsWidget } from "./admin-ui/StatsWidget";
import { SubmissionsPage } from "./admin-ui/SubmissionsPage";

/** EmDash native admin entry — pages keyed by path, widgets by id. */
export const pages = {
  "/forms": FormsPage,
  "/submissions": SubmissionsPage,
  "/settings": SettingsPage,
};

export const widgets = {
  stats: StatsWidget,
};




