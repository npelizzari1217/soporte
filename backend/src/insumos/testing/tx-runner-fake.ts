import type { ITenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';

/**
 * Runner de transacciones falso para los specs de aplicación: ejecuta el
 * callback tal cual y cuenta cuántas veces se abrió. Va escrito a mano y no con
 * `vi.fn` porque `Mock<...>` instancia el genérico de `run` en `unknown` y no
 * encaja en el `Pick` del constructor.
 */
export function txRunnerFake(): Pick<ITenantTransactionRunner, 'run'> & { abiertas: number } {
  const fake = {
    abiertas: 0,
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      fake.abiertas += 1;
      return fn();
    },
  };
  return fake;
}
