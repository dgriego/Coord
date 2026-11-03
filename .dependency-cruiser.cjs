// Import boundaries from the rebuild plan. The arrows only point one way:
//   apps -> data/contract/ui -> domain -> money
// These rules are written before the packages exist so they apply from the first file.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "money-imports-nothing",
      comment: "The money kernel is pure arithmetic: no other package, no app.",
      severity: "error",
      from: { path: "^packages/money/" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/money/" },
    },
    {
      name: "domain-imports-only-money",
      comment: "Business rules are pure; they may build on money and nothing else.",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/(domain|money)/" },
    },
    {
      name: "ui-stays-presentational",
      comment: "Atoms and organisms receive data as props; they never fetch it.",
      severity: "error",
      from: { path: "^packages/ui-" },
      to: { path: "^(packages/(data|contract)|apps)/" },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-never-import-each-other",
      comment: "Shared code belongs in a package, not in another app.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
