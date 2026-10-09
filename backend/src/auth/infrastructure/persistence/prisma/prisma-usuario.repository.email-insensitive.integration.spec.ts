/**
 * findManyByEmailInsensitive sobre `soporte_master_test` (WU-1b, ADR-5). No trunca: usa un
 * prefijo aleatorio por corrida y borra solo sus filas.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  URL_MASTER_TEST_POR_DEFECTO,
  usarLockMasterTest,
} from '../../../../testing/lock-master-test';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaUsuarioRepository.findManyByEmailInsensitive', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaUsuarioRepository;
  const ids: string[] = [];
  const marca = randomBytes(6).toString('hex');

  const crear = async (email: string): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
       VALUES ($1, $2, 'Test', 'Email', 'hash', now())`,
      [id, email],
    );
    ids.push(id);
    return id;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaUsuarioRepository(prismaService);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [ids]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('una variante de mayusculas encuentra la fila y la mapea a la entidad', async () => {
    const id = await crear(`Ana.${marca}@Test.local`);
    const r = await repo.findManyByEmailInsensitive(`ANA.${marca}@test.LOCAL`);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(id);
    expect(r[0].email).toBe(`Ana.${marca}@Test.local`);
    expect(r[0].activo).toBe(true);
    expect(r[0].isGlobalAdmin).toBe(false);
  });

  it('el guion bajo no es comodin', async () => {
    await crear(`juanXperez.${marca}@x.com`);
    expect(await repo.findManyByEmailInsensitive(`juan_perez.${marca}@x.com`)).toEqual([]);
    const id = await crear(`juan_perez.${marca}@x.com`);
    const r = await repo.findManyByEmailInsensitive(`juan_perez.${marca}@x.com`);
    expect(r.map((u) => u.id)).toEqual([id]);
  });

  it('LIMIT 2: con tres variantes devuelve dos', async () => {
    for (const e of [`tri.${marca}@x.com`, `Tri.${marca}@x.com`, `TRI.${marca}@x.com`]) {
      await crear(e);
    }
    expect(await repo.findManyByEmailInsensitive(`tri.${marca}@x.com`)).toHaveLength(2);
  });

  it('sin coincidencias devuelve []', async () => {
    expect(await repo.findManyByEmailInsensitive(`nadie.${marca}@x.com`)).toEqual([]);
  });

  it('findByEmail sigue exacto: la variante de mayusculas no encuentra', async () => {
    await crear(`Exacto.${marca}@x.com`);
    expect(await repo.findByEmail(`Exacto.${marca}@x.com`)).not.toBeNull();
    expect(await repo.findByEmail(`exacto.${marca}@x.com`)).toBeNull();
  });
});
