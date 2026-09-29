/**
 * Reglas de los scripts de operaciones del VPS (`*.ps1` de la raiz del repo).
 *
 * No necesita pwsh: lee los archivos como texto, asi que corre siempre.
 *
 * 1. `~/proyectos/CLAUDE.md` §2.2: 100% ASCII y sin BOM. PowerShell 5.1 lee un
 *    `.ps1` sin BOM como ANSI, y un solo caracter acentuado corrompe el parseo.
 *    `rotate-jwt.ps1` llego del VPS con un guion largo en un comentario.
 * 2. Ningun script de la raiz usa `setx`: rotate-jwt.ps1 rota JWT_SECRET sin
 *    volver a dejar una variable de entorno MACHINE (la que causaba que la
 *    clave vieja ganara sobre backend/.env, ver DEPLOY-VPS-runbook.md, seccion
 *    "rotate-jwt.ps1"). Un `setx` nuevo en cualquier .ps1 reintroduce el mismo
 *    problema por otra via.
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

  it.each(scriptsPs1)('%s no usa setx (la variable MACHINE no debe volver)', (nombre) => {
    const contenido = readFileSync(join(RAIZ, nombre), 'ascii');
    expect(contenido.toLowerCase()).not.toContain('setx');
  });
});
