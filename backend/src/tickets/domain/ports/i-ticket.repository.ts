import { TicketEntity } from '../entities/ticket.entity';

/**
 * Filtros opcionales para la consulta de tickets.
 * Todos los campos son opcionales; omitir un campo = no filtrar por él.
 */
export interface TicketFiltros {
  /** UUIDs de tipos de ticket; vacío/undefined = todos los tipos. */
  tiposIds?: string[];
  /** Límite inferior del rango (inclusive), sobre created_at (start-of-day). */
  fechaDesde?: Date;
  /** Límite superior del rango (inclusive), sobre created_at (end-of-day). */
  fechaHasta?: Date;
  /**
   * UUID de ciclos_cliente (Fase 4, ADR-5). El caller (ListarTicketsUseCase)
   * resuelve este valor: cicloId explícito (histórico) o el ciclo ACTIVO por
   * default. undefined/omitido = no filtrar por ciclo (uso interno del repo).
   */
  cicloId?: string;
}

/**
 * ITicketRepository — puerto de persistencia para la entidad Ticket.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * Los repositorios tenant obtienen su PrismaClient desde TenantContext.
 *
 * Ref spec: [SPEC:tickets-core/Tabla tickets]
 * Tarea: 3.A.3
 */
export interface ITicketRepository {
  /**
   * Busca un ticket por su identificador técnico (UUIDv7).
   * Retorna null si no existe. Incluye tickets soft-deleted.
   */
  findById(id: string): Promise<TicketEntity | null>;

  /**
   * Busca un ticket por su número legible (ej. "SOP-2026-00042").
   * Retorna null si no existe.
   */
  findByNumero(numero: string): Promise<TicketEntity | null>;

  /**
   * Retorna el último número de secuencia para un tipo de ticket y año dados.
   * Usado por NumeradorTicket para generar el siguiente número.
   * Retorna 0 si no hay tickets previos.
   */
  findLastSecuencia(tipoId: string, anio: number): Promise<number>;

  /**
   * Retorna todos los tickets del tenant activo con filtros opcionales.
   * Orden: createdAt DESC, luego por nombre de tipo ASC (alfabético).
   * Excluye tickets soft-deleted.
   *
   * @param filtros - Filtros opcionales de tipo, fechaDesde y fechaHasta.
   */
  findAll(filtros?: TicketFiltros): Promise<TicketEntity[]>;

  /**
   * Retorna los tickets en un estado dado (para listados filtrados).
   * Excluye tickets soft-deleted.
   */
  findByEstado(estadoId: string): Promise<TicketEntity[]>;

  /**
   * Persiste el ticket (upsert: crea si no existe, actualiza si existe).
   * El repositorio decide si es INSERT o UPDATE según el id.
   */
  save(ticket: TicketEntity): Promise<void>;

  /**
   * Baja lógica: setea deleted_at. NO elimina la fila.
   * Para la baja real, usar TicketEntity.softDelete() + save().
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ITicketRepository en NestJS. */
export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');
