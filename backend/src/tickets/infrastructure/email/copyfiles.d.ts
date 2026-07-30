/**
 * Declaración ambiente mínima para `copyfiles` — no publica tipos propios
 * (sin paquete `@types/copyfiles`). Tipa solo la forma que usa
 * `email-templates-build.spec.ts` (Judgment Day PR2 Ronda 2, issue A):
 * `module.exports = function copyFiles(args, config, callback)`.
 *
 * Ref: node_modules/copyfiles/index.js — `module.exports = copyFiles`.
 */
declare module 'copyfiles' {
  interface CopyFilesConfig {
    up?: number;
    soft?: boolean;
    all?: boolean;
    error?: boolean;
    verbose?: boolean;
    follow?: boolean;
    exclude?: string | string[];
  }

  function copyFiles(
    args: string[],
    config: CopyFilesConfig,
    callback: (err?: Error) => void,
  ): void;

  export = copyFiles;
}
