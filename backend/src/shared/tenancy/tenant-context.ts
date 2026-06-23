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
 * TenantContext — wrapper de AsyncLocalStorage para aislamiento por request.
 *
 * Diseño:
 * - `run(ctx, fn)` inicia un scope de AsyncLocalStorage con los datos del tenant.
 * - `get()` recupera el contexto activo o `undefined` fuera de scope.
 * - `getClient()` lanza si no hay contexto activo (guard de seguridad).
 *
 * Los repositorios de infraestructura llaman `getClient()` para obtener el
 * PrismaClient del tenant. `TenantTransactionRunner` re-bindea el contexto
 * con el cliente transaccional dentro de `client.$transaction(tx => ...)`.
 *
 * Tarea: 0.C.2 — implementación de la interfaz definida en 0.C.1 (tests).
 */
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextData>();

  /**
   * Ejecuta `fn` dentro de un scope de AsyncLocalStorage con `ctx` como valor activo.
   * Al finalizar (o ante error), el scope se cierra y `get()` vuelve a retornar `undefined`.
   */
  async run<T>(ctx: TenantContextData, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(ctx, fn);
  }

  /**
   * Retorna el contexto del tenant activo, o `undefined` si no hay scope activo.
   */
  get(): TenantContextData | undefined {
    return this.storage.getStore();
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
   * Vincula el contexto del tenant al scope asíncrono actual y todos sus descendientes.
   *
   * Usar desde NestJS Guards donde `run()` no puede envolver el handler del controlador.
   * Internamente llama `AsyncLocalStorage.enterWith()`: el contexto persiste para todas
   * las operaciones asíncronas que se derivan del scope actual (request pipeline completo).
   *
   * Prerequisito: llamar desde dentro del async scope del request (ej. `canActivate()`).
   *
   * @param ctx Datos del tenant a vincular (prismaClient, dbName, clienteId).
   */
  bind(ctx: TenantContextData): void {
    this.storage.enterWith(ctx);
  }
}
