/**
 * `postinstall` del backend — no depende de que `pnpm` resuelve el PATH.
 *
 * En el VPS, `pnpm` a secas cae en el pnpm 9 global que instala el deploy de
 * educandow (`AppData\Roaming\npm\pnpm.cmd`), no en el pnpm 11 de corepack.
 * pnpm 9 rechaza el `pnpm-workspace.yaml` del backend ("packages field missing
 * or empty") y el `postinstall` cortaba el install (runbook, seccion del
 * `postinstall`). Ese pnpm global no se puede sacar: educandow lo necesita.
 *
 * Por eso el `postinstall` llama a Prisma directo: los binarios de
 * `node_modules/.bin` ya estan en el PATH de los scripts de ciclo de vida.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const postinstall = pkg.scripts.postinstall;

describe('postinstall del backend', () => {
  it('no invoca a un package manager (pnpm, npm, yarn, corepack)', () => {
    const comandos = postinstall.split('&&').map((c) => c.trim().split(/\s+/)[0]);
    expect(comandos).not.toContain('pnpm');
    expect(comandos).not.toContain('npm');
    expect(comandos).not.toContain('yarn');
    expect(comandos).not.toContain('corepack');
  });

  it('genera los clientes Prisma de master y de tenant', () => {
    expect(postinstall).toContain('prisma generate --schema=prisma_master/schema.prisma');
    expect(postinstall).toContain('prisma generate --schema=prisma_tenant/schema.prisma');
  });
});
