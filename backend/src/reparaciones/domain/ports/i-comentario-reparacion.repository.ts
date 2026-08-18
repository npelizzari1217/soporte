import { ComentarioReparacionEntity } from '../entities/comentario-reparacion.entity';

/**
 * IComentarioReparacionRepository — puerto de persistencia de los comentarios
 * de una reparación edilicia.
 *
 * APPEND-ONLY GARANTIZADO POR LA FIRMA: expone un solo método de escritura
 * (`crear()`); el resto son lecturas. No hay `update`/`delete` — no es una
 * convención a respetar, el método no existe (mismo criterio que
 * `IOperacionCompraRepository`, S37). La tabla lo acompaña estructuralmente:
 * `comentarios_reparacion` no tiene `updated_at` ni `deleted_at`.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaComentarioReparacionRepository`) obtiene su
 * cliente vía `TenantContext.getClient()`.
 */
export interface IComentarioReparacionRepository {
  /** Inserta un comentario nuevo. Solo INSERT — nunca hay UPDATE de una fila ya escrita. */
  crear(comentario: ComentarioReparacionEntity): Promise<void>;

  /**
   * Retorna los comentarios de una reparación ordenados por `created_at DESC`
   * (más nuevo primero — el motivo de la demora que se está buscando es
   * siempre el último asentado). Empate de `created_at` desempatado por `id`
   * DESC: el id es UUIDv7, monótono en el tiempo, así que el orden se
   * mantiene determinístico aun con dos inserts en el mismo milisegundo.
   */
  listarPorTicketEdilicia(ticketEdiliciaId: string): Promise<ComentarioReparacionEntity[]>;

  /**
   * Cuenta los comentarios de VARIAS reparaciones de una sola vez y devuelve
   * `Map<ticketEdiliciaId, cantidad>`.
   *
   * POR LOTE A PROPÓSITO, no por conveniencia: su único consumidor es
   * `ListarReparacionesUseCase`, que ya es un N+1 conocido (resuelve ticket
   * base y subtareas fila por fila, `1 + 2N` consultas). Una firma de un solo
   * id invitaría a llamarla dentro de ese loop y dejaría el listado en `1 + 3N`.
   * Con esta firma el indicador de comentarios cuesta UNA consulta agregada
   * para toda la página, sin importar cuántas reparaciones haya.
   *
   * Las reparaciones sin comentarios NO aparecen en el Map (un `GROUP BY` no
   * emite filas vacías): quien lo consuma resuelve la ausencia como `0`.
   * Con `ticketEdiliciaIds` vacío no consulta nada y devuelve un Map vacío.
   */
  contarPorTicketEdilicia(ticketEdiliciaIds: string[]): Promise<Map<string, number>>;
}

/** Token de inyección de dependencias para IComentarioReparacionRepository en NestJS. */
export const COMENTARIO_REPARACION_REPOSITORY = Symbol('COMENTARIO_REPARACION_REPOSITORY');
