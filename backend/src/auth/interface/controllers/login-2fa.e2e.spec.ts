/**
 * login-2fa.e2e.spec.ts — WU-5c2 (sdd/verificacion-dos-pasos, 5c.7: L1-L9, L11, C3, T12, K4).
 *
 * Flujo completo del login con guards reales y Postgres real. No trunca `soporte_master_test`:
 * cada usuario y cliente lleva un sufijo aleatorio y se borra al final. Cada usuario con 2FA
 * gasta pocos codigos (el antireplay admite dos por usuario en 30 s).
 */
import { createHmac, randomBytes } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { AesGcmSecretCipher } from '../../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { AuthModule } from '../../auth.module';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { SecretoTotpCifrado } from '../../application/tfa/secreto-totp-cifrado';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import {
  SECRETO_TOTP_DE_TEST,
  activarTfaDeTest,
  codigoDeTest,
  reiniciarAntireplay,
} from '../../test-helpers/tfa-de-test';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const PASSWORD = 'E2eSecret!123';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

type Cuerpo = Record<string, any>;

/** TOTP RFC 6238 del secreto base32 que devuelve el enrolamiento. */
function codigoTotp(secreto: string): string {
  const bits = [...secreto].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('');
  const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', clave).update(contador).digest();
  return String((h.readUInt32BE(h[h.length - 1] & 0x0f) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

usarLockMasterTest();

describe('Login con segundo paso: flujo completo', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prisma: PrismaService;
  let hashPassword: string;
  let emailKeyOriginal: string | undefined;
  const usuarioIds: string[] = [];
  const clienteIds: string[] = [];

  async function http(metodo: 'POST', ruta: string, body: object, token?: string) {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as Cuerpo };
  }
  const post = (ruta: string, body: object, token?: string) => http('POST', ruta, body, token);

  async function crearUsuario(etiqueta: string, root = false) {
    const u = UsuarioEntity.create({
      email: `login2fa-${etiqueta}-${SUFIJO}@auth.test`,
      nombre: 'L2fa',
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
      nombre: `L2fa ${etiqueta} ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_l2fa_${etiqueta}_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(c);
    clienteIds.push(c.id);
    // `requiere_2fa` no lo expone la entidad: se fija directo en la base de test.
    if (requiere2fa)
      await pool.query('UPDATE clientes SET requiere_2fa = true WHERE id = $1', [c.id]);
    return c.id;
  }

  async function miembro(usuarioId: string, clienteId: string) {
    const master = prisma.getMasterClient();
    const rol =
      (await master.role.findFirst({ where: { codigo: 'TECNICO' } })) ??
      (await master.role.create({ data: { codigo: 'TECNICO', nombre: 'TECNICO' } }));
    await master.membresia.create({ data: { usuarioId, clienteId, rolId: rol.id, activo: true } });
  }

  const login = (email: string) => post('/auth/login', { email, password: PASSWORD });
  const verificar = (desafio: string, usuarioId: string) =>
    post('/auth/2fa/verificar', { desafio, codigo: codigoDeTest(usuarioId) });

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
      await pool.query('DELETE FROM auth_desafios WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM tfa_codigos_recuperacion WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuarios_tfa WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM membresias WHERE usuario_id = $1', [id]);
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

  it('sin 2FA y un cliente: tokens directos (L1)', async () => {
    const u = await crearUsuario('sin1');
    await miembro(u.id, await crearCliente('sin1'));
    const r = await login(u.email);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toEqual(expect.any(String));
    expect(r.body.needs2fa).toBeUndefined();
  });

  it('sin 2FA y dos clientes: selector con ticket y seleccion sin reenviar la contrasena (L7)', async () => {
    const u = await crearUsuario('sin2');
    const a = await crearCliente('sin2a');
    await miembro(u.id, a);
    await miembro(u.id, await crearCliente('sin2b'));
    const r = await login(u.email);
    expect(r.body.needsClienteSelection).toBe(true);
    expect(r.body.accessToken).toBeUndefined();
    const s = await post('/auth/login/seleccionar', { ticket: r.body.ticket, clienteId: a });
    expect(s.status).toBe(200);
    expect(s.body.accessToken).toEqual(expect.any(String));
  });

  it('con 2FA y un cliente: desafio sin tokens, verificar, continuar; el desafio no se reusa; refresh sin codigo (L1, L2, L8, L9)', async () => {
    const u = await crearUsuario('tfa1');
    await miembro(u.id, await crearCliente('tfa1'));
    await activarTfaDeTest(prisma, u.id);
    const r = await login(u.email);
    expect(r.body.needs2fa).toBe(true);
    expect(r.body.accessToken).toBeUndefined();

    const v = await verificar(r.body.desafio, u.id);
    expect(v.status).toBe(200);
    // L2: la cadena del desafio ya no sirve, ni para verificar ni como ticket.
    expect(
      (await post('/auth/2fa/verificar', { desafio: r.body.desafio, codigo: codigoDeTest(u.id) }))
        .status,
    ).toBe(401);
    expect((await post('/auth/login/continuar', { ticket: r.body.desafio })).status).toBe(401);

    const c = await post('/auth/login/continuar', { ticket: v.body.ticket });
    expect(c.status).toBe(200);
    const refresh = await post('/auth/refresh', { refreshToken: c.body.refreshToken });
    expect(refresh.status).toBe(200);
    // L9: el refresh token robado sigue valido sin segundo factor (consecuencia declarada).
    const otra = await post('/auth/refresh', { refreshToken: refresh.body.refreshToken });
    expect(otra.status).toBe(200);
  });

  it('con 2FA y dos clientes: selector tras el codigo y cambio de cliente sin codigo (L1, L7, L8)', async () => {
    const u = await crearUsuario('tfa2');
    const a = await crearCliente('tfa2a');
    const b = await crearCliente('tfa2b');
    await miembro(u.id, a);
    await miembro(u.id, b);
    await activarTfaDeTest(prisma, u.id);
    const r = await login(u.email);
    expect(r.body.needs2fa).toBe(true);
    const v = await verificar(r.body.desafio, u.id);
    const selector = await post('/auth/login/continuar', { ticket: v.body.ticket });
    expect(selector.body.needsClienteSelection).toBe(true);
    expect(selector.body.accessToken).toBeUndefined();
    const s = await post('/auth/login/seleccionar', { ticket: selector.body.ticket, clienteId: a });
    expect(s.status).toBe(200);

    const cambio = await post('/auth/switch', { clienteId: b }, s.body.accessToken);
    expect(cambio.status).toBe(200);
    expect(cambio.body.accessToken).toEqual(expect.any(String));
  });

  it('ENROLAR no abre sesion ni selector hasta confirmar el enrolamiento (L5)', async () => {
    const u = await crearUsuario('enrolar');
    const a = await crearCliente('enrolara');
    await miembro(u.id, a);
    await miembro(u.id, await crearCliente('enrolarb', true));
    const r = await login(u.email);
    expect(r.body.needsEnrolamiento2fa).toBe(true);
    expect(r.body.accessToken).toBeUndefined();
    expect((await post('/auth/login/continuar', { ticket: r.body.desafio })).status).toBe(401);
    expect(
      (await post('/auth/login/seleccionar', { ticket: r.body.desafio, clienteId: a })).status,
    ).toBe(401);

    const inicio = await post('/auth/2fa/enrolamiento/iniciar', { desafio: r.body.desafio });
    const fin = await post('/auth/2fa/enrolamiento/confirmar', {
      desafio: r.body.desafio,
      codigo: codigoTotp(String(inicio.body.claveManual)),
    });
    expect(fin.status).toBe(200);
    expect(fin.body.codigosRecuperacion).toHaveLength(10);
    const selector = await post('/auth/login/continuar', { ticket: fin.body.ticket });
    expect(selector.body.needsClienteSelection).toBe(true);
  });

  it('C3: un cliente que exige 2FA obliga al usuario aunque entre al otro (some, no every)', async () => {
    const u = await crearUsuario('c3');
    await miembro(u.id, await crearCliente('c3libre'));
    await miembro(u.id, await crearCliente('c3exige', true));
    const r = await login(u.email);
    expect(r.status).toBe(200);
    expect(r.body.needsEnrolamiento2fa).toBe(true);
    expect(r.body.accessToken).toBeUndefined();
    expect(r.body.needsClienteSelection).toBeUndefined();
  });

  it('secreto cifrado con el AAD de otro usuario: 401 sin 500 ni sesion (L11, T12)', async () => {
    const u = await crearUsuario('aad');
    const otro = await crearUsuario('aadotro');
    await miembro(u.id, await crearCliente('aad'));
    await activarTfaDeTest(prisma, u.id);
    const ajeno = new SecretoTotpCifrado(new AesGcmSecretCipher()).cifrar(
      otro.id,
      SECRETO_TOTP_DE_TEST,
    );
    await pool.query('UPDATE usuarios_tfa SET secreto_cifrado = $1 WHERE usuario_id = $2', [
      ajeno,
      u.id,
    ]);
    const r = await login(u.email);
    expect(r.body.needs2fa).toBe(true);
    const v = await post('/auth/2fa/verificar', {
      desafio: r.body.desafio,
      codigo: codigoDeTest(u.id),
    });
    expect(v.status).toBe(401);
    expect(v.body.ticket).toBeUndefined();
    expect(v.body.accessToken).toBeUndefined();
  });

  it('ROOT: el refresh token del login master persiste cliente_id NULL (L3)', async () => {
    const u = await crearUsuario('root', true);
    await activarTfaDeTest(prisma, u.id);
    const r = await login(u.email);
    expect(r.body.needs2fa).toBe(true);
    const v = await verificar(r.body.desafio, u.id);
    const c = await post('/auth/login/continuar', { ticket: v.body.ticket });
    expect(c.status).toBe(200);
    const filas = await pool.query('SELECT cliente_id FROM refresh_tokens WHERE usuario_id = $1', [
      u.id,
    ]);
    expect(filas.rows).toHaveLength(1);
    expect(filas.rows[0].cliente_id).toBeNull();
  });
});
