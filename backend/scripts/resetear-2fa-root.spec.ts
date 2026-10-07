/**
 * resetear-2fa-root.spec.ts — WU-8 (8.6: S3, S6, S7). Integracion contra `soporte_master_test`
 * con filas de sufijo aleatorio (no trunca); el proceso real se corre con ts-node.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as path from 'path';
import { resetear2faRoot, RootNoEncontradoError } from './resetear-2fa-root';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';

const URL_MASTER =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const SUFIJO = randomBytes(4).toString('hex');
const SCRIPT = path.resolve(__dirname, 'resetear-2fa-root.ts');
const TS_NODE = path.resolve(__dirname, '../node_modules/.bin/ts-node');

function correr(email: string): Promise<{ exitCode: number | null; salida: string }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(TS_NODE, [SCRIPT], {
      env: { ...process.env, DATABASE_URL_MASTER: URL_MASTER, RESET_EMAIL: email },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (c: Buffer) => (salida += c.toString()));
    hijo.stderr.on('data', (c: Buffer) => (salida += c.toString()));
    hijo.on('error', reject);
    hijo.on('close', (exitCode) => resolve({ exitCode, salida }));
  });
}

describe('resetear-2fa-root', () => {
  let prisma: PrismaService;
  const ids: string[] = [];

  const master = () => prisma.getMasterClient();

  async function crearUsuario(etiqueta: string, isGlobalAdmin: boolean) {
    const u = await master().usuario.create({
      data: {
        email: `r2fa-${etiqueta}-${SUFIJO}@script.test`,
        nombre: 'S',
        apellido: etiqueta,
        passwordHash: 'h',
        activo: true,
        isGlobalAdmin,
      },
    });
    ids.push(u.id);
    await master().usuarioTfa.create({
      data: { usuarioId: u.id, secretoCifrado: 'SECRETO-CIFRADO-X', confirmadoAt: new Date() },
    });
    await master().tfaCodigoRecuperacion.create({
      data: { usuarioId: u.id, codigoHash: 'hash-codigo' },
    });
    await master().tfaDispositivoConfiable.create({
      data: {
        usuarioId: u.id,
        tokenHash: `dev-${etiqueta}-${SUFIJO}`,
        expiraAt: new Date(Date.now() + 86_400_000),
      },
    });
    await master().refreshToken.create({
      data: {
        usuarioId: u.id,
        tokenHash: `rt-${etiqueta}-${SUFIJO}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return u;
  }

  const estado = async (usuarioId: string) => ({
    tfa: await master().usuarioTfa.count({ where: { usuarioId } }),
    codigos: await master().tfaCodigoRecuperacion.count({ where: { usuarioId } }),
    dispositivosVivos: await master().tfaDispositivoConfiable.count({
      where: { usuarioId, revocadoAt: null },
    }),
    refreshVivos: await master().refreshToken.count({ where: { usuarioId, revokedAt: null } }),
  });

  beforeAll(() => {
    prisma = new PrismaService(URL_MASTER);
  });

  afterAll(async () => {
    for (const id of ids) {
      await master().refreshToken.deleteMany({ where: { usuarioId: id } });
      await master().usuario.deleteMany({ where: { id } });
    }
    await prisma.onModuleDestroy();
  });

  it('S3/S6: un ROOT queda sin 2FA, codigos, dispositivos vivos ni sesiones', async () => {
    const root = await crearUsuario('root', true);
    await resetear2faRoot(master(), root.email);
    expect(await estado(root.id)).toEqual({
      tfa: 0,
      codigos: 0,
      dispositivosVivos: 0,
      refreshVivos: 0,
    });
  });

  it('S6: un usuario que no es ROOT o no existe falla sin modificar nada', async () => {
    const comun = await crearUsuario('comun', false);
    await expect(resetear2faRoot(master(), comun.email)).rejects.toThrow(RootNoEncontradoError);
    await expect(resetear2faRoot(master(), `nadie-${SUFIJO}@script.test`)).rejects.toThrow(
      RootNoEncontradoError,
    );
    expect(await estado(comun.id)).toEqual({
      tfa: 1,
      codigos: 1,
      dispositivosVivos: 1,
      refreshVivos: 1,
    });
  });

  it('S7: el proceso real imprime solo OK, con exit 0, y sin secretos', async () => {
    const root = await crearUsuario('proceso', true);
    const r = await correr(root.email);
    expect(r.salida.trim()).toBe('OK');
    expect(r.exitCode).toBe(0);
    expect(r.salida).not.toContain('SECRETO-CIFRADO-X');
    expect(r.salida).not.toContain('hash-codigo');
    expect((await estado(root.id)).tfa).toBe(0);
  }, 90_000);

  it('S6/S7: el proceso real sale con 1 para un no ROOT, sin tocar nada ni imprimir secretos', async () => {
    const comun = await crearUsuario('proceso-comun', false);
    const r = await correr(comun.email);
    expect(r.exitCode).toBe(1);
    expect(r.salida).not.toContain('SECRETO-CIFRADO-X');
    expect((await estado(comun.id)).tfa).toBe(1);
  }, 90_000);
});
