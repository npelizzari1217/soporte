/**
 * TenantScopeMiddleware — inicializa el scope AsyncLocalStorage de TenantContext
 * para cada request HTTP, ANTES de que los guards corran.
 *
 * Problema que resuelve:
 * En Jest/ts-jest (y potencialmente en otros entornos donde el runtime de Node.js
 * crea recursos async distintos para cada continuación de async function), llamar
 * `AsyncLocalStorage.enterWith()` dentro de un guard NO propaga el contexto al
 * controller si múltiples guards async preceden al guard que llama `enterWith()`.
 * Esto es porque cada continuación de `await` crea un recurso async diferente,
 * y `enterWith()` solo afecta el recurso actual y sus descendientes, no los
 * recursos ya creados de la misma request.
 *
 * Solución:
 * Este middleware llama `TenantContext.initScope()` que ejecuta el pipeline
 * del request (`next()`) dentro de un `storage.run()`. Todos los recursos async
 * creados durante el request (guards + controller + repositorios) heredan la
 * MISMA referencia de objeto mutable. Cuando TenantGuard llama `bind()`, muta
 * ese objeto compartido, y el controller lo ve al leer el store.
 *
 * Ref: TenantContext.bind() — mutable store pattern
 * Tarea: Batch 4 / Fix 7.C.2 (compatibilidad Jest e2e)
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContext) {}

  /**
   * Crea un scope AsyncLocalStorage mutable para el request.
   * Llama a `next()` dentro del scope para que todos los handlers
   * del request (guards, interceptors, controller) hereden el store.
   */
  use(req: unknown, res: unknown, next: () => void): void {
    this.tenantContext.initScope(next);
  }
}
