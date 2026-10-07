/**
 * tfa-cuenta.e2e.spec.ts — WU-4c (sdd/verificacion-dos-pasos, T6, T7, T9).
 *
 * Autogestion de 2FA por HTTP con guards reales contra `soporte_master_test`. Usa usuarios con
 * sufijo aleatorio y borra solo los suyos (no trunca). Los JWT se firman con `TOKEN_SERVICE`.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../auth.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import {
  ITokenService,
  TOKEN_SERVICE,
  VERSION_PAYLOAD_JWT,
} from '../../domain/ports/i-token.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

/** TOTP RFC 6238 (SHA-1, 6 digitos, 30 s) del paso indicado, calculado con el secreto manual. */
function codigoTotp(secreto: string, paso: number): string {
  const bits = [...secreto].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('');
  const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', clave).update(contador).digest();
  const n = h.readUInt32BE(h[h.length - 1] & 0x0f) & 0x7fffffff;
  return String(n % 1_000_000).padStart(6, '0');
}
const pasoActual = (): number => Math.floor(Date.now() / 30_000);

usarLockMasterTest();

describe('Autogestion de 2FA (guards reales)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let emailKeyOriginal: string | undefined;
  const usuarios: { id: string; token: string }[] = [];

  async function crearUsuario(rol: string, isGlobalAdmin: boolean) {
    const u = UsuarioEntity.create({
      email: `tfa-${rol}-${SUFIJO}@auth.test`,
      nombre: 'Tfa',
      apellido: rol,
      passwordHash: 'x',
      activo: true,
      isGlobalAdmin,
    });
    await new PrismaUsuarioRepository(prismaService).save(u);
    const token = app.get<ITokenService>(TOKEN_SERVICE).signJwt({
      v: VERSION_PAYLOAD_JWT,
      sub: u.id,
      cliente_id: null,
      rol: null,
      permisos: [],
      is_global_admin: isGlobalAdmin,
      cliente_nombre: null,
      membresias: [],
      modulos: [],
      nombre: 'Tfa',
      apellido: rol,
      cliente_logo_v: null,
    });
    usuarios.push({ id: u.id, token });
    return { id: u.id, token };
  }

  async function llamar(token: string | null, metodo: 'GET' | 'POST', ruta: string, body?: object) {
    const res = await fetch(`${baseUrl}/auth/2fa${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json: Record<string, unknown> | null = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  /** Inicia y confirma con el codigo del paso actual; devuelve el secreto y los 10 codigos. */
  async function activar(token: string) {
    const inicio = await llamar(token, 'POST', '/secreto/iniciar', {});
    const secreto = String(inicio.body?.claveManual);
    const fin = await llamar(token, 'POST', '/secreto/confirmar', {
      codigo: codigoTotp(secreto, pasoActual()),
    });
    const codigos = fin.body?.codigosRecuperacion;
    return { secreto, codigos: Array.isArray(codigos) ? codigos.map(String) : [] };
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
    prismaService = new PrismaService(URL_MASTER);
  }, 60_000);

  afterAll(async () => {
    for (const u of usuarios) {
      await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave = $1', [`cod:${u.id}`]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [u.id]);
    }
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 30_000);

  it('sin JWT, todas las rutas responden 401', async () => {
    expect((await llamar(null, 'GET', '')).status).toBe(401);
    expect((await llamar(null, 'POST', '/codigos', { codigo: '123456' })).status).toBe(401);
  });

  it('ROOT y usuario normal activan su 2FA por separado y no ven el del otro (T6, T7)', async () => {
    const root = await crearUsuario('root', true);
    const normal = await crearUsuario('normal', false);

    expect((await llamar(root.token, 'GET', '')).body).toMatchObject({
      activo: false,
      obligado: true,
    });
    const activado = await activar(root.token);

    expect(activado.codigos).toHaveLength(10);
    const propio = await llamar(root.token, 'GET', '');
    expect(propio.body).toEqual({
      activo: true,
      obligado: true,
      codigosRestantes: 10,
      pendiente: false,
    });
    expect(JSON.stringify(propio.body)).not.toContain(activado.secreto);
    expect((await llamar(normal.token, 'GET', '')).body).toEqual({
      activo: false,
      obligado: false,
      codigosRestantes: 0,
      pendiente: false,
    });
    expect((await activar(normal.token)).codigos).toHaveLength(10);
  });

  it('regenerar invalida el juego anterior y un codigo invalido responde 422 (T9)', async () => {
    const usuario = await crearUsuario('regen', false);
    const { secreto, codigos } = await activar(usuario.token);

    expect((await llamar(usuario.token, 'POST', '/codigos', { codigo: '000000' })).status).toBe(
      422,
    );
    const nuevo = await llamar(usuario.token, 'POST', '/codigos', {
      codigo: codigoTotp(secreto, pasoActual() + 1),
    });
    expect(nuevo.status).toBe(200);
    expect(nuevo.body?.codigosRecuperacion).toHaveLength(10);

    const conViejo = await llamar(usuario.token, 'POST', '/codigos', {
      codigo: codigos[0] ?? '',
    });
    expect(conViejo.status).toBe(422);
  });
});
