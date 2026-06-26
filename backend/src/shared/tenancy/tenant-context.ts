import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * TenantContextData — datos del tenant activo para el request actual.
 *
 * Almacena el cliente Prisma activo (directo o transaccional), el nombre de la DB
 * y el ID del cliente para enrutamiento y auditoría.
 *
 * Se inyecta por request via TenantGuard/TenantMiddleware y se recupera
 * por los repositorios de infraestructura sin conocer el ORM directamente.
 */
export interface TenantContextData {
  /** Cliente Prisma del tenant activo (normal o dentro de una transacción). */
  prismaClient: unknown;
  /** Nombre de la base de datos PostgreSQL del tenant (ej. "cliente_acme"). */
  dbName: string;
  /** UUID del cliente en la DB master (ej. FK a master.clientes.id). */
  clienteId: string;
}

/**
 * TenantStore — contenedor MUTABLE interno del AsyncLocalStorage.
 *
 * Usar un wrapper mutable (en lugar de almacenar TenantContextData directamente)
 * es necesario para que `bind()` en TenantGuard funcione correctamente en entornos
 * donde múltiples guards async preceden al handler. En esos entornos (ej. Jest/ts-jest),
 * `AsyncLocalStorage.enterWith()` no propaga el contexto a recursos async hermanos
 * (el controller), pero MUTAR el objeto compartido sí funciona porque todos los recursos
 * heredan la misma referencia de objeto desde el `run()` del middleware.
 *
 * Invariante: si `data === null`, el scope está inicializado pero TenantGuard
 * aún no corrió (o la ruta no requiere tenant). Los repositorios no deben ser
 * llamados en ese estado.
 */
type TenantStore = { data: TenantContextData | null };

/**
 * TenantContext — wrapper de AsyncLocalStorage para aislamiento por request.
 *
 * Diseño:
 * - `initScope(fn)` [desde middleware] inicia un scope mutable ANTES de los guards.
 * - `bind(ctx)` [desde TenantGuard] bindea el contexto mutando el scope activo, o
 *   usa `enterWith()` como fallback cuando no hay scope (unit tests, scripts).
 * - `run(ctx, fn)` [desde TenantTransactionRunner] crea un scope acotado para `fn`.
 * - `get()` recupera el contexto activo o `undefined` fuera de scope.
 * - `getClient()` lanza si no hay contexto activo (guard de seguridad).
 *
 * Los repositorios de infraestructura llaman `getClient()` para obtener el
 * PrismaClient del tenant. `TenantTransactionRunner` re-bindea el contexto
 * con el cliente transaccional dentro de `client.$transaction(tx => ...)`.
 *
 * Tarea: 0.C.2 — implementación de la interfaz definida en 0.C.1 (tests).
 * Fix Batch 4 (7.C.2): mutable-store pattern para compatibilidad con Jest/ts-jest.
 */
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  /**
   * Inicia un scope mutable vacío para la duración del request HTTP.
   *
   * Debe llamarse desde un NestJS middleware (ANTES de que los guards corran)
   * para garantizar que `bind()` en TenantGuard pueda mutar el store compartido
   * y que el controlador lo vea correctamente.
   *
   * Uso en middleware:
   *   `this.tenantContext.initScope(() => next())`
   *
   * @param fn Callback a ejecutar dentro del scope (usualmente `next` de Express).
   */
  initScope(fn: () => void): void {
    this.storage.run({ data: null }, fn);
  }

  /**
   * Ejecuta `fn` dentro de un scope de AsyncLocalStorage con `ctx` como valor activo.
   * Al finalizar (o ante error), el scope se cierra y `get()` vuelve a retornar `undefined`.
   *
   * Uso en TenantTransactionRunner para re-bindear el contexto con el cliente tx.
   */
  async run<T>(ctx: TenantContextData, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ data: ctx }, fn);
  }

  /**
   * Retorna el contexto del tenant activo, o `undefined` si no hay scope activo.
   */
  get(): TenantContextData | undefined {
    return this.storage.getStore()?.data ?? undefined;
  }

  /**
   * Retorna el PrismaClient activo (directo o transaccional).
   * Lanza un error descriptivo si se llama fuera de un contexto de tenant.
   *
   * @throws Error si no hay TenantContext activo.
   */
  getClient(): unknown {
    const ctx = this.get();
    if (!ctx) {
      throw new Error('No hay TenantContext activo. ¿Falta TenantGuard o TenantMiddleware?');
    }
    return ctx.prismaClient;
  }

  /**
   * Vincula el contexto del tenant al scope asíncrono actual.
   *
   * Llamado desde TenantGuard.canActivate() después de resolver el cliente:
   *
   * — Si ya hay un scope mutable activo (creado por `initScope()` en middleware):
   *   MUTA el objeto compartido. Esto garantiza que el controlador y los repositorios
   *   (que heredan la misma referencia) vean el contexto actualizado. Es el path
   *   normal en producción y en tests e2e que inicializan el scope vía middleware.
   *
   * — Si NO hay scope activo (unit tests, scripts, llamadas directas sin HTTP):
   *   Usa `enterWith()` como fallback. Permite que los tests de TenantGuard en
   *   aislamiento sigan funcionando sin requerir middleware.
   *
   * @param ctx Datos del tenant a vincular (prismaClient, dbName, clienteId).
   */
  bind(ctx: TenantContextData): void {
    const store = this.storage.getStore();
    if (store !== undefined) {
      // Scope mutable existe → mutar en lugar de enterWith()
      store.data = ctx;
    } else {
      // Fallback: sin scope previo → enterWith (unit tests, llamadas directas)
      this.storage.enterWith({ data: ctx });
    }
  }
}
