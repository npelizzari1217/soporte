import { ArchivoEntity } from '../entities/archivo.entity';

/**
 * IArchivoRepository — puerto de persistencia para metadatos de archivos
 * adjuntos. Solo almacena metadata: el binario vive en `IFileStorage`
 * (ADR-7).
 *
 * A diferencia de la referencia probada (soporte1, solo `archivos_ticket`),
 * el schema real de este tenant tiene dos tablas de join
 * (`archivos_ticket` / `archivos_operacion`, spec T22: "adjuntar a ticket y
 * a operación") — de ahí `linkToTicket` y `linkToOperacion`.
 *
 * `linkTo*` DEBE llamarse DESPUÉS de `save()` y dentro de la MISMA
 * transacción (ADR-7). Las tablas de join no tienen soft delete propio: la
 * baja lógica del archivo (`deleted_at` en `archivos`) es suficiente.
 *
 * NOTA (sdd/redisenio-modulo-compras, PR-1): `linkToPresupuesto` (Fase 3,
 * ADR-8) fue removido junto con la tabla `archivos_presupuesto` y el módulo
 * `compras/` que era su único consumidor (`AdjuntarPresupuestoUseCase`). Si
 * el dominio nuevo necesita adjuntar archivos a una compra, se agrega un
 * método nuevo cuando llegue ese caso de uso (fuera del alcance de PR-1).
 *
 * Ref spec: sdd/tickets-core/spec T20, T22. Ref design (Fase 2): ADR-7,
 * "Archivos afectados" (PR10). Tarea: T3.7 (Fase 2).
 */
export interface IArchivoRepository {
  /**
   * Persiste los metadatos del archivo. Solo INSERT (los archivos son
   * inmutables una vez subidos).
   */
  save(archivo: ArchivoEntity): Promise<void>;

  /**
   * Crea la fila en `archivos_ticket` que asocia el archivo con un ticket.
   */
  linkToTicket(archivoId: string, ticketId: string): Promise<void>;

  /**
   * Crea la fila en `archivos_operacion` que asocia el archivo con una
   * operación del timeline.
   */
  linkToOperacion(archivoId: string, operacionId: string): Promise<void>;
}

/** Token de inyección de dependencias para IArchivoRepository en NestJS. */
export const ARCHIVO_REPOSITORY = Symbol('ARCHIVO_REPOSITORY');
