/**
 * [INTEGRATION] Alta de tipo de ticket con "Copiar permisos de" (odd/tasks/permisos-por-tipo-ticket.md,
 * T8, S4) contra Postgres REAL, en una base de INQUILINO EFÍMERA migrada: repositorios Prisma y
 * `PrismaTenantTransactionRunner` reales. Prueba lo que un doble no puede: que la copia y el alta
 * comparten la transacción, y que si la copia falla el tipo no queda creado.
 * No toca master: sin `usarLockMasterTest()`. Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaPermisoTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-permiso-tipo-ticket.repository';
import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { CrearTipoTicketUseCase } from './crear-tipo-ticket.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_crear_tipo_${sufijo}_test`;
const USUARIO_1 = '11111111-1111-4111-8111-111111111111';
const USUARIO_2 = '22222222-2222-4222-8222-222222222222';

describe('CrearTipoTicketUseCase con copia de permisos (T8, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  const tenantContext = new TenantContext();
  const tipoRepo = new PrismaTipoTicketRepository(tenantContext);
  const permisosRepo = new PrismaPermisoTipoTicketRepository(tenantContext);
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

  const enTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: 'cliente-a' }, fn);

  /** Filas de un usuario como `tipoId:ACCION`, leídas crudas sin pasar por el repositorio. */
  async function filasDe(usuarioId: string): Promise<string[]> {
    const filas = await client.permisoTipoTicket.findMany({ where: { usuarioId } });
    return filas.map((f) => `${f.tipoId}:${f.accion}`).sort();
  }

  /** Tipo de origen de TICKETS con filas para dos usuarios. */
  async function origenConFilas(): Promise<string> {
    const origen = await client.tipoTicket.create({
      data: { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' },
    });
    await client.permisoTipoTicket.createMany({
      data: [
        { usuarioId: USUARIO_1, tipoId: origen.id, accion: 'LECTURA' },
        { usuarioId: USUARIO_1, tipoId: origen.id, accion: 'TRANSICIONAR' },
        { usuarioId: USUARIO_2, tipoId: origen.id, accion: 'LECTURA' },
      ],
    });
    return origen.id;
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
  }, 120_000);

  afterAll(async () => {
    try {
      await client?.permisoTipoTicket.deleteMany();
      await client?.tipoTicket.deleteMany();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await client.permisoTipoTicket.deleteMany();
    await client.tipoTicket.deleteMany();
  });

  it('copia en la base las filas de cada usuario sobre el origen al tipo nuevo', async () => {
    const origenId = await origenConFilas();
    const useCase = new CrearTipoTicketUseCase(tipoRepo, permisosRepo, txRunner);

    const result = await enTenant(() =>
      useCase.execute({
        codigo: 'ELECTRICIDAD',
        nombre: 'Electricidad',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: origenId,
      }),
    );

    const nuevoId = result.getValue().id;
    await expect(filasDe(USUARIO_1)).resolves.toEqual(
      [
        `${origenId}:LECTURA`,
        `${origenId}:TRANSICIONAR`,
        `${nuevoId}:LECTURA`,
        `${nuevoId}:TRANSICIONAR`,
      ].sort(),
    );
    await expect(filasDe(USUARIO_2)).resolves.toEqual(
      [`${origenId}:LECTURA`, `${nuevoId}:LECTURA`].sort(),
    );
  });

  it('sin origen, el tipo queda creado y sin ninguna fila de permisos', async () => {
    await origenConFilas();
    const useCase = new CrearTipoTicketUseCase(tipoRepo, permisosRepo, txRunner);

    const result = await enTenant(() =>
      useCase.execute({ codigo: 'ELECTRICIDAD', nombre: 'Electricidad', modulo: 'TICKETS' }),
    );

    const nuevoId = result.getValue().id;
    expect(await client.tipoTicket.count({ where: { id: nuevoId } })).toBe(1);
    expect(await client.permisoTipoTicket.count({ where: { tipoId: nuevoId } })).toBe(0);
  });

  it('si la copia falla después de insertar, el tipo no queda creado ni quedan filas copiadas', async () => {
    const origenId = await origenConFilas();
    // La copia real corre y recién después falla: prueba que sus filas también se revierten.
    const copiaQueFalla: Pick<IPermisoTipoTicketRepository, 'copiarDeTipo'> = {
      copiarDeTipo: async (origen, destino) => {
        await permisosRepo.copiarDeTipo(origen, destino);
        throw new Error('fallo después de copiar');
      },
    };
    const useCase = new CrearTipoTicketUseCase(tipoRepo, copiaQueFalla, txRunner);

    await expect(
      enTenant(() =>
        useCase.execute({
          codigo: 'ELECTRICIDAD',
          nombre: 'Electricidad',
          modulo: 'TICKETS',
          copiarPermisosDeTipoId: origenId,
        }),
      ),
    ).rejects.toThrow('fallo después de copiar');

    expect(await client.tipoTicket.count({ where: { codigo: 'ELECTRICIDAD' } })).toBe(0);
    expect(await client.permisoTipoTicket.count()).toBe(3);
  });
});
