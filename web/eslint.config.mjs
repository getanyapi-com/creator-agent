import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next.js requires default exports from app-router files and config files; everything else is named.
const FRAMEWORK_DEFAULT_EXPORTS = ["src/app/**/{page,layout,not-found}.tsx", "*.config.{ts,mjs}"];

const config = [
  { ignores: [".next/**", "node_modules/**", "screenshots/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "no-restricted-syntax": ["error", { selector: "ExportDefaultDeclaration", message: "Named exports only." }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  { files: FRAMEWORK_DEFAULT_EXPORTS, rules: { "no-restricted-syntax": "off" } },
];

export default config;
