/**
 * Sandbox-safe PluginRouteError.
 *
 * Do not import PluginRouteError from bare `"emdash"` in sandboxed plugin
 * code — the isolate shim only exports `definePlugin`, so the worker fails
 * ESM linking. The host matches errors by shape (`name`, `code`, `status`),
 * not `instanceof`, so this local copy is enough for both trusted and
 * sandboxed runtimes.
 */
export class PluginRouteError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PluginRouteError";
  }

  static badRequest(message: string, details?: unknown): PluginRouteError {
    return new PluginRouteError("BAD_REQUEST", message, 400, details);
  }

  static unauthorized(message: string = "Unauthorized"): PluginRouteError {
    return new PluginRouteError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message: string = "Forbidden"): PluginRouteError {
    return new PluginRouteError("FORBIDDEN", message, 403);
  }

  static notFound(message: string = "Not found"): PluginRouteError {
    return new PluginRouteError("NOT_FOUND", message, 404);
  }

  static conflict(message: string, details?: unknown): PluginRouteError {
    return new PluginRouteError("CONFLICT", message, 409, details);
  }

  static internal(message: string = "Internal error"): PluginRouteError {
    return new PluginRouteError("INTERNAL_ERROR", message, 500);
  }
}
