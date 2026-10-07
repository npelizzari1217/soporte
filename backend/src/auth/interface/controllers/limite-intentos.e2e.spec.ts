/**
 * limite-intentos.e2e.spec.ts — WU-3 (sdd/verificacion-dos-pasos, I1, I5, I8).
 *
 * Login real por HTTP contra `soporte_master_test`. Usa un email aleatorio (`randomBytes`) y su
 * propia `x-soporte-ip-navegador`, asi que su clave del limitador no se cruza con la de ningun
 * otro spec. No trunca: borra solo su usuario y su fila del limitador.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../auth.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const PASSWORD = 'LimiteE2e!123';
const SUFIJO = randomBytes(4).toString('hex');
const EMAIL = `limite-${SUFIJO}@auth.test`;
const IP = `198.51.100.${(parseInt(SUFIJO.slice(0, 2), 16) % 250) + 1}`;

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

usarLockMasterTest();

describe('Login: bloqueo por intentos fallidos (I1, I5, I8)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let usuarioId: string;

  async function levantar(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }

  async function login(password: string) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-soporte-ip-navegador': IP },
      body: JSON.stringify({ email: EMAIL, password }),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;
    await levantar();
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    const usuario = UsuarioEntity.create({
      email: EMAIL,
      nombre: 'Limite',
      apellido: 'E2e',
      passwordHash: await new Argon2HashProvider().hash(PASSWORD),
      activo: true,
      isGlobalAdmin: true,
    });
    await new PrismaUsuarioRepository(prismaService).save(usuario);
    usuarioId = usuario.id;
  }, 60_000);

  afterAll(async () => {
    await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave LIKE $1', [`%:${IP}`]);
    await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
  }, 30_000);

  it('5 contrasenas incorrectas bloquean: la sexta, con la correcta, da el mismo 401 generico', async () => {
    const invalida = await login('incorrecta');
    for (let i = 0; i < 4; i += 1) expect((await login('incorrecta')).status).toBe(401);

    const bloqueada = await login(PASSWORD);

    expect(bloqueada.status).toBe(401);
    expect(bloqueada.body).toEqual(invalida.body);
  });

  it('el bloqueo sobrevive a reconstruir el modulo (reinicio simulado)', async () => {
    await app.close();
    await levantar();

    expect((await login(PASSWORD)).status).toBe(401);
  });

  it('un exito reinicia el contador (la fila desaparece)', async () => {
    await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave LIKE $1', [`%:${IP}`]);

    expect((await login(PASSWORD)).status).toBe(200);
    const r = await pool.query('SELECT 1 FROM auth_intentos_fallidos WHERE clave LIKE $1', [
      `%:${IP}`,
    ]);
    expect(r.rowCount).toBe(0);
  });
});
