import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: ["main.js", "node_modules/**", "coverage/**", "*.config.mjs", "version-bump.mjs", "scripts/**", "test-vault/**", "vitest.config.ts"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname } },
    rules: {
      // TypeScript's compiler handles undefined-symbol checking; ESLint's
      // no-undef is redundant and misfires on DOM/Web globals.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      // The declarative settings API needs Obsidian 1.13; minAppVersion is 1.11.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
);
