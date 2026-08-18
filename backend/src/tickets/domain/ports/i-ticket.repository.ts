import { TicketEntity } from '../entities/ticket.entity';

/**
 * TicketFiltros — filtros opcionales combinables (AND) para
 * `ITicketRepository.findAll`. Omitir un campo = no filtrar por él.
 *
 * Ampliado respecto a la referencia probada (soporte1) con `estadoId`,
 * `asignadoId` y `soloSolicitante` (T7 — scope por rol y filtros de la
 * lista de tickets).
 *
 * Ref spec: sdd/tickets-core/spec T7. Ref design: "Firmas TS clave".
 * Tarea: T3.7.
 */
export interface TicketFiltros {
  /** UUID de estado exacto. */
  estadoId?: string;
  /** UUIDs de tipos de ticket; vacío/undefined = todos los tipos. */
  tiposIds?: string[];
  /** UUID de prioridad exacta. */
  prioridadId?: string;
  /** UUID del usuario asignado. */
  asignadoId?: string;
  /**
   * Término de búsqueda de texto libre. Filtra por coincidencia
   * case-insensitive (`ILIKE %term%`) en `titulo` OR `descripcion`.
   * Los comentarios del timeline NO se indexan (B1, PR-B). Vacío/undefined =
   * sin filtro de texto.
   */
  busqueda?: string;
  /**
   * UUID del solicitante al que se restringe el listado. Lo deriva
   * `ListarTicketsUseCase` del actor cuando NO tiene `ticket:ver_todos`
   * (T7). `undefined` = sin restricción de solicitante (requiere
   * `ver_todos`).
   */
  soloSolicitante?: string;
  /** Límite inferior del rango (inclusive), sobre created_at. */
  fechaDesde?: Date;
  /** Límite superior del rango (inclusive), sobre created_at. */
  fechaHasta?: Date;
  /**
   * UUID de `ciclos_cliente`. El caller resuelve este valor: cicloId
   * explícito (histórico) o el ciclo ACTIVO por default (T7).
   */
  cicloId?: string;
  /** Paginación: cantidad máxima de filas a retornar. `undefined` = sin límite. */
  limit?: number;
  /** Paginación: cantidad de filas a saltear. `undefined` = 0. */
  offset?: number;
}

/**
 * ITicketRepository — puerto de persistencia para la entidad Ticket.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta (`PrismaTicketRepository`, PR5) obtiene su
 * PrismaClient desde `TenantContext.getClient()`.
 *
 * Ref spec: sdd/tickets-core/spec (Área B, T4-T8). Ref design: "Firmas TS
 * clave", ADR-5 (concurrencia de `numero`). Tarea: T3.7.
 */
export interface ITicketRepository {
  /**
   * Busca un ticket por su identificador técnico (UUIDv7).
   * Retorna null si no existe. Incluye tickets soft-deleted.
   */
  findById(id: string): Promise<TicketEntity | null>;

  /**
   * Versión POR LOTE de `findById`: resuelve VARIOS tickets de una sola vez y
   * devuelve `Map<id, ticket>`. Igual que `findById`, incluye soft-deleted.
   *
   * POR LOTE A PROPÓSITO: la usan los listados que resuelven el ticket base de
   * un satélite (hoy `ListarReparacionesUseCase`). Con `findById` dentro del
   * loop, esa resolución costaba una consulta por fila; con esta cuesta UNA,
   * sin importar el tamaño de la página.
   *
   * `Map` y no `TicketEntity[]`: el consumidor siempre necesita el acceso por
   * id (es un join en memoria contra el satélite dueño del `ticketId`), y una
   * lista lo obligaría a recorrerla por cada fila — un O(n²) que sólo cambia
   * consultas por CPU. El Map además hace explícita la ausencia sin pedir un
   * hueco `null` en la lista.
   *
   * Los ids sin ticket NO aparecen en el Map: la ausencia es el `null` que
   * devolvía `findById`. Con `ids` vacío no consulta nada y devuelve un Map
   * vacío.
   */
  findByIds(ids: string[]): Promise<Map<string, TicketEntity>>;

  /**
   * Busca un ticket por su número legible (ej. "SOP-2026-00042").
   * Retorna null si no existe.
   */
  findByNumero(numero: string): Promise<TicketEntity | null>;

  /**
   * Retorna el último número de secuencia LOCAL (tenant+tipo+año) para el
   * `tipoId` y `anio` dados. Usado por `NumeradorTicket.generarNumero`.
   * Retorna 0 si no hay tickets previos de ese tipo en ese año.
   */
  findLastSecuencia(tipoId: string, anio: number): Promise<number>;

  /**
   * Retorna los tickets del tenant activo que cumplen los filtros
   * combinables (AND), ordenados por `created_at DESC`. Excluye
   * soft-deleted. `filtros.limit`/`filtros.offset` aplican paginación
   * (T7 — `ListarTicketsUseCase`).
   */
  findAll(filtros?: TicketFiltros): Promise<TicketEntity[]>;

  /**
   * Retorna la cantidad total de tickets que cumplen los filtros
   * combinables (AND), IGNORANDO `limit`/`offset` (cuenta el total real
   * para metadata de paginación, T7).
   */
  count(filtros?: TicketFiltros): Promise<number>;

  /**
   * Persiste el ticket (upsert: crea si no existe, actualiza si existe).
   * El repositorio decide INSERT vs UPDATE según el id.
   */
  save(ticket: TicketEntity): Promise<void>;

  /**
   * Baja lógica: setea `deleted_at`. NO elimina la fila.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ITicketRepository en NestJS. */
export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');
