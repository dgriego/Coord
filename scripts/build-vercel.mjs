// Builds the whole app in Vercel's Build Output API format (.vercel/output):
// the web app as static files and the API as one Node function.
// https://vercel.com/docs/build-output-api/v3
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const out = join(root, ".vercel/output");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });

run("npm run build -w @coord/web");
if (process.env.DATABASE_URL) run("npm run migrate -w @coord/api");

cpSync(join(root, "apps/web/dist"), join(out, "static"), { recursive: true });

const fn = join(out, "functions/api.func");
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, "apps/api/src/vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Embedded Postgres is only for local dev; production always has DATABASE_URL.
  external: ["@electric-sql/pglite"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
writeFileSync(join(fn, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(
  join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      // Live-update streams reconnect on their own when an instance recycles.
      maxDuration: 300,
    },
    null,
    2,
  ),
);

writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html", headers: { "cache-control": "no-cache" } },
      ],
    },
    null,
    2,
  ),
);
console.log("Vercel output written to .vercel/output");
