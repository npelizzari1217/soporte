import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * MasterContextData — datos del contexto de transacción master.
 * Almacena el cliente Prisma transaccional cuando hay una transacción activa
 * sobre tablas MASTER (usuarios, membresias, refresh_tokens, etc.).
 */
export interface MasterContextData {
  /** Cliente Prisma de la transacción activa (tx de $transaction). */
  prismaClient: unknown;
}

/**
 * MasterContext — análogo a TenantContext pero para la base de datos MASTER.
 *
 * Los repositorios MASTER (a implementar) consultan este contexto primero:
 *   `this.masterContext.getClient() ?? this.prismaService.getMasterClient()`
 *
 * Fuera de una transacción activa, `getClient()` retorna `undefined` y los
 * repositorios usan el cliente master normal (no transaccional).
 */
@Injectable()
export class MasterContext {
  private readonly storage = new AsyncLocalStorage<MasterContextData>();

  /** Ejecuta `fn` dentro de un contexto con el cliente Prisma dado. */
  run<T>(ctx: MasterContextData, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(ctx, fn);
  }

  /** Retorna el cliente Prisma activo del contexto (tx), o `undefined`. */
  getClient(): unknown | undefined {
    return this.storage.getStore()?.prismaClient;
  }
}
