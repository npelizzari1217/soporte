import { TicketSoporteEntity } from '../entities/ticket-soporte.entity';

/**
 * ITicketSoporteRepository — puerto de persistencia para el satélite ticket_soporte.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:equipos/Tabla ticket_soporte, Satélite ticket_soporte]
 * Tarea: 6.A.3
 */
export interface ITicketSoporteRepository {
  /**
   * Busca el satélite ticket_soporte por el ID del ticket base.
   * Relación 1:1 garantizada por UNIQUE en DB.
   * Retorna null si no existe (ticket no es de tipo SOPORTE o satélite no creado).
   */
  findByTicketId(ticketId: string): Promise<TicketSoporteEntity | null>;

  /**
   * Busca un ticket_soporte por su identificador técnico propio (UUIDv7).
   * Retorna null si no existe.
   */
  findById(id: string): Promise<TicketSoporteEntity | null>;

  /**
   * Retorna todos los ticket_soporte que referencian un equipo específico.
   * Incluye registros no eliminados (deleted_at IS NULL).
   * Útil para ver el historial de tickets de un equipo.
   *
   * @param equipoId UUID del equipo informático.
   */
  findByEquipoId(equipoId: string): Promise<TicketSoporteEntity[]>;

  /**
   * Persiste el ticket_soporte (upsert: crea si no existe, actualiza si existe).
   * La creación se realiza en la misma transacción que el ticket base
   * (responsabilidad del use case con TenantTransactionRunner).
   */
  save(ticketSoporte: TicketSoporteEntity): Promise<void>;

  /**
   * Baja lógica del ticket_soporte (soft delete).
   * NO elimina la fila — setea deleted_at.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ITicketSoporteRepository en NestJS. */
export const TICKET_SOPORTE_REPOSITORY = Symbol('TICKET_SOPORTE_REPOSITORY');
