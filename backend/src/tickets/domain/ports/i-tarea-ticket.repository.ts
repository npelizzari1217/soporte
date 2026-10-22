import { AlcanceListadoTickets } from './i-ticket.repository';
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
  /**
   * Solo tareas de tickets que el actor ve (odd/permisos-por-tipo-ticket, D5 e), con la misma regla
   * que el listado. Ausente = sin restricción (ROOT y ADMINISTRADOR).
   */
  alcance?: AlcanceListadoTickets;
}

/** Cantidad de tareas completadas por un usuario en el período. */
export interface CompletadasPorTecnico {
  completadaPorId: string;
  completadas: number;
}

/**
 * Condición extra de la escritura de completar o descompletar (T13, JD-S2): la tarea tiene que
 * seguir asignada a `tecnicoId`. La pone el caso de uso cuando el actor tiene permiso solo por ser
 * el técnico de la tarea; sin `tecnicoId`, el técnico no condiciona.
 */
export interface CondicionDeCompletado {
  tecnicoId?: string;
}

/**
 * Condición extra de la escritura de descompletar (T13, JD-S1): además del técnico, la tarea tiene
 * que seguir con el completado que el caso de uso leyó. Si en el medio alguien la descompletó y
 * otro la volvió a completar, `completada` vuelve a ser `true` pero el completado es otro, y
 * descompletarlo borraría una completación que el actor nunca vio.
 *
 * `completadaEn` es el instante leído, con la precisión de milisegundos de `Date`: la
 * implementación lo compara contra el milisegundo entero, porque una fila escrita fuera de la
 * aplicación puede tener microsegundos.
 */
export interface CondicionDeDescompletado extends CondicionDeCompletado {
  completadoLeido?: { completadaPorId: string; completadaEn: Date };
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

  /*
   * Escrituras condicionadas (T10, JD-W1). Los casos de uso cargan la tarea fuera de la
   * transacción, así que cada escritura exige en el `WHERE` el estado que el caso de uso validó y
   * escribe solo los campos de su operación. Devuelven `false` si la fila ya no cumple esa
   * condición (otra acción la cambió en el medio) y en ese caso no escriben nada: el caso de uso
   * relee la tarea y responde con el error de dominio del estado actual.
   */

  /**
   * Persiste el completado (`completada`, `completadaEn`, `completadaPorId`) solo si la tarea
   * sigue activa y pendiente, y además cumple `condicion` (T13).
   */
  completarSiPendiente(
    tarea: TareaTicketEntity,
    condicion?: CondicionDeCompletado,
  ): Promise<boolean>;

  /**
   * Limpia el completado solo si la tarea sigue activa y completada, y además cumple `condicion`
   * (T13).
   */
  descompletarSiCompletada(
    tarea: TareaTicketEntity,
    condicion?: CondicionDeDescompletado,
  ): Promise<boolean>;

  /**
   * Persiste el técnico solo si la tarea sigue activa. No toca el completado: una asignación que
   * corre a la par de un completado no lo borra.
   */
  asignarTecnicoSiActiva(tarea: TareaTicketEntity): Promise<boolean>;

  /** Persiste la baja lógica solo si la tarea sigue activa. Conserva quién la completó. */
  darDeBajaSiActiva(tarea: TareaTicketEntity): Promise<boolean>;

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
