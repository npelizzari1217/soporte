import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Única excepción: el propio módulo de formateo, que SÍ instancia
    // Intl.DateTimeFormat (esa es su razón de ser). Los tests quedan afuera
    // porque formato-fecha.test.ts necesita el constructor nativo real para
    // espiarlo/subclasearlo (ver P1b en ese archivo) — no es una copia del
    // formateador, es la prueba de que el formateador no cachea la zona.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/lib/formato-fecha.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            "No instancies Intl.DateTimeFormat fuera de formato-fecha.ts: usá formatearInstante o formatearFechaCalendario de '@/shared/lib/formato-fecha'; si de verdad necesitás un formateador nuevo, va adentro de ese módulo.",
        },
      ],
    },
  },
];

export default eslintConfig;
