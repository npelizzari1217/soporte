/**
 * SB5 [UNIT] — RED→GREEN: PrismaTenantEnumerator (S5 — enumera
 * master.clientes activos, no soft-deleted).
 *
 * Ref spec: sdd/premium/spec S5. Tarea: SB5/SB6.
 */
import { PrismaTenantEnumerator } from './prisma-tenant-enumerator';

describe('PrismaTenantEnumerator', () => {
  function makePrismaService(rows: { id: string; dbName: string }[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const prismaService = {
      getMasterClient: () => ({ cliente: { findMany } }),
    };
    return { prismaService, findMany };
  }

  it('[CRITICAL] retorna clienteId/dbName de los clientes ACTIVOS, no soft-deleted', async () => {
    const { prismaService, findMany } = makePrismaService([
      { id: 'cliente-1', dbName: 'soporte_cliente_1' },
      { id: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);
    const enumerator = new PrismaTenantEnumerator(prismaService as never);

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
    const { prismaService } = makePrismaService([]);
    const enumerator = new PrismaTenantEnumerator(prismaService as never);

    const tenants = await enumerator.listActiveTenants();

    expect(tenants).toEqual([]);
  });
});
