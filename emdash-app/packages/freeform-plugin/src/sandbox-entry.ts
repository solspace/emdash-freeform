import { definePlugin } from "emdash";
import { adminRoute } from "./admin/router";
import { installHook } from "./hooks/install";
import { aiRoutes } from "./routes/ai";
import { formsRoutes } from "./routes/forms";
import { notificationRoutes } from "./routes/notifications";
import { publicRoutes } from "./routes/public";
import { settingsRoutes } from "./routes/settings";
import { submissionsRoutes } from "./routes/submissions";
import { templateRoutes } from "./routes/templates";

export default definePlugin({
  hooks: {
    "plugin:install": installHook,
  },
  routes: {
    admin: adminRoute,
    ...publicRoutes,
    ...formsRoutes,
    ...submissionsRoutes,
    ...settingsRoutes,
    ...aiRoutes,
    ...templateRoutes,
    ...notificationRoutes,
  },
});
