export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function toHandle(label: string): string {
  return (
    label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "field"
  );
}
