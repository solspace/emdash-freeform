import { PluginRouteError, type PluginContext } from "emdash";
import { uid } from "../lib/handles";
import type {
  RecipientType,
  StoredAssignment,
  StoredForm,
  StoredTemplate,
} from "../types";

export const notificationRoutes = {
  "list-form-notifications": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const formId = new URL(routeCtx.request.url).searchParams.get("formId");
      if (!formId) throw PluginRouteError.badRequest("Missing ?formId=");
      const { items } = await ctx.storage.notificationAssignments.query({
        where: { formId },
        limit: 200,
      });
      return {
        assignments: (items as Array<{ id: string; data: StoredAssignment }>).map((a) => ({
          id: a.id,
          ...a.data,
        })),
      };
    },
  },

  "attach-notification": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        formId: string;
        templateId: string;
        recipientType: RecipientType;
        recipientField?: string;
        customRecipient?: string;
      };
      if (!input?.formId || !input?.templateId) {
        throw PluginRouteError.badRequest("formId and templateId are required");
      }

      const form = (await ctx.storage.forms.get(input.formId)) as StoredForm | null;
      if (!form) throw PluginRouteError.notFound("Form not found");
      const tpl = (await ctx.storage.templates.get(input.templateId)) as StoredTemplate | null;
      if (!tpl) throw PluginRouteError.notFound("Template not found");

      if (input.recipientType === "submitter") {
        if (!input.recipientField) {
          throw PluginRouteError.badRequest(
            "recipientField is required when recipientType is 'submitter'",
          );
        }
        const exists = form.rows.some((r) =>
          r.fields.some((f) => f.handle === input.recipientField),
        );
        if (!exists) {
          throw PluginRouteError.badRequest(
            `Form has no field with handle "${input.recipientField}"`,
          );
        }
      } else if (input.recipientType === "custom") {
        if (!input.customRecipient || !/\S+@\S+\.\S+/.test(input.customRecipient)) {
          throw PluginRouteError.badRequest("customRecipient must be a valid email");
        }
      } else {
        throw PluginRouteError.badRequest("recipientType must be 'submitter' or 'custom'");
      }

      const now = new Date().toISOString();
      const aid = uid();
      const assignment: StoredAssignment = {
        formId: input.formId,
        templateId: input.templateId,
        recipientType: input.recipientType,
        recipientField:
          input.recipientType === "submitter" ? input.recipientField : undefined,
        customRecipient:
          input.recipientType === "custom" ? input.customRecipient : undefined,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.storage.notificationAssignments.put(aid, assignment);
      return { id: aid, ...assignment };
    },
  },

  "detach-notification": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const { id } = routeCtx.input as { id: string };
      if (!id) throw PluginRouteError.badRequest("Missing id");
      await ctx.storage.notificationAssignments.delete(id);
      return { ok: true };
    },
  },

  "update-form-notification": {
    handler: async (routeCtx: any, ctx: PluginContext) => {
      const input = routeCtx.input as {
        id: string;
        enabled?: boolean;
        recipientType?: RecipientType;
        recipientField?: string;
        customRecipient?: string;
      };
      if (!input?.id) throw PluginRouteError.badRequest("Missing id");

      const existing = (await ctx.storage.notificationAssignments.get(
        input.id,
      )) as StoredAssignment | null;
      if (!existing) throw PluginRouteError.notFound("Assignment not found");

      const next: StoredAssignment = {
        ...existing,
        updatedAt: new Date().toISOString(),
      };
      if (typeof input.enabled === "boolean") next.enabled = input.enabled;

      if (input.recipientType) {
        if (input.recipientType === "submitter") {
          if (!input.recipientField) {
            throw PluginRouteError.badRequest(
              "recipientField is required when switching to recipientType 'submitter'",
            );
          }
          next.recipientType = "submitter";
          next.recipientField = input.recipientField;
          next.customRecipient = undefined;
        } else if (input.recipientType === "custom") {
          if (!input.customRecipient || !/\S+@\S+\.\S+/.test(input.customRecipient)) {
            throw PluginRouteError.badRequest("customRecipient must be a valid email");
          }
          next.recipientType = "custom";
          next.customRecipient = input.customRecipient;
          next.recipientField = undefined;
        } else {
          throw PluginRouteError.badRequest("recipientType must be 'submitter' or 'custom'");
        }
      } else {
        // Update just the field/email without switching type.
        if (input.recipientField !== undefined && next.recipientType === "submitter") {
          next.recipientField = input.recipientField;
        }
        if (input.customRecipient !== undefined && next.recipientType === "custom") {
          if (!/\S+@\S+\.\S+/.test(input.customRecipient)) {
            throw PluginRouteError.badRequest("customRecipient must be a valid email");
          }
          next.customRecipient = input.customRecipient;
        }
      }

      await ctx.storage.notificationAssignments.put(input.id, next);
      return { id: input.id, ...next };
    },
  },
};
