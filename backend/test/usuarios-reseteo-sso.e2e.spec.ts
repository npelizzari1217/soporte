/**
 * usuarios-reseteo-sso.e2e.spec.ts — WU-6 (login-sso, 11.5: SV7, SV8, SC5).
 *
 * `DELETE /usuarios/:id/sso` con guards reales y Postgres real. No trunca `soporte_master_test`:
 * cada fila lleva un sufijo aleatorio y se borra al final (las identidades caen en cascada con
 * `usuarios`). No hay ruta de autoservicio.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../src/shared/shared.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { AuthModule } from '../src/auth/auth.module';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaIdentidadSsoRepository } from '../src/auth/infrastructure/sso/prisma-identidad-sso.repository';
import {
  activarTfaDeTest,
  codigoDeTest,
  reiniciarAntireplay,
} from '../src/auth/test-helpers/tfa-de-test';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../src/testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomUUID().replaceAll('-', '').slice(0, 12);
const PASSWORD = 'E2eSecret!123';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

type Cuerpo = Record<string, any>;

usarLockMasterTest();

describe('DELETE /usuarios/:id/sso: reseteo del vinculo SSO', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prisma: PrismaService;
  let identidades: PrismaIdentidadSsoRepository;
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
    http('DELETE', `/usuarios/${id}/sso`, undefined, token);
  const login = (email: string) => post('/auth/login', { email, password: PASSWORD });

  async function crearUsuario(etiqueta: string, root = false) {
    const u = UsuarioEntity.create({
      email: `resetsso-${etiqueta}-${SUFIJO}@auth.test`,
      nombre: 'Rsso',
      apellido: etiqueta,
      passwordHash: hashPassword,
      activo: true,
      isGlobalAdmin: root,
    });
    await new PrismaUsuarioRepository(prisma).save(u);
    usuarioIds.push(u.id);
    return { id: u.id, email: u.email };
  }

  async function crearCliente(etiqueta: string): Promise<string> {
    const c = ClienteEntity.create({
      nombre: `Rsso ${etiqueta} ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_rsso_${etiqueta}_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(c);
    clienteIds.push(c.id);
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

  /** Usuario con vinculos de Google y Microsoft y una sesion abierta. */
  async function usuarioVinculado(etiqueta: string, clienteId: string) {
    const u = await crearUsuario(etiqueta);
    await miembro(u.id, clienteId);
    const sesion = await login(u.email);
    await identidades.vincular(u.id, 'GOOGLE', `g-${etiqueta}-${SUFIJO}`);
    await identidades.vincular(u.id, 'MICROSOFT', `m-${etiqueta}-${SUFIJO}`);
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
    identidades = new PrismaIdentidadSsoRepository(prisma);
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

  it('SV7/SV8: ROOT resetea a un usuario multicliente; vinculos borrados, sesion revocada y re-vinculo posterior', async () => {
    const a = await crearCliente('r1a');
    const t = await usuarioVinculado('r1', a);
    await miembro(t.id, await crearCliente('r1b'));

    expect((await resetear(await tokenRoot(a), t.id)).status).toBe(204);

    expect(await cuenta('usuarios_identidades_sso', t.id)).toBe(0);
    expect((await post('/auth/refresh', { refreshToken: t.refreshToken })).status).toBe(401);
    expect(await identidades.buscarUsuarioPorSujeto('GOOGLE', `g-r1-${SUFIJO}`)).toBeNull();
    expect(await identidades.vincular(t.id, 'GOOGLE', `g-nuevo-${SUFIJO}`)).toBe('VINCULADO');
  });

  it('SV7: no toca contrasena, 2FA, dispositivos de confianza ni membresias', async () => {
    const a = await crearCliente('r2');
    const t = await usuarioVinculado('r2', a);
    await activarTfaDeTest(prisma, t.id);
    await pool.query(
      `INSERT INTO tfa_dispositivos_confiables (usuario_id, token_hash, expira_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [t.id, `dev-r2-${SUFIJO}`],
    );
    const antes = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [t.id]);

    expect((await resetear(await tokenRoot(a), t.id)).status).toBe(204);

    const despues = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [t.id]);
    expect(despues.rows[0].password_hash).toBe(antes.rows[0].password_hash);
    expect(await cuenta('usuarios_tfa', t.id)).toBe(1);
    expect(await cuenta('membresias', t.id)).toBe(1);
    const vivos = await pool.query(
      'SELECT count(*) FROM tfa_dispositivos_confiables WHERE usuario_id = $1 AND revocado_at IS NULL',
      [t.id],
    );
    expect(Number(vivos.rows[0].count)).toBe(1);
  });

  it('SV8: ROOT sobre ROOT es 204 sin efecto (sin vinculos que borrar)', async () => {
    const a = await crearCliente('r3');
    const otro = await crearUsuario('r3-otro-root', true);
    expect((await resetear(await tokenRoot(a), otro.id)).status).toBe(204);
    expect(await cuenta('usuarios_identidades_sso', otro.id)).toBe(0);
  });

  it('SV8: ADMINISTRADOR resetea a un usuario solo de su cliente, y a si mismo', async () => {
    const a = await crearCliente('r4');
    const t = await usuarioVinculado('r4', a);
    const admin = await crearUsuario('r4-admin');
    await miembro(admin.id, a, 'ADMINISTRADOR');
    const token = await tokenDe(admin.email);

    expect((await resetear(token, t.id)).status).toBe(204);
    expect(await cuenta('usuarios_identidades_sso', t.id)).toBe(0);
    expect((await resetear(token, admin.id)).status).toBe(204);
  });

  it('SV8: multicliente, membresia inactiva en otro cliente, destino ROOT, otro cliente e inexistente dan el MISMO 404', async () => {
    const a = await crearCliente('r5a');
    const b = await crearCliente('r5b');
    const admin = await crearUsuario('r5-admin');
    await miembro(admin.id, a, 'ADMINISTRADOR');
    const token = await tokenDe(admin.email);

    const multicliente = await usuarioVinculado('r5-multi', a);
    await miembro(multicliente.id, b);
    const conInactiva = await usuarioVinculado('r5-inactiva', a);
    await miembro(conInactiva.id, b, 'TECNICO', false);
    const root = await crearUsuario('r5-root', true);
    await miembro(root.id, a);
    await identidades.vincular(root.id, 'GOOGLE', `g-r5-root-${SUFIJO}`);
    const ajeno = await usuarioVinculado('r5-ajeno', b);

    const ids = [multicliente.id, conInactiva.id, root.id, ajeno.id];
    const respuestas = [];
    for (const id of [...ids, '00000000-0000-4000-8000-000000000000'])
      respuestas.push(await resetear(token, id));

    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual(respuestas[4].body);
    }
    for (const id of ids) expect(await cuenta('usuarios_identidades_sso', id)).toBeGreaterThan(0);
    expect((await post('/auth/refresh', { refreshToken: multicliente.refreshToken })).status).toBe(
      200,
    );
  });

  it('SC5: un TECNICO no puede resetear a otro ni a si mismo (403) y no hay ruta de autoservicio', async () => {
    const a = await crearCliente('r6');
    const t = await usuarioVinculado('r6', a);
    const token = await tokenDe(t.email);

    expect((await resetear(token, t.id)).status).toBe(403);
    expect(await cuenta('usuarios_identidades_sso', t.id)).toBe(2);
    for (const ruta of ['/auth/sso/vinculo', '/usuarios/me/sso', '/usuarios/yo/sso'])
      expect([401, 403, 404]).toContain((await http('DELETE', ruta, undefined, token)).status);
    expect(await cuenta('usuarios_identidades_sso', t.id)).toBe(2);
  });
});
