import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Builds estáticos trazidos do Replit (JS minificado, não é código nosso).
    "public/10mil-com-airbnb/**",
    "public/curso-booking/**",
    "public/encontro-anfitrioes/**",
    "public/obrigado-10mil/**",
  ]),
]);

export default eslintConfig;
