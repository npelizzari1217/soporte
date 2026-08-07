import { TipoTicketEntity } from '../entities/tipo-ticket.entity';

/**
 * ITipoTicketRepository — puerto de acceso al catálogo EDITABLE de tipos de
 * ticket del tenant (spec T2). Usado por CrearTicketUseCase (PR6),
 * NumeradorTicket (ADR-4, resuelve prefijo por código) y CatalogosController
 * (CRUD, PR11).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T2.1/T2.3
 */
export interface ITipoTicketRepository {
  /**
   * Busca un tipo de ticket por su identificador técnico (UUID). Retorna
   * null si no existe (incl. soft-deleted — no rompe tickets existentes,
   * pero no es válido para NUEVAS altas, spec T2/T4).
   *
   * Usado por `CrearTicketUseCase` (PR6, T4) para validar `tipoId` y
   * resolver el `codigo` que necesita `NumeradorTicket` (ADR-4).
   */
  findById(id: string): Promise<TipoTicketEntity | null>;

  /**
   * Busca un tipo de ticket por su código semántico (ej. "SOPORTE").
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<TipoTicketEntity | null>;

  /**
   * Retorna el UUID de un tipo de ticket dado su código semántico, sin
   * hidratar la entidad completa. Retorna null si el código no existe.
   */
  findIdByCodigo(codigo: string): Promise<string | null>;

  /**
   * Retorna todos los tipos de ticket activos (no soft-deleted) del tenant.
   */
  findAllActive(): Promise<TipoTicketEntity[]>;

  /**
   * Persiste un `TipoTicketEntity` (upsert por id: INSERT si es nuevo,
   * UPDATE si ya existe). Usado por el CRUD editable (T2, PR11):
   * crear/editar/dar de baja/reactivar.
   */
  save(tipo: TipoTicketEntity): Promise<void>;
}

/** Token de inyección de dependencias para ITipoTicketRepository en NestJS. */
export const TIPO_TICKET_REPOSITORY = Symbol('TIPO_TICKET_REPOSITORY');
