import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tooling that ships with the editor/agent setup — not our source, and it
    // targets CommonJS, which this config deliberately forbids in app code.
    ".claude/**",
    // Specs and reference prototypes handed to us, kept verbatim so they can be
    // compared against what we built. Not source, never bundled, and linting
    // someone else's single-file prototype to our rules produces only noise.
    "context_for_claude*/**",
    "_to_delete/**",
  ]),
]);

export default eslintConfig;
