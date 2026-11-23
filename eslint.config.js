import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "bench/out", "web"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "no-restricted-syntax": ["error", { selector: "ExportDefaultDeclaration", message: "Named exports only." }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  { files: ["eslint.config.js"], rules: { "no-restricted-syntax": "off" } },
);
