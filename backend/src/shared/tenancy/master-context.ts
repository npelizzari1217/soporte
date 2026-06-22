import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * MasterContextData — datos del contexto de transacción master.
 * Almacena el cliente Prisma transaccional cuando hay una transacción activa.
 */
export interface MasterContextData {
  /** Cliente Prisma de la transacción activa (tx de $transaction). */
  prismaClient: unknown;
}

/**
 * MasterContext — contexto de transacción para la base de datos MASTER.
 *
 * Análogo a TenantContext pero para las tablas MASTER (usuarios, refresh_tokens, etc.).
 * Usa AsyncLocalStorage para almacenar el cliente Prisma transaccional durante una
 * transacción abierta con MasterTransactionRunner.
 *
 * Los repositorios MASTER verifican este contexto primero:
 *   this.masterContext.getClient() ?? this.prismaService.getMasterClient()
 *
 * Fuera de una transacción activa, getClient() retorna undefined y los repos
 * usan el cliente master normal.
 *
 * Tarea: PR-06 (carried-over W2 — BajaUsuario transactional)
 */
@Injectable()
export class MasterContext {
  private readonly storage = new AsyncLocalStorage<MasterContextData>();

  /**
   * Ejecuta `fn` dentro de un contexto con el cliente Prisma dado.
   * Durante la ejecución de `fn`, `getClient()` retornará `ctx.prismaClient`.
   */
  run<T>(ctx: MasterContextData, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(ctx, fn);
  }

  /**
   * Retorna el cliente Prisma activo del contexto (tx si hay transacción).
   * Retorna undefined si no hay contexto activo (fuera de una transacción).
   */
  getClient(): unknown | undefined {
    return this.storage.getStore()?.prismaClient;
  }
}
