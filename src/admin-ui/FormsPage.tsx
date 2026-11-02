import { useCallback, useEffect, useState } from "react";
import { listForms, type FormListItem } from "./ff-api";
import { FormBuilder } from "./FormBuilder";
import { FormsDashboard } from "./FormsDashboard";
import { FreeformShell } from "./FreeformShell";
import "./styles.css";

/** Read deep-link from `?formId=` or `?handle=` (EmDash keeps the page at `/forms`). */
function readFormDeepLink(): { formId: string | null; handle: string | null } {
  if (typeof window === "undefined") return { formId: null, handle: null };
  const params = new URLSearchParams(window.location.search);
  const formId = params.get("formId")?.trim() || null;
  const handle = params.get("handle")?.trim() || null;
  return { formId, handle };
}

function writeFormDeepLink(formId: string | null, handle?: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (formId) {
    url.searchParams.set("formId", formId);
    if (handle) url.searchParams.set("handle", handle);
    else url.searchParams.delete("handle");
  } else {
    url.searchParams.delete("formId");
    url.searchParams.delete("handle");
  }
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export function FormsPage() {
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() => readFormDeepLink().formId);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listForms();
      setForms(list);

      // Resolve `?handle=` (or validate `?formId=`) after the list loads.
      const { formId, handle } = readFormDeepLink();
      if (formId) {
        const match = list.find((f) => f.id === formId);
        if (match) {
          setEditingId(match.id);
          writeFormDeepLink(match.id, match.handle);
        } else {
          setEditingId(null);
          writeFormDeepLink(null);
          setError(`Form not found (${formId}).`);
        }
      } else if (handle) {
        const match = list.find((f) => f.handle === handle);
        if (match) {
          setEditingId(match.id);
          writeFormDeepLink(match.id, match.handle);
        } else {
          setEditingId(null);
          writeFormDeepLink(null);
          setError(`Form not found (handle “${handle}”).`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openForm = useCallback((id: string, handle?: string) => {
    setEditingId(id);
    const match = forms.find((f) => f.id === id);
    writeFormDeepLink(id, handle ?? match?.handle ?? null);
  }, [forms]);

  const closeForm = useCallback(() => {
    setEditingId(null);
    writeFormDeepLink(null);
    void refresh();
  }, [refresh]);

  return (
    <FreeformShell section="forms" hideNav={Boolean(editingId)}>
      {editingId ? (
        <FormBuilder formId={editingId} onBack={closeForm} />
      ) : (
        <FormsDashboard
          forms={forms}
          loading={loading}
          error={error}
          onRefresh={() => void refresh()}
          onEdit={openForm}
          onError={setError}
        />
      )}
    </FreeformShell>
  );
}
