import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../tenancy/tenant-context';
import { ILogger, LOGGER } from '../../domain/ports/i-logger.port';

/**
 * Forma mínima que `run()` necesita del PrismaClient "normal" (fuera de
 * transacción) para abrir una nueva transacción. Nombrado en vez de un `as`
 * inline: el cast en sí es inevitable (`prismaClient` es `unknown` por
 * diseño — el dominio no depende de `@prisma/client`), pero ahora solo se
 * ejecuta en la rama donde el flag `enTransaccion` garantiza que el cliente
 * activo es el normal, nunca un `Prisma.TransactionClient`.
 */
export interface PrismaTransactionCapableClient<T> {
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

  /**
   * Encola `fn` para ejecutarse DESPUÉS de que la transacción MÁS EXTERNA
   * activa haga COMMIT real. Si NO hay transacción activa, ejecuta `fn` de
   * inmediato (no hay commit que esperar). Si esa transacción hace ROLLBACK,
   * `fn` NUNCA se ejecuta.
   *
   * Existe para publicar eventos de dominio (u otro efecto que solo debe
   * dispararse sobre estado ya committeado) desde un use case que puede
   * correr tanto en la raíz de un `run()` como RE-ENTRANTE, anidado dentro
   * de la transacción de OTRO caller (ADR-PV5) — publicar "directo" ahí
   * corre con la transacción externa todavía abierta, no post-commit.
   *
   * @param fn Callback sin retorno; sus errores NO deshacen la transacción
   *   (ya comiteó cuando corre) — si `fn` lanza, el runner lo loguea
   *   (mensaje enmascarado, vía `ILogger`) y sigue con el resto de la cola,
   *   sin propagar. El caller no necesita su propio try/catch de log.
   *   Nota de implementación: un contexto con `enTransaccion: true` pero sin
   *   cola es un estado inconsistente (solo alcanzable bindeando el contexto
   *   a mano, nunca vía `run()`) — la implementación lo trata como "no
   *   ejecutar" (no como "ejecutar ya"), para no violar la garantía de
   *   arriba, y lo loguea.
   */
  alCommitear(fn: () => void): void;
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
  constructor(
    private readonly tenantContext: TenantContext,
    @Inject(LOGGER) private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /** Ver contrato completo en `ITenantTransactionRunner.run`. */
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

    // Cola de callbacks de `alCommitear()` para ESTA transacción (la más
    // externa). Se crea acá, no dentro del callback de `$transaction`, para
    // conservar la misma referencia después de que la promesa resuelva
    // (commit real) y poder recorrerla.
    const postCommitCallbacks: Array<() => void> = [];

    const resultado = await client.$transaction(async (tx: unknown) => {
      // Re-bindea el TenantContext con el cliente transaccional, marcado con
      // `enTransaccion: true` para que un run() anidado lo detecte. Así los
      // repos que llamen getClient() dentro del callback obtienen el tx en
      // lugar del client normal. Un run() anidado reutiliza este MISMO
      // objeto txCtx (rama `enTransaccion` de arriba no crea uno nuevo), así
      // que comparte `postCommitCallbacks` con la raíz.
      const txCtx = { ...ctx, prismaClient: tx, enTransaccion: true, postCommitCallbacks };
      return this.tenantContext.run(txCtx, fn);
    });

    // El `await` de arriba recién resuelve una vez que `$transaction` comitea
    // de verdad — acá SÍ es post-commit real, a diferencia de cualquier punto
    // dentro del callback (que corre con la transacción todavía abierta).
    //
    // Cada callback va en su propio try/catch: una que lance NO puede dejar
    // sin correr a las que siguen ni propagar hacia afuera de `run()`. Si
    // propagara, el caller vería un error DESPUÉS de un COMMIT exitoso y lo
    // leería como un fallo de la operación — en el barrido de preventivo eso
    // aparecía como PREVENTIVO_PLAN_ERROR sobre un plan que en realidad
    // funcionó. La transacción ya cerró: acá no hay nada que revertir.
    for (const callback of postCommitCallbacks) {
      this.ejecutarProtegida(callback);
    }

    return resultado;
  }

  /**
   * Corre una callback post-commit sin dejar que su fallo escape.
   *
   * Va acá y no inline en cada rama porque `alCommitear` tiene DOS caminos y
   * los dos necesitan la misma red. El inmediato es, además, el del flujo
   * HTTP: `CrearTicketUseCase` llama `alCommitear` DESPUÉS de que su
   * `run()` resolvió, así que el scope de ALS con `enTransaccion` ya no
   * existe y la callback cae por ahí. Dejarlo sin proteger rompía la
   * garantía que el JSDoc de `alCommitear` promete sin condiciones, y de la
   * que los callers ya se cuelgan para no poner su propio try/catch.
   *
   * Log enmascarado (mismo criterio que `PreventivoSweepScheduler`): solo el
   * mensaje del error, NUNCA el objeto crudo — puede traer datos sensibles
   * del callback del caller.
   *
   * @param fn Callback del caller.
   */
  private ejecutarProtegida(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`POST_COMMIT_CALLBACK_ERROR | error=${mensaje}`);
    }
  }

  /** Ver contrato completo en `ITenantTransactionRunner.alCommitear`. */
  alCommitear(fn: () => void): void {
    const ctx = this.tenantContext.get();

    // Sin transacción activa: no hay commit que esperar, corre ya —
    // protegida igual.
    if (!ctx?.enTransaccion) {
      this.ejecutarProtegida(fn);
      return;
    }

    const cola = ctx.postCommitCallbacks;
    if (!cola) {
      // Estado inconsistente: `enTransaccion: true` sin `postCommitCallbacks`
      // — no alcanzable vía `run()` (SIEMPRE crea la cola antes de re-bindear
      // el contexto), solo con un `TenantContextData` armado a mano (tests,
      // scripts) vía `bind()`/`enterWith()`. Correrla acá, en el camino
      // feliz, contradice en silencio la garantía SIN CONDICIONES del JSDoc
      // de `alCommitear`: "si esa transacción hace ROLLBACK, `fn` NUNCA se
      // ejecuta" — un caller no puede confiar en eso si esta rama la corre
      // igual. Se decide NO ejecutarla: mejor perder un efecto post-commit
      // (recuperable con un retry/reintento del caller) que violar la
      // garantía de "nunca corre si no hay commit real que la respalde".
      this.logger.error(
        'ALCOMMITEAR_ESTADO_INCONSISTENTE | enTransaccion=true sin postCommitCallbacks — contexto bindeado a mano fuera de run()',
      );
      return;
    }

    cola.push(fn);
  }
}
