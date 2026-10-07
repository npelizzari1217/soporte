/**
 * dispositivo-confiable.e2e.spec.ts — WU-6a (sdd/verificacion-dos-pasos, D1, D3, D6, T8).
 * Guards reales y Postgres real. No trunca: usuario y cliente con sufijo aleatorio.
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

usarLockMasterTest();

describe('Dispositivo confiable (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prisma: PrismaService;
  let emailKeyOriginal: string | undefined;
  let usuarioId: string;
  let clienteId: string;
  let email: string;

  const post = async (ruta: string, body: object, token?: string) => {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as Record<string, any>,
    };
  };

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
    reiniciarAntireplay();

    email = `disp-e2e-${SUFIJO}@auth.test`;
    const u = UsuarioEntity.create({
      email,
      nombre: 'D',
      apellido: 'E2e',
      passwordHash: await new Argon2HashProvider().hash(PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prisma).save(u);
    usuarioId = u.id;
    const c = ClienteEntity.create({
      nombre: `Disp ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_disp_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(c);
    clienteId = c.id;
    const master = prisma.getMasterClient();
    const rol =
      (await master.role.findFirst({ where: { codigo: 'TECNICO' } })) ??
      (await master.role.create({ data: { codigo: 'TECNICO', nombre: 'TECNICO' } }));
    await master.membresia.create({ data: { usuarioId, clienteId, rolId: rol.id, activo: true } });
    await activarTfaDeTest(prisma, usuarioId);
  }, 60_000);

  afterAll(async () => {
    await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave LIKE $1', [`%${usuarioId}%`]);
    await pool.query('DELETE FROM auth_desafios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM membresias WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
    await pool.query('DELETE FROM clientes WHERE id = $1', [clienteId]);
    await pool.end();
    await prisma.onModuleDestroy();
    await app?.close();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 30_000);

  it('verificar con recordar emite el token; el login siguiente lo usa', async () => {
    const primero = await post('/auth/login', { email, password: PASSWORD });
    const v = await post('/auth/2fa/verificar', {
      desafio: primero.body.desafio,
      codigo: codigoDeTest(usuarioId),
      recordar: true,
    });
    const dispositivo = String(v.body.dispositivoConfiable);
    expect(dispositivo).toMatch(/^[0-9a-f]{64}$/);

    // D3: el token omite el desafio pero no la contrasena.
    const conToken = await post('/auth/login', {
      email,
      password: PASSWORD,
      dispositivoConfiable: dispositivo,
    });
    expect(conToken.status).toBe(200);
    expect(conToken.body.accessToken).toEqual(expect.any(String));
    const malaClave = await post('/auth/login', {
      email,
      password: 'otra',
      dispositivoConfiable: dispositivo,
    });
    expect(malaClave.status).toBe(401);
    const otroToken = await post('/auth/login', {
      email,
      password: PASSWORD,
      dispositivoConfiable: 'f'.repeat(64),
    });
    expect(otroToken.body.needs2fa).toBe(true);

    // T8, D6: desactivar con un codigo valido borra el 2FA y revoca el dispositivo.
    const desactivar = await post(
      '/auth/2fa/desactivar',
      { codigo: codigoDeTest(usuarioId) },
      conToken.body.accessToken,
    );
    expect(desactivar.status).toBe(204);
    const { rows } = await pool.query(
      'SELECT revocado_at FROM tfa_dispositivos_confiables WHERE usuario_id = $1',
      [usuarioId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].revocado_at).not.toBeNull();
    const sinTfa = await pool.query('SELECT 1 FROM usuarios_tfa WHERE usuario_id = $1', [
      usuarioId,
    ]);
    expect(sinTfa.rowCount).toBe(0);
  });
});
