/**
 * tfa-login.e2e.spec.ts — WU-5b (sdd/verificacion-dos-pasos, L2, L5, L7, L8).
 *
 * Rutas publicas del segundo paso por HTTP, con desafios sembrados por el repositorio (el login
 * aun no los emite: WU-5c). No trunca `soporte_master_test`: filas con sufijo aleatorio, borradas
 * al final.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { AuthModule } from '../../auth.module';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from '../../domain/ports/desafio-login-repository.port';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

/** TOTP RFC 6238 (SHA-1, 6 digitos, 30 s) del secreto manual en base32. */
function codigoTotp(secreto: string): string {
  const bits = [...secreto].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('');
  const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', clave).update(contador).digest();
  return String((h.readUInt32BE(h[h.length - 1] & 0x0f) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

usarLockMasterTest();

describe('Segundo paso del login: rutas publicas', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let desafios: IDesafioLoginRepository;
  let emailKeyOriginal: string | undefined;
  const usuarioIds: string[] = [];
  const clienteIds: string[] = [];

  async function post(ruta: string, body: object) {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as Record<string, any>,
    };
  }

  async function crearUsuario(etiqueta: string): Promise<string> {
    const u = UsuarioEntity.create({
      email: `tfalogin-${etiqueta}-${SUFIJO}@auth.test`,
      nombre: 'Tfa',
      apellido: etiqueta,
      passwordHash: 'x',
      activo: true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prismaService).save(u);
    usuarioIds.push(u.id);
    return u.id;
  }

  async function membresia(usuarioId: string, etiqueta: string): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `Tfa ${etiqueta} ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_tfalogin_${etiqueta}_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);
    clienteIds.push(cliente.id);
    const master = prismaService.getMasterClient();
    const rol =
      (await master.role.findFirst({ where: { codigo: 'TECNICO' } })) ??
      (await master.role.create({ data: { codigo: 'TECNICO', nombre: 'TECNICO' } }));
    await master.membresia.create({
      data: { usuarioId, clienteId: cliente.id, rolId: rol.id, activo: true },
    });
    return cliente.id;
  }

  /** Enrola por HTTP con un desafio ENROLAR sembrado; devuelve ticket y codigos de recuperacion. */
  async function enrolar(usuarioId: string) {
    const desafio = await desafios.crear(usuarioId, 'ENROLAR');
    const inicio = await post('/auth/2fa/enrolamiento/iniciar', { desafio });
    const fin = await post('/auth/2fa/enrolamiento/confirmar', {
      desafio,
      codigo: codigoTotp(String(inicio.body.claveManual)),
    });
    return { desafio, fin };
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
    desafios = app.get<IDesafioLoginRepository>(DESAFIO_LOGIN_REPOSITORY);
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
  }, 60_000);

  afterAll(async () => {
    for (const id of usuarioIds) {
      await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave = $1', [`cod:${id}`]);
      await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM membresias WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    if (clienteIds.length)
      await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clienteIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 30_000);

  it('enrolar -> continuar -> sesion; el ticket no se reutiliza y el refresh no pide codigo (L2, L5, L8)', async () => {
    const usuarioId = await crearUsuario('enrolar');
    await membresia(usuarioId, 'enrolar');
    const desafio = await desafios.crear(usuarioId, 'ENROLAR');

    // L5: un ENROLAR sin verificar no es un ticket.
    expect((await post('/auth/login/continuar', { ticket: desafio })).status).toBe(401);

    const { fin } = await enrolar(usuarioId);
    expect(fin.status).toBe(200);
    expect(fin.body.codigosRecuperacion).toHaveLength(10);

    const sesion = await post('/auth/login/continuar', { ticket: fin.body.ticket });
    expect(sesion.status).toBe(200);
    expect(sesion.body.accessToken).toEqual(expect.any(String));
    expect((await post('/auth/login/continuar', { ticket: fin.body.ticket })).status).toBe(401);

    const refresh = await post('/auth/refresh', { refreshToken: sesion.body.refreshToken });
    expect(refresh.status).toBe(200);
  });

  it('verificar con codigo de recuperacion -> selector con ticket -> seleccionar sin reenviar nada (L7)', async () => {
    const usuarioId = await crearUsuario('selector');
    const clienteA = await membresia(usuarioId, 'sela');
    await membresia(usuarioId, 'selb');
    const { fin } = await enrolar(usuarioId);
    const recuperacion: string = fin.body.codigosRecuperacion[0];

    const desafio = await desafios.crear(usuarioId, 'VERIFICAR');
    const verificado = await post('/auth/2fa/verificar', { desafio, codigo: recuperacion });
    expect(verificado.status).toBe(200);
    // El desafio original ya no sirve (L2).
    expect((await post('/auth/2fa/verificar', { desafio, codigo: recuperacion })).status).toBe(401);

    const selector = await post('/auth/login/continuar', { ticket: verificado.body.ticket });
    expect(selector.body.needsClienteSelection).toBe(true);
    expect(selector.body.membresias).toHaveLength(2);
    expect(selector.body.ticket).toBe(verificado.body.ticket);

    // Cliente ajeno: 401 y el ticket sigue vivo.
    expect(
      (
        await post('/auth/login/seleccionar', {
          ticket: selector.body.ticket,
          clienteId: randomUUID(),
        })
      ).status,
    ).toBe(401);
    const elegido = await post('/auth/login/seleccionar', {
      ticket: selector.body.ticket,
      clienteId: clienteA,
    });
    expect(elegido.status).toBe(200);
    expect(elegido.body.accessToken).toEqual(expect.any(String));
    expect(
      (await post('/auth/login/seleccionar', { ticket: selector.body.ticket, clienteId: clienteA }))
        .status,
    ).toBe(401);
  });
});
