import { TareaTicketEntity } from '../entities/tarea-ticket.entity';

/**
 * Filtro de la métrica "tareas completadas por técnico" (T4). El período es `[desde, hasta)` sobre
 * `completada_en`. `cicloId` y `completadaPorId` son opcionales y se combinan con AND, igual que
 * `MetricaFiltro` del dashboard: el caso de uso fija `completadaPorId` al actor cuando el alcance
 * es de TECNICO.
 */
export interface FiltroCompletadasPorTecnico {
  desde: Date;
  hasta: Date;
  cicloId?: string;
  completadaPorId?: string;
}

/** Cantidad de tareas completadas por un usuario en el período. */
export interface CompletadasPorTecnico {
  completadaPorId: string;
  completadas: number;
}

/**
 * ITareaTicketRepository — puerto de persistencia de las tareas de un ticket. Sin imports de
 * Prisma ni NestJS: la implementación toma el cliente del inquilino de `TenantContext`.
 */
export interface ITareaTicketRepository {
  /** Tareas ACTIVAS del ticket, ordenadas por `orden ASC, created_at ASC`. */
  listarPorTicket(ticketId: string): Promise<TareaTicketEntity[]>;

  /**
   * Versión por lote de `listarPorTicket`, para el listado y el PDF: una sola consulta para toda
   * la página. Mismo filtro y mismo orden dentro de cada ticket. Los tickets sin tareas activas no
   * aparecen en el Map; con `ticketIds` vacío no consulta y devuelve un Map vacío.
   */
  listarPorTickets(ticketIds: string[]): Promise<Map<string, TareaTicketEntity[]>>;

  /** Tarea por id, o `null`. Incluye las dadas de baja: el caso de uso decide qué hacer. */
  buscarPorId(id: string): Promise<TareaTicketEntity | null>;

  /** Inserta una tarea nueva. Falla si el id ya existe. */
  crear(tarea: TareaTicketEntity): Promise<void>;

  /** Persiste los cambios de una tarea existente (técnico, completado, baja lógica). */
  guardar(tarea: TareaTicketEntity): Promise<void>;

  /** Baja lógica por id: setea `deleted_at`. No borra la fila. */
  eliminar(id: string, ahora: Date): Promise<void>;

  /**
   * Tareas completadas en el período, agrupadas por quién las completó. Excluye las tareas dadas
   * de baja y las de tickets dados de baja. Ordenado por cantidad descendente.
   */
  contarCompletadasPorTecnico(
    filtro: FiltroCompletadasPorTecnico,
  ): Promise<CompletadasPorTecnico[]>;
}

/** Token de inyección de dependencias para ITareaTicketRepository en NestJS. */
export const TAREA_TICKET_REPOSITORY = Symbol('TAREA_TICKET_REPOSITORY');
