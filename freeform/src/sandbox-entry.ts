import { definePlugin } from "emdash";
import { adminRoute } from "./admin/router";
import { cronHook } from "./hooks/cron";
import { installHook } from "./hooks/install";
import { agentRoutes } from "./routes/agent";
import { aiRoutes } from "./routes/ai";
import { chatRoutes } from "./routes/chat";
import { exportsRoutes } from "./routes/exports";
import { formsRoutes } from "./routes/forms";
import { notificationRoutes } from "./routes/notifications";
import { publicRoutes } from "./routes/public";
import { settingsRoutes } from "./routes/settings";
import { submissionsRoutes } from "./routes/submissions";
import { templateRoutes } from "./routes/templates";
import { webhookRoutes } from "./routes/webhooks";

export default definePlugin({
  hooks: {
    "plugin:install": installHook,
    cron: cronHook,
  },
  routes: {
    admin: adminRoute,
    ...publicRoutes,
    ...agentRoutes,
    ...chatRoutes,
    ...formsRoutes,
    ...exportsRoutes,
    ...submissionsRoutes,
    ...settingsRoutes,
    ...aiRoutes,
    ...templateRoutes,
    ...notificationRoutes,
    ...webhookRoutes,
  },
});
