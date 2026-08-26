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
import { ILogger } from '../../domain/ports/i-logger.port';
import {
  PrismaTenantTransactionRunner,
  PrismaTransactionCapableClient,
} from './tenant-transaction-runner';

describe('PrismaTenantTransactionRunner', () => {
  let tenantContext: TenantContext;
  let logger: Pick<ILogger, 'error'>;
  let runner: PrismaTenantTransactionRunner;

  // Mock del cliente tx (el que Prisma pasa dentro del callback de $transaction)
  const makeTxClient = () => ({
    $transaction: vi.fn(),
  });

  // Mock del cliente "normal" (antes de la transacción)
  const makePrismaClient = (
    txClient: ReturnType<typeof makeTxClient>,
  ): PrismaTransactionCapableClient<unknown> => ({
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
  });

  beforeEach(() => {
    tenantContext = new TenantContext();
    logger = { error: vi.fn() };
    runner = new PrismaTenantTransactionRunner(tenantContext, logger);
  });

  it('should execute the callback inside client.$transaction', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

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
    const prismaClient = makePrismaClient(txClient);

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
    const prismaClient = makePrismaClient(txClient);

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
    const prismaClient: PrismaTransactionCapableClient<unknown> = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    };

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

  it('alCommitear(): defers the callback until AFTER $transaction resolves (real commit), not during the callback body', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const postCommitCallback = vi.fn();
    let calledDuringTx: boolean | undefined;

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        runner.alCommitear(postCommitCallback);
        calledDuringTx = postCommitCallback.mock.calls.length > 0;
      }),
    );

    expect(calledDuringTx).toBe(false);
    expect(postCommitCallback).toHaveBeenCalledTimes(1);
  });

  it('alCommitear(): NEVER runs the callback if the transaction rolls back', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const postCommitCallback = vi.fn();

    await expect(
      tenantContext.run(ctx, () =>
        runner.run(async () => {
          runner.alCommitear(postCommitCallback);
          throw new Error('rollback forzado');
        }),
      ),
    ).rejects.toThrow('rollback forzado');

    expect(postCommitCallback).not.toHaveBeenCalled();
  });

  it('alCommitear(): runs immediately when there is no active transaction', () => {
    const postCommitCallback = vi.fn();

    runner.alCommitear(postCommitCallback);

    expect(postCommitCallback).toHaveBeenCalledTimes(1);
  });

  it('alCommitear(): a callback that throws on the immediate path (no active transaction) is logged (masked message), not propagated', () => {
    const boom = new Error('falla del callback inmediato');

    expect(() =>
      runner.alCommitear(() => {
        throw boom;
      }),
    ).not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('falla del callback inmediato'),
    );
  });

  it('alCommitear(): a nested (re-entrant) run() queues onto the SAME post-commit queue as the outermost transaction', async () => {
    const txClient = {} as { $transaction?: unknown };
    const prismaClient: PrismaTransactionCapableClient<unknown> = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    };

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const postCommitCallback = vi.fn();
    let calledDuringOuterTx: boolean | undefined;

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        // Simula CrearTicketUseCase corriendo RE-ENTRANTE dentro de la
        // transacción de otro caller (ADR-PV5).
        await runner.run(async () => {
          runner.alCommitear(postCommitCallback);
        });
        calledDuringOuterTx = postCommitCallback.mock.calls.length > 0;
      }),
    );

    expect(calledDuringOuterTx).toBe(false);
    expect(postCommitCallback).toHaveBeenCalledTimes(1);
  });

  it('a post-commit callback that throws is logged (masked message), not silently swallowed', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const boom = new Error('falla del callback post-commit');

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        runner.alCommitear(() => {
          throw boom;
        });
      }),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('falla del callback post-commit'),
    );
  });

  it('a failing post-commit callback does not stop the following callbacks from running', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

    const ctx: TenantContextData = {
      prismaClient,
      dbName: 'test_db',
      clienteId: 'id-test',
    };

    const segundoCallback = vi.fn();

    await tenantContext.run(ctx, () =>
      runner.run(async () => {
        runner.alCommitear(() => {
          throw new Error('primero falla');
        });
        runner.alCommitear(segundoCallback);
      }),
    );

    expect(segundoCallback).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('alCommitear(): a bound context with enTransaccion=true but no queue (unreachable via run(), only via bind() by hand) logs an error naming the inconsistency instead of running the callback on the happy path silently', () => {
    // No alcanzable vía run() (siempre crea `postCommitCallbacks`): solo con
    // un contexto bindeado a mano (tests, scripts) queda `enTransaccion: true`
    // sin cola. Es un estado que no debería existir — el JSDoc de
    // `alCommitear` promete SIN CONDICIONES que la callback nunca corre ante
    // un ROLLBACK, y correrla acá lo contradice en silencio.
    const ctxInconsistente: TenantContextData = {
      prismaClient: {},
      dbName: 'test_db',
      clienteId: 'id-test',
      enTransaccion: true,
      // postCommitCallbacks: undefined — deliberadamente ausente.
    };
    tenantContext.bind(ctxInconsistente);

    const postCommitCallback = vi.fn();
    runner.alCommitear(postCommitCallback);

    expect(postCommitCallback).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ALCOMMITEAR_ESTADO_INCONSISTENTE'),
    );
  });

  it('should preserve dbName and clienteId in the re-bound context', async () => {
    const txClient = makeTxClient();
    const prismaClient = makePrismaClient(txClient);

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
