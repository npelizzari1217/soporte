/**
 * tenant-transaction-runner.spec.ts — TDD RED phase (T1.1, PR1 tickets-core).
 *
 * Tests de PrismaTenantTransactionRunner:
 * - Ejecuta el callback dentro de client.$transaction
 * - Re-bindea TenantContext con el cliente transaccional (tx)
 * - Un error en el callback propaga la excepción (rollback implícito)
 * - Lanza si se invoca fuera de un TenantContext activo
 *
 * Ref design: ADR-8. Ref tasks: sdd/tickets-core/tasks PR1 T1.1.
 */
import { TenantContext, TenantContextData } from '../../tenancy/tenant-context';
import { PrismaTenantTransactionRunner } from './tenant-transaction-runner';

describe('PrismaTenantTransactionRunner', () => {
  let tenantContext: TenantContext;
  let runner: PrismaTenantTransactionRunner;

  // Mock del cliente tx (el que Prisma pasa dentro del callback de $transaction)
  const makeTxClient = () => ({
    $transaction: vi.fn(),
  });

  // Mock del cliente "normal" (antes de la transacción)
  const makePrismaClient = (txClient: ReturnType<typeof makeTxClient>) => ({
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
  });

  beforeEach(() => {
    tenantContext = new TenantContext();
    runner = new PrismaTenantTransactionRunner(tenantContext);
  });

  it('should execute the callback inside client.$transaction', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient) as any;

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const callbackResult = 'ok-from-tx';

    const result = await tenantContext.run(ctx, () => runner.run(async () => callbackResult));

    expect(prismaClient.$transaction).toHaveBeenCalled();
    expect(result).toBe(callbackResult);
  });

  it('should re-bind TenantContext with the transactional client (tx) inside the callback', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient) as any;

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    let clientInsideTx: unknown;

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        clientInsideTx = tenantContext.getClient();
      }),
    );

    expect(clientInsideTx).toBe(txClient);
    expect(clientInsideTx).not.toBe(prismaClient);
  });

  it('should propagate errors from the callback (implicit rollback)', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient) as any;

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const boom = new Error('kaboom');

    await expect(
      tenantContext.run(ctx, () =>
        runner.run(async () => {
          throw boom;
        }),
      ),
    ).rejects.toThrow('kaboom');
  });

  it('should throw if called outside of a tenant context', async () => {
    await expect(runner.run(async () => 'never')).rejects.toThrow('No hay TenantContext activo');
  });

  it('should preserve dbName and clienteId in the re-bound context', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient) as any;

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'preserve_db',
      clienteId: 'preserve-id-123',
    };

    let ctxInsideTx: TenantContextData | undefined;

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        ctxInsideTx = tenantContext.get();
      }),
    );

    expect(ctxInsideTx?.dbName).toBe('preserve_db');
    expect(ctxInsideTx?.clienteId).toBe('preserve-id-123');
    expect(ctxInsideTx?.prismaClient).toBe(txClient);
  });
});
