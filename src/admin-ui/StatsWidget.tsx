import { useEffect, useState } from "react";
import { listForms } from "./ff-api";
import "./styles.css";

export function StatsWidget() {
  const [forms, setForms] = useState(0);
  const [subs, setSubs] = useState(0);

  useEffect(() => {
    void listForms()
      .then((items) => {
        setForms(items.length);
        setSubs(items.reduce((n, f) => n + f.subCount, 0));
      })
      .catch(() => {
        /* widget stays at zeros */
      });
  }, []);

  return (
    <div className="ff-root" style={{ padding: "0.25rem 0" }}>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <div>
          <div className="ff-meta">Forms</div>
          <strong style={{ fontSize: "1.4rem" }}>{forms}</strong>
        </div>
        <div>
          <div className="ff-meta">Submissions</div>
          <strong style={{ fontSize: "1.4rem" }}>{subs}</strong>
        </div>
      </div>
    </div>
  );
}
