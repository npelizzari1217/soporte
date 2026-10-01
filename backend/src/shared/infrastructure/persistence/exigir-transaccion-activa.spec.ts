import { TenantContext } from '../../tenancy/tenant-context';
import { exigirTransaccionActiva } from './exigir-transaccion-activa';

describe('exigirTransaccionActiva', () => {
  const tenantContext = new TenantContext();
  const datos = { prismaClient: {}, dbName: 'db', clienteId: 'c' };

  it('lanza nombrando la operación y la transacción si no hay contexto', () => {
    expect(() => exigirTransaccionActiva(tenantContext, 'repo.leer()')).toThrow(
      /repo\.leer\(\) requiere una transacción activa/,
    );
  });

  it('lanza si hay contexto pero no transacción', async () => {
    await tenantContext.run(datos, async () => {
      expect(() => exigirTransaccionActiva(tenantContext, 'repo.leer()')).toThrow(
        /requiere una transacción activa/,
      );
    });
  });

  it('lanza si el flag enTransaccion es distinto de true', async () => {
    await tenantContext.run({ ...datos, enTransaccion: false }, async () => {
      expect(() => exigirTransaccionActiva(tenantContext, 'repo.leer()')).toThrow();
    });
  });

  it('no lanza dentro de una transacción', async () => {
    await tenantContext.run({ ...datos, enTransaccion: true }, async () => {
      expect(() => exigirTransaccionActiva(tenantContext, 'repo.leer()')).not.toThrow();
    });
  });
});
