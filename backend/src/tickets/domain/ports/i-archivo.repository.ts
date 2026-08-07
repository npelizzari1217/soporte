import { ArchivoEntity } from '../entities/archivo.entity';

/**
 * IArchivoRepository — puerto de persistencia para metadatos de archivos
 * adjuntos. Solo almacena metadata: el binario vive en `IFileStorage`
 * (ADR-7).
 *
 * A diferencia de la referencia probada (soporte1, solo `archivos_ticket`),
 * el schema real de este tenant tiene TRES tablas de join
 * (`archivos_ticket` / `archivos_operacion` / `archivos_presupuesto`, spec
 * T22 + Fase 3 F3-C3: "adjuntar a ticket, a operación y a presupuesto") —
 * de ahí `linkToTicket`, `linkToOperacion` Y `linkToPresupuesto`.
 *
 * `linkTo*` DEBE llamarse DESPUÉS de `save()` y dentro de la MISMA
 * transacción (ADR-7/ADR-8). Las tablas de join no tienen soft delete
 * propio: la baja lógica del archivo (`deleted_at` en `archivos`) es
 * suficiente.
 *
 * Extensión de Fase 3 (ADR-8): `linkToPresupuesto` se agregó de forma
 * RETROCOMPATIBLE — no toca `save`/`linkToTicket`/`linkToOperacion` ni
 * ningún caller existente de Fase 2.
 *
 * Ref spec: sdd/tickets-core/spec T20, T22. Ref design (Fase 2): ADR-7,
 * "Archivos afectados" (PR10). Ref design (Fase 3): ADR-8. Tarea: T3.7
 * (Fase 2), T3.3 (Fase 3, extensión `linkToPresupuesto`).
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

  /**
   * Crea la fila en `archivos_presupuesto` que asocia el archivo con un
   * presupuesto de compra (Fase 3, ADR-8). Usado por
   * `AdjuntarPresupuestoUseCase` (`compras/`).
   */
  linkToPresupuesto(archivoId: string, presupuestoId: string): Promise<void>;
}

/** Token de inyección de dependencias para IArchivoRepository en NestJS. */
export const ARCHIVO_REPOSITORY = Symbol('ARCHIVO_REPOSITORY');
