/**
 * Limitador real + verificador (WU-4b, I1/I6/T12). No trunca: usa un usuario con sufijo
 * aleatorio y borra solo su clave.
 */
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { Result } from '../../../shared/domain/result';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { SecretoTotpIndescifrableError } from '../../domain/errors/tfa.errors';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { ITotpService } from '../../domain/ports/totp-service.port';
import { PrismaLimitadorIntentos } from '../../infrastructure/tfa/prisma-limitador-intentos';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';
import { VerificadorCodigoTfa } from './verificador-codigo-tfa';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const USUARIO = `u-${randomBytes(4).toString('hex')}`;
const CLAVE = `cod:${USUARIO}`;

usarLockMasterTest();

describe('VerificadorCodigoTfa con el limitador real', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let verificador: VerificadorCodigoTfa;
  let indescifrable = false;

  const fallos = async (): Promise<number | null> => {
    const r = await pool.query('SELECT fallos FROM auth_intentos_fallidos WHERE clave = $1', [
      CLAVE,
    ]);
    return r.rows[0]?.fallos ?? null;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const repo = {
      obtener: async () => ({
        secretoCifrado: 'x',
        confirmadoAt: new Date(),
        ultimoPaso: 0,
        secretoPendienteCifrado: null,
        pendienteCreadoAt: null,
      }),
    } as unknown as ITfaRepository;
    const secretos = {
      descifrar: () =>
        indescifrable ? Result.fail(new SecretoTotpIndescifrableError()) : Result.ok('S'),
    } as unknown as SecretoTotpCifrado;
    verificador = new VerificadorCodigoTfa(
      repo,
      { verificar: () => null } as unknown as ITotpService,
      new PrismaLimitadorIntentos(prismaService),
      {} as unknown as IHashProvider,
      secretos,
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave = $1', [CLAVE]);
    await pool.end();
    await prismaService.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('3 fallos y un intento con secreto indescifrable dejan fallos = 3 (T12, I1, I6)', async () => {
    for (let i = 0; i < 3; i++) await verificador.verificar(USUARIO, '123456');
    expect(await fallos()).toBe(3);
    indescifrable = true;
    const r = await verificador.verificar(USUARIO, '123456');
    expect(r.isFail()).toBe(true);
    expect(await fallos()).toBe(3);
  });
});
