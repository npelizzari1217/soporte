/**
 * tenant-transaction-runner.spec.ts — TDD RED phase (T1.1, PR1 tickets-core).
 *
 * Tests de PrismaTenantTransactionRunner:
 * - Ejecuta el callback dentro de client.$transaction
 * - Re-bindea TenantContext con el cliente transaccional (tx)
 * - Un error en el callback propaga la excepción (rollback implícito)
 * - Lanza si se invoca fuera de un TenantContext activo
 * - `run()` es RE-ENTRANTE: anidado dentro de otro `run()`, participa de la
 *   transacción en curso en vez de intentar abrir una nueva (ola-2 WU-0,
 *   ADR-PV5 de sdd/preventivo/design). Un `Prisma.TransactionClient` real NO
 *   expone `$transaction` (deny-list de Prisma), así que sin este arreglo la
 *   llamada anidada revienta en runtime con TypeError, no al compilar.
 *
 * Ref design: ADR-8, ADR-PV5. Ref tasks: sdd/tickets-core/tasks PR1 T1.1;
 * sdd/preventivo/tasks WU-0 (0.1/0.2).
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

  it('should let a nested run() participate in the current transaction instead of opening a new one', async () => {
    // Simula un Prisma.TransactionClient REAL: no expone `$transaction` (está
    // en la deny-list de Prisma). El client "normal" (fuera de transacción)
    // sí lo expone — esa asimetría es la causa raíz del bug.
    const txClient = {} as { $transaction?: unknown };
    const prismaClient = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    } as any;

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    let innerResult: unknown;
    let clientSeenByInnerCallback: unknown;

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        // Ya estamos dentro de la transacción externa: ctx.prismaClient === txClient.
        // Anidar run() de nuevo debe PARTICIPAR de esta misma transacción.
        innerResult = await runner.run(async () => {
          clientSeenByInnerCallback = tenantContext.getClient();
          return 'ran-nested';
        });
      }),
    );

    expect(innerResult).toBe('ran-nested');
    expect(clientSeenByInnerCallback).toBe(txClient);
    // Solo UNA transacción se abrió — la anidada participó, no abrió otra.
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
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
