/**
 * ps1-ascii.spec.ts — WU3 (sdd/rotacion-email-crypto-key).
 *
 * PowerShell 5.1 lee un .ps1 sin BOM como ANSI: un solo caracter no-ASCII
 * corrompe el parseo (ver cabecera de rotate-admin-pw.ps1). Este spec es la
 * unica compuerta automatica de esa regla — nada mas la verifica en CI.
 *
 * Ref spec: "El script operativo es ASCII puro sin BOM" (R14). Ref tasks: WU3 3.5.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const archivosPs1 = readdirSync(repoRoot).filter((nombre) => nombre.endsWith('.ps1'));

describe('*.ps1 de la raiz del repo — ASCII puro, sin BOM', () => {
  it('encuentra al menos un archivo .ps1 para verificar', () => {
    expect(archivosPs1.length).toBeGreaterThan(0);
  });

  it.each(archivosPs1)('%s es ASCII puro y no lleva BOM', (nombre) => {
    const contenido = readFileSync(join(repoRoot, nombre));

    expect(contenido.subarray(0, 3).equals(BOM)).toBe(false);

    const byteNoAscii = contenido.findIndex((byte) => byte > 0x7f);
    expect(byteNoAscii).toBe(-1);
  });
});
