export interface CsvColumn {
  key: string;
  label: string;
}

// RFC 4180: quote a field when it contains comma, double-quote, CR, or LF.
// Doubled quotes escape an embedded quote. Strings with leading/trailing
// whitespace or a leading `=`/`+`/`-`/`@` are also quoted to defeat naive
// formula injection if the CSV is opened in Excel/Sheets.
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (Array.isArray(value)) {
    s = value.map((v) => (v === null || v === undefined ? "" : String(v))).join("; ");
  } else if (typeof value === "object") {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  const needsQuote =
    /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) || /^\s|\s$/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: Array<Record<string, unknown>>, columns: CsvColumn[]): string {
  const header = columns.map((c) => csvField(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvField(row[c.key])).join(","))
    .join("\r\n");
  // Excel-friendly: prepend UTF-8 BOM so it opens with correct encoding.
  return body ? `﻿${header}\r\n${body}\r\n` : `﻿${header}\r\n`;
}
