// Fails the build when the web app's initial download grows past budget
// (PLAN.md 9.1: initial route JS under 200 KB gzipped).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGETS = { js: 200 * 1024, css: 30 * 1024 };
const dist = join(import.meta.dirname, "../apps/web/dist");

const html = readFileSync(join(dist, "index.html"), "utf8");
// Everything index.html loads up front: entry scripts, preloaded chunks, stylesheets.
const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);

const totals = { js: 0, css: 0 };
for (const asset of assets) {
  const kind = asset.endsWith(".css") ? "css" : asset.endsWith(".js") ? "js" : null;
  if (!kind) continue;
  const size = gzipSync(readFileSync(join(dist, asset))).length;
  totals[kind] += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${asset}`);
}

let failed = false;
for (const kind of /** @type {const} */ (["js", "css"])) {
  const ok = totals[kind] <= BUDGETS[kind];
  failed ||= !ok;
  console.log(
    `${ok ? "ok  " : "FAIL"} initial ${kind}: ${(totals[kind] / 1024).toFixed(1)} KB gzipped (budget ${BUDGETS[kind] / 1024} KB)`,
  );
}
process.exit(failed ? 1 : 0);
