import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import nPlugin from "eslint-plugin-n";
import prettierConfig from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const tsFiles = ["**/*.ts", "**/*.tsx"];
const jsFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

const tsRecommended = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: tsFiles,
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    ignores: ["dist", "node_modules", "coverage", ".changeset"],
  },
  js.configs.recommended,
  ...tsRecommended,
  {
    files: tsFiles,
    plugins: {
      import: importPlugin,
      n: nPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
        },
      },
    },
    rules: {
      "import/order": [
        "warn",
        {
          groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/newline-after-import": ["warn", { count: 1 }],
      "n/no-missing-import": "off",
      "n/no-unsupported-features/es-syntax": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: jsFiles,
    plugins: {
      n: nPlugin,
    },
    rules: {
      "n/no-unsupported-features/es-syntax": "off",
    },
  },
  prettierConfig,
];
