import { useCallback, useEffect, useState } from "react";
import { listForms, type FormListItem } from "./ff-api";
import { FormBuilder } from "./FormBuilder";
import { FormsDashboard } from "./FormsDashboard";
import { FreeformShell } from "./FreeformShell";
import "./styles.css";

export function FormsPage() {
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setForms(await listForms());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <FreeformShell section="forms">
      {editingId ? (
        <FormBuilder
          formId={editingId}
          onBack={() => {
            setEditingId(null);
            void refresh();
          }}
        />
      ) : (
        <FormsDashboard
          forms={forms}
          loading={loading}
          error={error}
          onRefresh={() => void refresh()}
          onEdit={setEditingId}
          onError={setError}
        />
      )}
    </FreeformShell>
  );
}
