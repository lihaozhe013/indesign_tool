import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "pnpm-lock.yaml"]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-restricted-imports": ["error", {
        "paths": [{
          "name": "indesign",
          "message": "InDesign DOM access must stay in packages/indesign."
        }, {
          "name": "uxp",
          "message": "UXP runtime access must stay in host and plugin adapters."
        }]
      }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    files: ["packages/core/**/*.ts", "packages/contracts/**/*.ts", "packages/template/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        "patterns": ["node:*", "fs", "path", "uxp", "indesign"]
      }]
    }
  }
];
