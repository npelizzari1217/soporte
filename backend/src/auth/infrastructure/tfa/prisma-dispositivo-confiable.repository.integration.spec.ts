/**
 * Repositorio de dispositivos confiables sobre `soporte_master_test` (WU-6a, D2, D3, D7).
 * No trunca: usuarios con sufijo aleatorio, borrados por cascada.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { DISPOSITIVO_CONFIABLE_DURACION_MS } from '../../domain/tfa/tfa.constants';
import { PrismaDispositivoConfiableRepository } from './prisma-dispositivo-confiable.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const sha = (t: string): string => createHash('sha256').update(t).digest('hex');

usarLockMasterTest();

describe('PrismaDispositivoConfiableRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaDispositivoConfiableRepository;
  const usuarioIds: string[] = [];
  const AHORA = new Date('2026-10-07T12:00:00.000Z');
  const enTreintaDias = new Date(AHORA.getTime() + DISPOSITIVO_CONFIABLE_DURACION_MS);

  const crearUsuario = async (): Promise<string> => {
    const u = await prismaService.getMasterClient().usuario.create({
      data: {
        email: `disp-${SUFIJO}-${usuarioIds.length}@test.local`,
        nombre: 'Disp',
        apellido: 'Test',
        passwordHash: 'x',
      },
    });
    usuarioIds.push(u.id);
    return u.id;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaDispositivoConfiableRepository(prismaService);
  });

  afterAll(async () => {
    if (usuarioIds.length)
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('crear guarda solo el hash: el token crudo no esta en ninguna columna (D2)', async () => {
    const u = await crearUsuario();
    await repo.crear(u, sha('crudo-1'), enTreintaDias);
    const { rows } = await pool.query(
      'SELECT * FROM tfa_dispositivos_confiables WHERE usuario_id = $1',
      [u],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(sha('crudo-1'));
    expect(JSON.stringify(rows[0])).not.toContain('crudo-1');
    expect(rows[0].expira_at.getTime()).toBe(AHORA.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  it('esValido: verdadero para el dueno; falso para otro usuario o un hash desconocido (D3)', async () => {
    const u = await crearUsuario();
    const otro = await crearUsuario();
    await repo.crear(u, sha('crudo-2'), enTreintaDias);
    expect(await repo.esValido(u, sha('crudo-2'), AHORA)).toBe(true);
    expect(await repo.esValido(otro, sha('crudo-2'), AHORA)).toBe(false);
    expect(await repo.esValido(u, sha('otro-token'), AHORA)).toBe(false);
  });

  it('esValido: la vigencia es exacta, valido un instante antes y vencido en el limite', async () => {
    const u = await crearUsuario();
    await repo.crear(u, sha('crudo-3'), enTreintaDias);
    expect(await repo.esValido(u, sha('crudo-3'), new Date(enTreintaDias.getTime() - 1))).toBe(
      true,
    );
    expect(await repo.esValido(u, sha('crudo-3'), enTreintaDias)).toBe(false);
  });

  it('revocarTodosDe revoca todos los del usuario y deja los de otro (D7)', async () => {
    const u = await crearUsuario();
    const otro = await crearUsuario();
    await repo.crear(u, sha('a'), enTreintaDias);
    await repo.crear(u, sha('b'), enTreintaDias);
    await repo.crear(otro, sha('c'), enTreintaDias);
    await repo.revocarTodosDe(u);
    expect(await repo.esValido(u, sha('a'), AHORA)).toBe(false);
    expect(await repo.esValido(u, sha('b'), AHORA)).toBe(false);
    expect(await repo.esValido(otro, sha('c'), AHORA)).toBe(true);
  });

  it('revocarTodosDe lanza ante un fallo de la base: fail-closed (D7)', async () => {
    const roto = new PrismaDispositivoConfiableRepository(
      new PrismaService('postgresql://x:y@127.0.0.1:1/nada'),
    );
    await expect(roto.revocarTodosDe('00000000-0000-0000-0000-000000000000')).rejects.toBeDefined();
  });
});
