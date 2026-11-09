/**
 * [INTEGRATION] ROOT activos que reciben los avisos de operación (odd/saturacion-conexiones, S3),
 * sobre `soporte_master_test`. Usa un prefijo aleatorio por corrida y borra solo sus filas.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { PrismaDestinatariosRoot } from './prisma-destinatarios-root';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;

usarLockMasterTest();

describe('PrismaDestinatariosRoot', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  const ids: string[] = [];
  const marca = randomBytes(6).toString('hex');

  const crear = async (
    nombre: string,
    campos: { root: boolean; activo?: boolean; integracion?: boolean; borrado?: boolean },
  ): Promise<string> => {
    const id = randomUUID();
    const email = `${nombre}.${marca}@test.local`;
    await pool.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, is_global_admin, activo,
         es_integracion, deleted_at, updated_at)
       VALUES ($1, $2, 'Test', 'Root', 'hash', $3, $4, $5, $6, now())`,
      [
        id,
        email,
        campos.root,
        campos.activo ?? true,
        campos.integracion ?? false,
        campos.borrado ? new Date() : null,
      ],
    );
    ids.push(id);
    return email;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [ids]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('incluye a los ROOT activos y deja afuera a los inactivos, borrados, de integración y no ROOT', async () => {
    const activo = await crear('root-activo', { root: true });
    const inactivo = await crear('root-inactivo', { root: true, activo: false });
    const borrado = await crear('root-borrado', { root: true, borrado: true });
    const integracion = await crear('root-integracion', { root: true, integracion: true });
    const comun = await crear('comun', { root: false });

    const emails = await new PrismaDestinatariosRoot(prismaService).emailsDeRootActivos();

    expect(emails).toContain(activo);
    for (const excluido of [inactivo, borrado, integracion, comun]) {
      expect(emails).not.toContain(excluido);
    }
  });
});
