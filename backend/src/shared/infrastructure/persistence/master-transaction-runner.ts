import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MasterContext } from '../../tenancy/master-context';
import {
  IMasterTransactionRunner,
  MASTER_TRANSACTION_RUNNER,
} from '../../domain/ports/i-master-transaction-runner';

// Re-exportar token y interface para que SharedModule pueda importarlos desde aquí.
export { IMasterTransactionRunner, MASTER_TRANSACTION_RUNNER };

/**
 * MasterTransactionRunner — implementación de IMasterTransactionRunner.
 *
 * Abre `masterClient.$transaction(tx => ...)` y re-bindea el MasterContext
 * con `tx` para que los repos MASTER dentro del callback usen el cliente transaccional.
 *
 * Tarea: PR-06 (carried-over W2 — BajaUsuario transactional)
 */
@Injectable()
export class MasterTransactionRunner implements IMasterTransactionRunner {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly masterContext: MasterContext,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const masterClient = this.prismaService.getMasterClient() as {
      $transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
    };

    return masterClient.$transaction(async (tx: unknown) => {
      // Re-bindea MasterContext con el cliente transaccional.
      // Así los repos que llamen masterContext.getClient() dentro del callback
      // obtienen el tx en lugar del cliente master normal.
      return this.masterContext.run({ prismaClient: tx }, fn);
    });
  }
}
