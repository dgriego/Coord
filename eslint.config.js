// Lint rules that keep Coord readable. Formatting belongs to Prettier;
// everything here is about correctness and size.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Patterns agents tend to produce that hide a type problem instead of fixing it.
const antiSlop = [
  {
    selector: "TSAsExpression > TSAsExpression",
    message: "Chained type assertion. Fix the type instead of casting twice.",
  },
  {
    selector: ":function > Identifier > TSTypeAnnotation > TSUnknownKeyword",
    message: "Parameter typed unknown. Validate at the trust boundary and pass a real type inward.",
  },
  {
    selector:
      "SpreadElement > ConditionalExpression[alternate.type='ObjectExpression'][alternate.properties.length=0]",
    message: "Conditional spread of an empty object. Build the object plainly.",
  },
  {
    selector:
      "SpreadElement > ConditionalExpression[consequent.type='ObjectExpression'][consequent.properties.length=0]",
    message: "Conditional spread of an empty object. Build the object plainly.",
  },
  {
    selector: "SpreadElement > LogicalExpression[operator='&&']",
    message: "Conditional spread. Build the object plainly.",
  },
  {
    selector:
      "LogicalExpression[operator=/^(\\?\\?|\\|\\|)$/][right.type='ObjectExpression'][right.properties.length=0]",
    message: "Empty-object fallback. Fix the type so the value can't be missing.",
  },
];

// Named exports only, and a package's src/index.ts is its only re-export file.
const exportRules = [
  { selector: "ExportDefaultDeclaration", message: "Use a named export." },
  {
    selector: "ExportAllDeclaration",
    message: "No barrel files. Re-export only from src/index.ts.",
  },
  {
    selector: "ExportNamedDeclaration[source]",
    message: "No barrel files. Re-export only from src/index.ts.",
  },
];

export default defineConfig([
  globalIgnores([".claude/**", ".vercel/**", "**/dist/**", "**/coverage/**", "**/.stryker-tmp/**"]),

  js.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "no-restricted-syntax": ["error", ...antiSlop, ...exportRules],
      // Small functions and files are easier to read than clever ones.
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    // A package's entry re-exports its modules; tool configs must export default.
    files: ["**/src/index.ts", "*.config.ts"],
    rules: { "no-restricted-syntax": ["error", ...antiSlop] },
  },

  {
    // A test file is a list of examples; its describe blocks may run long.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "max-lines-per-function": "off" },
  },

  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
  },
]);
