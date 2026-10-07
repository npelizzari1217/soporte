/**
 * usuarios-reseteo-tfa.e2e.spec.ts — WU-8 (verificacion-dos-pasos, 8.5: S1-S5, S8).
 *
 * `DELETE /usuarios/:id/2fa` con guards reales y Postgres real. No trunca `soporte_master_test`:
 * cada fila lleva un sufijo aleatorio y se borra al final.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { AuthModule } from '../../auth.module';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import {
  activarTfaDeTest,
  codigoDeTest,
  reiniciarAntireplay,
} from '../../test-helpers/tfa-de-test';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const PASSWORD = 'E2eSecret!123';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

type Cuerpo = Record<string, any>;

usarLockMasterTest();

describe('DELETE /usuarios/:id/2fa: reseteo de 2FA', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prisma: PrismaService;
  let hashPassword: string;
  let emailKeyOriginal: string | undefined;
  const usuarioIds: string[] = [];
  const clienteIds: string[] = [];
  let contadorRoot = 0;

  async function http(metodo: string, ruta: string, body?: object, token?: string) {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as Cuerpo };
  }
  const post = (ruta: string, body: object, token?: string) => http('POST', ruta, body, token);
  const resetear = (token: string, id: string) =>
    http('DELETE', `/usuarios/${id}/2fa`, undefined, token);
  const login = (email: string) => post('/auth/login', { email, password: PASSWORD });

  async function crearUsuario(etiqueta: string, root = false) {
    const u = UsuarioEntity.create({
      email: `reset2fa-${etiqueta}-${SUFIJO}@auth.test`,
      nombre: 'R2fa',
      apellido: etiqueta,
      passwordHash: hashPassword,
      activo: true,
      isGlobalAdmin: root,
    });
    await new PrismaUsuarioRepository(prisma).save(u);
    usuarioIds.push(u.id);
    return { id: u.id, email: u.email };
  }

  async function crearCliente(etiqueta: string, requiere2fa = false): Promise<string> {
    const c = ClienteEntity.create({
      nombre: `R2fa ${etiqueta} ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_r2fa_${etiqueta}_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(c);
    clienteIds.push(c.id);
    if (requiere2fa)
      await pool.query('UPDATE clientes SET requiere_2fa = true WHERE id = $1', [c.id]);
    return c.id;
  }

  async function miembro(
    usuarioId: string,
    clienteId: string,
    rolCodigo = 'TECNICO',
    activo = true,
  ) {
    const master = prisma.getMasterClient();
    const rol =
      (await master.role.findFirst({ where: { codigo: rolCodigo } })) ??
      (await master.role.create({ data: { codigo: rolCodigo, nombre: rolCodigo } }));
    await master.membresia.create({ data: { usuarioId, clienteId, rolId: rol.id, activo } });
  }

  /** Token de un usuario sin 2FA con un solo cliente. */
  async function tokenDe(email: string): Promise<string> {
    return (await login(email)).body.accessToken as string;
  }

  /** Token de un ROOT dentro de `clienteId` (login con 2FA, continuar y switch). */
  async function tokenRoot(clienteId: string): Promise<string> {
    const u = await crearUsuario(`root-actor-${++contadorRoot}`, true);
    await activarTfaDeTest(prisma, u.id);
    const r = await login(u.email);
    const v = await post('/auth/2fa/verificar', {
      desafio: r.body.desafio,
      codigo: codigoDeTest(u.id),
    });
    const c = await post('/auth/login/continuar', { ticket: v.body.ticket });
    const s = await post('/auth/switch', { clienteId }, c.body.accessToken);
    return s.body.accessToken as string;
  }

  const cuenta = async (tabla: string, id: string) =>
    Number(
      (await pool.query(`SELECT count(*) FROM ${tabla} WHERE usuario_id = $1`, [id])).rows[0].count,
    );

  /** Usuario con 2FA, 2 codigos, un dispositivo y una sesion abierta (login previo al 2FA). */
  async function usuarioConTodo(etiqueta: string, clienteId: string) {
    const u = await crearUsuario(etiqueta);
    await miembro(u.id, clienteId);
    const sesion = await login(u.email);
    await activarTfaDeTest(prisma, u.id);
    await pool.query(
      `INSERT INTO tfa_codigos_recuperacion (usuario_id, codigo_hash) VALUES ($1, 'h1'), ($1, 'h2')`,
      [u.id],
    );
    await pool.query(
      `INSERT INTO tfa_dispositivos_confiables (usuario_id, token_hash, expira_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [u.id, `dev-${etiqueta}-${SUFIJO}`],
    );
    return { ...u, refreshToken: sesion.body.refreshToken as string };
  }

  beforeAll(async () => {
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'f'.repeat(64);
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;
    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
    pool = new Pool({ connectionString: URL_MASTER });
    prisma = new PrismaService(URL_MASTER);
    hashPassword = await new Argon2HashProvider().hash(PASSWORD);
    reiniciarAntireplay();
  }, 60_000);

  afterAll(async () => {
    for (const id of usuarioIds) {
      await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave LIKE $1', [`%${id}%`]);
      for (const t of [
        'auth_desafios',
        'tfa_dispositivos_confiables',
        'tfa_codigos_recuperacion',
        'usuarios_tfa',
        'refresh_tokens',
        'membresias',
      ])
        await pool.query(`DELETE FROM ${t} WHERE usuario_id = $1`, [id]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    if (clienteIds.length)
      await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clienteIds]);
    await pool.end();
    await prisma.onModuleDestroy();
    await app?.close();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 30_000);

  it('S1/S3: ROOT resetea a un usuario con otras membresias; efectos completos y sesion revocada', async () => {
    const a = await crearCliente('s1a');
    const t = await usuarioConTodo('s1', a);
    await miembro(t.id, await crearCliente('s1b'));
    const tokenA = await tokenRoot(a);

    expect((await resetear(tokenA, t.id)).status).toBe(204);

    expect(await cuenta('usuarios_tfa', t.id)).toBe(0);
    expect(await cuenta('tfa_codigos_recuperacion', t.id)).toBe(0);
    const vivos = await pool.query(
      'SELECT count(*) FROM tfa_dispositivos_confiables WHERE usuario_id = $1 AND revocado_at IS NULL',
      [t.id],
    );
    expect(Number(vivos.rows[0].count)).toBe(0);
    expect((await post('/auth/refresh', { refreshToken: t.refreshToken })).status).toBe(401);
  });

  it('S1: ROOT resetea a otro ROOT', async () => {
    const a = await crearCliente('s1root');
    const otro = await crearUsuario('s1-otro-root', true);
    await activarTfaDeTest(prisma, otro.id);
    expect((await resetear(await tokenRoot(a), otro.id)).status).toBe(204);
    expect(await cuenta('usuarios_tfa', otro.id)).toBe(0);
  });

  it('S2/S3: ADMINISTRADOR resetea a un usuario solo de su cliente, y a si mismo', async () => {
    const a = await crearCliente('s2');
    const t = await usuarioConTodo('s2', a);
    const admin = await crearUsuario('s2-admin');
    await miembro(admin.id, a, 'ADMINISTRADOR');
    const token = await tokenDe(admin.email);

    expect((await resetear(token, t.id)).status).toBe(204);
    expect(await cuenta('usuarios_tfa', t.id)).toBe(0);
    expect((await resetear(token, admin.id)).status).toBe(204);
  });

  it('S2/S4: otras membresias, destino ROOT, otro cliente e inexistente dan el MISMO 404 y no tocan nada', async () => {
    const a = await crearCliente('s4a');
    const b = await crearCliente('s4b');
    const admin = await crearUsuario('s4-admin');
    await miembro(admin.id, a, 'ADMINISTRADOR');
    const token = await tokenDe(admin.email);

    const conInactiva = await usuarioConTodo('s4-inactiva', a);
    await miembro(conInactiva.id, b, 'TECNICO', false);
    const root = await crearUsuario('s4-root', true);
    await miembro(root.id, a);
    await activarTfaDeTest(prisma, root.id);
    const ajeno = await usuarioConTodo('s4-ajeno', b);

    const respuestas = [];
    for (const id of [conInactiva.id, root.id, ajeno.id, '00000000-0000-4000-8000-000000000000'])
      respuestas.push(await resetear(token, id));

    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual(respuestas[3].body);
    }
    expect(await cuenta('usuarios_tfa', conInactiva.id)).toBe(1);
    expect(await cuenta('usuarios_tfa', root.id)).toBe(1);
    expect(await cuenta('usuarios_tfa', ajeno.id)).toBe(1);
  });

  it('S8: un TECNICO recibe 403 y nada cambia', async () => {
    const a = await crearCliente('s8');
    const t = await usuarioConTodo('s8', a);
    const tecnico = await crearUsuario('s8-tecnico');
    await miembro(tecnico.id, a);
    expect((await resetear(await tokenDe(tecnico.email), t.id)).status).toBe(403);
    expect(await cuenta('usuarios_tfa', t.id)).toBe(1);
  });

  it('S5: tras el reseteo, no obligado entra sin codigo y obligado pasa por el enrolamiento', async () => {
    const libre = await crearCliente('s5libre');
    const exige = await crearCliente('s5exige', true);
    const noObligado = await usuarioConTodo('s5-libre', libre);
    const obligado = await crearUsuario('s5-obligado');
    await miembro(obligado.id, exige);
    await activarTfaDeTest(prisma, obligado.id);
    const token = await tokenRoot(libre);

    expect((await resetear(token, noObligado.id)).status).toBe(204);
    expect((await resetear(token, obligado.id)).status).toBe(204);

    const l1 = await login(noObligado.email);
    expect(l1.body.accessToken).toEqual(expect.any(String));
    expect(l1.body.needs2fa).toBeUndefined();
    const l2 = await login(obligado.email);
    expect(l2.body.needsEnrolamiento2fa).toBe(true);
    expect(l2.body.accessToken).toBeUndefined();
  });
});
