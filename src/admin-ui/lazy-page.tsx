import { type ComponentType, useEffect, useState } from "react";

/**
 * Load a Freeform admin page only when EmDash mounts it.
 * Eager static imports pull @cloudflare/kumo into the dashboard bundle and
 * can crash hydration with a second React dispatcher (useContext null).
 */
type LazyModule<P extends object> =
  | ComponentType<P>
  | { default?: ComponentType<P>; [key: string]: unknown };

export function lazyPage<P extends object>(
  loader: () => Promise<LazyModule<P>>,
  exportName?: string,
): ComponentType<P> {
  function LazyFreeformPage(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      void loader()
        .then((mod) => {
          if (cancelled) return;
          let resolved: ComponentType<P> | undefined;
          if (typeof mod === "function") {
            resolved = mod as ComponentType<P>;
          } else if (mod && typeof mod === "object") {
            if ("default" in mod && typeof mod.default === "function") {
              resolved = mod.default as ComponentType<P>;
            } else if (exportName && typeof mod[exportName] === "function") {
              resolved = mod[exportName] as ComponentType<P>;
            }
          }
          if (!resolved) {
            setError(`Freeform admin page failed to load${exportName ? ` (${exportName})` : ""}`);
            return;
          }
          setComp(() => resolved!);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      return () => {
        cancelled = true;
      };
    }, []);

    if (error) {
      return (
        <div className="ff-root" style={{ padding: "1rem" }}>
          <p className="ff-alert-box ff-alert-error">{error}</p>
        </div>
      );
    }
    if (!Comp) {
      return (
        <div className="ff-root" style={{ padding: "1rem" }}>
          <p className="ff-card-subtitle">Loading Freeform…</p>
        </div>
      );
    }
    return <Comp {...props} />;
  }

  LazyFreeformPage.displayName = `LazyFreeformPage(${exportName ?? "default"})`;
  return LazyFreeformPage;
}
