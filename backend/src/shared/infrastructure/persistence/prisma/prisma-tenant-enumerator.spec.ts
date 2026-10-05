/**
 * SB5 [UNIT] — RED→GREEN: PrismaTenantEnumerator (S5 — enumera
 * master.clientes activos, no soft-deleted).
 *
 * Ref spec: sdd/premium/spec S5. Tarea: SB5/SB6.
 */
import { PrismaTenantEnumerator } from './prisma-tenant-enumerator';

describe('PrismaTenantEnumerator', () => {
  type FilaCliente = { id: string; dbName: string; activo?: boolean; deletedAt?: Date | null };

  function makePrismaService(rows: FilaCliente[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const prismaService = {
      getMasterClient: () => ({ cliente: { findMany } }),
    };
    return { prismaService, findMany };
  }

  function makeEnumerator(rows: FilaCliente[]) {
    const { prismaService, findMany } = makePrismaService(rows);
    return { enumerator: new PrismaTenantEnumerator(prismaService as never), findMany };
  }

  it('[CRITICAL] retorna clienteId/dbName de los clientes ACTIVOS, no soft-deleted', async () => {
    const { enumerator, findMany } = makeEnumerator([
      { id: 'cliente-1', dbName: 'soporte_cliente_1' },
      { id: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);

    const tenants = await enumerator.listActiveTenants();

    expect(tenants).toEqual([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { activo: true, deletedAt: null },
      select: { id: true, dbName: true },
    });
  });

  it('lista vacía si no hay clientes activos', async () => {
    const { enumerator } = makeEnumerator([]);

    const tenants = await enumerator.listActiveTenants();

    expect(tenants).toEqual([]);
  });

  it('listTenantsConBase retorna TODOS los clientes con base (activos, inactivos y soft-deleted) sin filtrar', async () => {
    const { enumerator, findMany } = makeEnumerator([
      { id: 'cliente-1', dbName: 'soporte_cliente_1', activo: true, deletedAt: null },
      { id: 'cliente-2', dbName: 'soporte_cliente_2', activo: false, deletedAt: new Date() },
      { id: 'cliente-3', dbName: 'soporte_cliente_3', activo: true, deletedAt: new Date() },
    ]);

    const tenants = await enumerator.listTenantsConBase();

    // `vivo` = lo que `listActiveTenants` incluiría: activo Y no soft-deleted.
    expect(tenants).toEqual([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2', vivo: false },
      { clienteId: 'cliente-3', dbName: 'soporte_cliente_3', vivo: false },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, dbName: true, activo: true, deletedAt: true },
    });
  });
});
