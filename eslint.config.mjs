import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**/*.{js,css}"], // Ignore compiled file
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
  },
];
