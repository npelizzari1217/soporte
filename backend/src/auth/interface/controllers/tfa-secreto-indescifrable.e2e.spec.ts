/**
 * tfa-secreto-indescifrable.e2e.spec.ts — WU-9 (sdd/verificacion-dos-pasos, K4, T12).
 *
 * Un secreto TOTP que no descifra (manipulado, cifrado para otro usuario o con otra clave) no
 * rompe el segundo paso: la ruta responde 401, nunca 500, y deja el log TFA_SECRETO_INDESCIFRABLE.
 * No trunca `soporte_master_test`: filas con sufijo aleatorio, borradas al final.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, Logger, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { AesGcmSecretCipher } from '../../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { AuthModule } from '../../auth.module';
import { SecretoTotpCifrado } from '../../application/tfa/secreto-totp-cifrado';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from '../../domain/ports/desafio-login-repository.port';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const SECRETO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule {}

usarLockMasterTest();

describe('Segundo paso con secreto TOTP indescifrable (K4, T12)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let desafios: IDesafioLoginRepository;
  let emailKeyOriginal: string | undefined;
  const usuarioIds: string[] = [];

  async function usuarioConSecreto(
    etiqueta: string,
    secretoCifrado: (usuarioId: string) => string,
  ): Promise<string> {
    const u = UsuarioEntity.create({
      email: `tfaindesc-${etiqueta}-${SUFIJO}@auth.test`,
      nombre: 'Tfa',
      apellido: etiqueta,
      passwordHash: 'x',
      activo: true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prismaService).save(u);
    usuarioIds.push(u.id);
    await prismaService.getMasterClient().usuarioTfa.create({
      data: { usuarioId: u.id, secretoCifrado: secretoCifrado(u.id), confirmadoAt: new Date() },
    });
    return u.id;
  }

  async function verificar(usuarioId: string): Promise<number> {
    const desafio = await desafios.crear(usuarioId, 'VERIFICAR');
    const res = await fetch(`${baseUrl}/auth/2fa/verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desafio, codigo: '123456' }),
    });
    return res.status;
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
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
  }, 30_000);

  afterEach(() => vi.restoreAllMocks());

  const cifrador = () => new SecretoTotpCifrado(new AesGcmSecretCipher());

  it.each([
    ['manipulado', (id: string) => cifrador().cifrar(id, SECRETO).replace(/.$/, 'A#')],
    ['cifrado para otro usuario', () => cifrador().cifrar(`otro-${SUFIJO}`, SECRETO)],
    ['basura', () => 'no-es-un-payload'],
  ])('secreto %s: 401, no 500, y loguea TFA_SECRETO_INDESCIFRABLE', async (etiqueta, cifrar) => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const usuarioId = await usuarioConSecreto(etiqueta.replace(/\W/g, ''), cifrar);

    expect(await verificar(usuarioId)).toBe(401);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TFA_SECRETO_INDESCIFRABLE'));
  });
});
