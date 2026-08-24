import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../tenancy/tenant-context';

/**
 * Forma mínima que `run()` necesita del PrismaClient "normal" (fuera de
 * transacción) para abrir una nueva transacción. Nombrado en vez de un `as`
 * inline: el cast en sí es inevitable (`prismaClient` es `unknown` por
 * diseño — el dominio no depende de `@prisma/client`), pero ahora solo se
 * ejecuta en la rama donde el flag `enTransaccion` garantiza que el cliente
 * activo es el normal, nunca un `Prisma.TransactionClient`.
 */
interface PrismaTransactionCapableClient<T> {
  $transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

/**
 * ITenantTransactionRunner — puerto para transacciones atómicas multi-tenant.
 *
 * El dominio y la capa de aplicación dependen de este puerto (interface),
 * no de la implementación concreta que usa Prisma.
 *
 * Ref design: ADR-8. Ref tasks: sdd/tickets-core/tasks PR1 T1.1/T1.5.
 */
export interface ITenantTransactionRunner {
  /**
   * Ejecuta `fn` dentro de una transacción Prisma del tenant activo.
   * Dentro del callback, `TenantContext.getClient()` retorna el cliente
   * transaccional (`tx`), no el cliente normal.
   *
   * @param fn Callback que ejecuta operaciones dentro de la transacción.
   * @returns El valor retornado por `fn`.
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Token de inyección de dependencias para ITenantTransactionRunner. */
export const TENANT_TX_RUNNER = Symbol('TENANT_TX_RUNNER');

/**
 * PrismaTenantTransactionRunner — implementación de ITenantTransactionRunner.
 *
 * Abre `client.$transaction(tx => ...)` con el cliente Prisma activo del
 * TenantContext y re-bindea el contexto con `tx` para que los repositorios
 * que llamen a `TenantContext.getClient()` dentro del callback obtengan
 * automáticamente el cliente transaccional (T12, T24 — atomicidad ticket +
 * operación de timeline en la misma transacción).
 */
@Injectable()
export class PrismaTenantTransactionRunner implements ITenantTransactionRunner {
  constructor(private readonly tenantContext: TenantContext) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Recupera el contexto activo (lanza si no hay TenantContext)
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new Error('No hay TenantContext activo. ¿Falta TenantGuard o TenantMiddleware?');
    }

    // Re-entrancia: si ya estamos dentro de una transacción (run() anidado
    // dentro de otro run()), `ctx.prismaClient` es un `Prisma.TransactionClient`,
    // que NO expone `$transaction` (deny-list de Prisma). Participar de la
    // transacción en curso — nunca intentar abrir una nueva sobre ese cliente.
    if (ctx.enTransaccion) {
      return fn();
    }

    const client = ctx.prismaClient as PrismaTransactionCapableClient<T>;

    return client.$transaction(async (tx: unknown) => {
      // Re-bindea el TenantContext con el cliente transaccional, marcado con
      // `enTransaccion: true` para que un run() anidado lo detecte. Así los
      // repos que llamen getClient() dentro del callback obtienen el tx en
      // lugar del client normal.
      const txCtx = { ...ctx, prismaClient: tx, enTransaccion: true };
      return this.tenantContext.run(txCtx, fn);
    });
  }
}
