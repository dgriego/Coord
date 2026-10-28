import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS, type VendorCategory, type VendorInput } from "@coord/shared";

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// Header names people use in vendor spreadsheets, mapped to our fields.
const HEADER_ALIASES: Record<string, keyof VendorInput> = {
  name: "name",
  vendor: "name",
  "vendor name": "name",
  company: "name",
  category: "categories",
  categories: "categories",
  type: "categories",
  website: "website",
  url: "website",
  web: "website",
  email: "email",
  phone: "phone",
  telephone: "phone",
  account: "accountNumber",
  "account number": "accountNumber",
  "account #": "accountNumber",
  "acct #": "accountNumber",
  rep: "repName",
  "rep name": "repName",
  "sales rep": "repName",
  "rep email": "repEmail",
  city: "city",
  state: "state",
  discount: "discountBps",
  "trade discount": "discountBps",
  "lead time": "leadTimeWeeks",
  "lead time (weeks)": "leadTimeWeeks",
  terms: "paymentTerms",
  "payment terms": "paymentTerms",
  notes: "notes",
};

const CATEGORY_LOOKUP = new Map<string, VendorCategory>();
for (const c of VENDOR_CATEGORIES) {
  CATEGORY_LOOKUP.set(c, c);
  CATEGORY_LOOKUP.set(VENDOR_CATEGORY_LABELS[c].toLowerCase(), c);
}
CATEGORY_LOOKUP.set("tile", "tile_stone");
CATEGORY_LOOKUP.set("stone", "tile_stone");
CATEGORY_LOOKUP.set("drapery", "window_treatments");
CATEGORY_LOOKUP.set("case goods", "casegoods");
CATEGORY_LOOKUP.set("furniture", "casegoods");

export interface ParsedVendorRow {
  row: number;
  input: VendorInput;
  problem?: string;
}

/** Turns a vendor spreadsheet into vendor inputs, matching columns by header name. */
export function vendorsFromCsv(text: string): ParsedVendorRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const columns = header.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!columns.includes("name")) {
    return [{ row: 1, input: { name: "" }, problem: "No column named Name or Vendor." }];
  }

  return body.map((cells, i) => {
    const input: VendorInput = { name: "" };
    const unknownCategories: string[] = [];
    cells.forEach((raw, col) => {
      const key = columns[col];
      const value = raw.trim();
      if (!key || !value) return;
      if (key === "categories") {
        const cats = value
          .split(/[;,/|]/)
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean);
        input.categories = [...new Set(cats.map((v) => CATEGORY_LOOKUP.get(v)).filter((v): v is VendorCategory => !!v))];
        unknownCategories.push(...cats.filter((v) => !CATEGORY_LOOKUP.has(v)));
      } else if (key === "discountBps") {
        const pct = parseFloat(value.replace("%", ""));
        if (Number.isFinite(pct)) input.discountBps = Math.round(pct * 100);
      } else if (key === "leadTimeWeeks") {
        const weeks = parseInt(value, 10);
        if (Number.isFinite(weeks)) input.leadTimeWeeks = weeks;
      } else {
        (input as Record<string, unknown>)[key] = value;
      }
    });
    const problem = !input.name
      ? "Missing a name."
      : unknownCategories.length
        ? `Unknown categories ignored: ${unknownCategories.join(", ")}.`
        : undefined;
    return { row: i + 2, input, problem };
  });
}
