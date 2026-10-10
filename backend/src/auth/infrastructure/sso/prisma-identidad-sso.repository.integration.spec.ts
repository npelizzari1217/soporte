/**
 * Repositorio de vinculos SSO sobre `soporte_master_test` (WU-1b, ADR-4). No trunca: crea
 * usuarios propios con email aleatorio y los borra al final (la cascada limpia los vinculos).
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { PrismaIdentidadSsoRepository } from './prisma-identidad-sso.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaIdentidadSsoRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaIdentidadSsoRepository;
  const usuarios: string[] = [];

  const sujeto = (): string => `sub-${randomBytes(8).toString('hex')}`;
  const crearUsuario = async (): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
       VALUES ($1, $2, 'Test', 'Sso', 'hash', now())`,
      [id, `sso-${id}@test.local`],
    );
    usuarios.push(id);
    return id;
  };
  const vinculosDe = async (usuarioId: string): Promise<number> =>
    (await pool.query('SELECT 1 FROM usuarios_identidades_sso WHERE usuario_id = $1', [usuarioId]))
      .rowCount ?? 0;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaIdentidadSsoRepository(prismaService);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [usuarios]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('buscarUsuarioPorSujeto sin fila devuelve null', async () => {
    expect(await repo.buscarUsuarioPorSujeto('GOOGLE', sujeto())).toBeNull();
  });

  it('vincular crea el vinculo y es idempotente para el mismo sujeto', async () => {
    const u = await crearUsuario();
    const s = sujeto();
    expect(await repo.vincular(u, 'GOOGLE', s)).toBe('VINCULADO');
    expect(await repo.vincular(u, 'GOOGLE', s)).toBe('VINCULADO');
    expect(await repo.buscarUsuarioPorSujeto('GOOGLE', s)).toBe(u);
    expect(await vinculosDe(u)).toBe(1);
  });

  it('otro sujeto del mismo proveedor para el mismo usuario devuelve OTRA_CUENTA', async () => {
    const u = await crearUsuario();
    const s = sujeto();
    await repo.vincular(u, 'GOOGLE', s);
    expect(await repo.vincular(u, 'GOOGLE', sujeto())).toBe('OTRA_CUENTA');
    expect(await repo.buscarUsuarioPorSujeto('GOOGLE', s)).toBe(u);
  });

  it('el mismo sujeto de otro usuario devuelve OTRA_CUENTA y no cambia el dueno', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    const s = sujeto();
    await repo.vincular(a, 'MICROSOFT', s);
    expect(await repo.vincular(b, 'MICROSOFT', s)).toBe('OTRA_CUENTA');
    expect(await repo.buscarUsuarioPorSujeto('MICROSOFT', s)).toBe(a);
    expect(await vinculosDe(b)).toBe(0);
  });

  it('el mismo sujeto en proveedores distintos no colisiona', async () => {
    const u = await crearUsuario();
    const s = sujeto();
    expect(await repo.vincular(u, 'GOOGLE', s)).toBe('VINCULADO');
    expect(await repo.vincular(u, 'MICROSOFT', s)).toBe('VINCULADO');
  });

  it('dos vincular concurrentes del mismo sujeto a usuarios distintos dejan un solo ganador', async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    const s = sujeto();
    const resultados = await Promise.all([
      repo.vincular(a, 'GOOGLE', s),
      repo.vincular(b, 'GOOGLE', s),
    ]);
    expect([...resultados].sort()).toEqual(['OTRA_CUENTA', 'VINCULADO']);
    expect((await vinculosDe(a)) + (await vinculosDe(b))).toBe(1);
  });

  it('borrar el usuario borra sus vinculos (cascada)', async () => {
    const u = await crearUsuario();
    const s = sujeto();
    await repo.vincular(u, 'GOOGLE', s);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [u]);
    expect(await repo.buscarUsuarioPorSujeto('GOOGLE', s)).toBeNull();
  });

  it('eliminarTodasDeUsuario devuelve la cantidad borrada', async () => {
    const u = await crearUsuario();
    await repo.vincular(u, 'GOOGLE', sujeto());
    await repo.vincular(u, 'MICROSOFT', sujeto());
    expect(await repo.eliminarTodasDeUsuario(u)).toBe(2);
    expect(await repo.eliminarTodasDeUsuario(u)).toBe(0);
  });
});
