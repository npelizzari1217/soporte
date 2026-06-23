import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketSoporteProps — shape de las propiedades del satélite de soporte/IT.
 *
 * Entidad 1:1 con Ticket para tickets de tipo SOPORTE.
 * Referencia opcionalmente el equipo afectado.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:equipos/Tabla ticket_soporte]
 * Tarea: 6.A.2
 */
export interface TicketSoporteProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:1 garantizada por UNIQUE en DB. */
  ticketId: string;
  /**
   * UUID del equipo afectado (FK → equipos_informaticos.id).
   * NULLABLE: un ticket de soporte puede no referir a un equipo específico
   * (ej. problema de red, acceso a sistema, etc.).
   * La existencia y actividad del equipo se valida en la capa de aplicación
   * (CrearTicketSoporteUseCase) cuando se provee el ID.
   */
  equipoId: string | null;
  /** Descripción técnica del problema detectado en el equipo. */
  descripcionProblema: string | null;
  /** Solución técnica aplicada al cerrar el ticket. */
  solucionAplicada: string | null;
}

/**
 * TicketSoporteEntity — satélite 1:1 del ticket para el flujo SOPORTE/IT.
 *
 * Agrega información específica de soporte informático:
 * - Equipo afectado (opcional — puede ser null).
 * - Descripción técnica del problema.
 * - Solución aplicada al resolver.
 *
 * Reglas de dominio:
 * - equipo_id es nullable: un ticket de soporte puede no estar asociado a un equipo.
 * - La validación de existencia/actividad del equipo ocurre en CrearTicketSoporteUseCase.
 * - registrarSolucion(): registra la solución técnica aplicada (llamado al cerrar el ticket).
 *
 * Ref spec: [SPEC:equipos/Satélite ticket_soporte, equipo_id nullable]
 * Tarea: 6.A.2
 */
export class TicketSoporteEntity extends BaseEntity<TicketSoporteProps> {
  /**
   * Factory method para un nuevo ticket_soporte.
   *
   * @param ticketId  UUID del ticket base al que pertenece.
   * @param equipoId  UUID del equipo afectado, o null si no aplica.
   * @param id        UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(ticketId: string, equipoId: string | null, id?: string): TicketSoporteEntity {
    return new TicketSoporteEntity(
      {
        ticketId,
        equipoId,
        descripcionProblema: null,
        solucionAplicada: null,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TicketSoporteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketSoporteEntity {
    const entity = new TicketSoporteEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get equipoId(): string | null {
    return this.props.equipoId;
  }

  get descripcionProblema(): string | null {
    return this.props.descripcionProblema;
  }

  get solucionAplicada(): string | null {
    return this.props.solucionAplicada;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Registra la solución técnica aplicada al resolver el problema.
   * Llamado por el use case al cerrar o resolver el ticket.
   *
   * @param solucion Descripción de la solución aplicada.
   */
  registrarSolucion(solucion: string): void {
    this.props.solucionAplicada = solucion;
  }

  /**
   * Actualiza el equipo asociado al ticket.
   * Permite cambiar el equipo referenciado o desasociarlo (null).
   *
   * La validación de existencia/actividad del equipo es responsabilidad
   * del use case correspondiente.
   *
   * @param equipoId UUID del equipo, o null para desasociar.
   */
  actualizarEquipo(equipoId: string | null): void {
    this.props.equipoId = equipoId;
  }
}
