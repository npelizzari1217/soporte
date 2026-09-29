/**
 * Reglas de los scripts de operaciones del VPS (`*.ps1` de la raiz del repo).
 *
 * No necesita pwsh: lee los archivos como texto, asi que corre siempre.
 *
 * 1. `~/proyectos/CLAUDE.md` §2.2: 100% ASCII y sin BOM. PowerShell 5.1 lee un
 *    `.ps1` sin BOM como ANSI, y un solo caracter acentuado corrompe el parseo.
 *    `rotate-jwt.ps1` llego del VPS con un guion largo en un comentario.
 * 2. `rotate-jwt.ps1` esta BLOQUEADO hasta que se reescriba: reporta OK y deja
 *    backend y frontend con claves distintas. Su primera sentencia tiene que ser
 *    el `throw`; si alguien lo corre de lugar, este spec lo marca.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');

const scriptsPs1 = readdirSync(RAIZ)
  .filter((nombre) => nombre.endsWith('.ps1'))
  .sort();

describe('Scripts de operaciones del VPS (*.ps1 de la raiz)', () => {
  it('existen (si la lista queda vacia, el spec no estaria probando nada)', () => {
    expect(scriptsPs1).toEqual(
      expect.arrayContaining(['deploy.ps1', 'install-cert-soporte.ps1', 'rotate-jwt.ps1']),
    );
  });

  it.each(scriptsPs1)('%s es ASCII puro y sin BOM', (nombre) => {
    const bytes = readFileSync(join(RAIZ, nombre));
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    const noAscii = [...bytes].findIndex((b) => b > 0x7f);
    expect(noAscii, `primer byte no ASCII en el offset ${noAscii}`).toBe(-1);
  });

  it('rotate-jwt.ps1 corta en su primera sentencia (esta bloqueado hasta reescribirlo)', () => {
    const lineas = readFileSync(join(RAIZ, 'rotate-jwt.ps1'), 'ascii').split(/\r?\n/);
    const primeraSentencia = lineas.find((l) => l.trim() !== '' && !l.trim().startsWith('#'));
    expect(primeraSentencia).toMatch(/^throw '/);
  });
});
