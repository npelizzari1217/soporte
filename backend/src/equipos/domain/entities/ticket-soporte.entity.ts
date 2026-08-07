import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketSoporteProps — shape de las propiedades del satélite de soporte IT.
 *
 * Satélite 1:0..1 de `Ticket` (Fase 2) para tickets de tipo SOPORTE.
 * `equipoId` es OPCIONAL (F3-Q4): un ticket de soporte puede no estar
 * vinculado a un equipo (ej. problemas de red/accesos).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4, F3-Q5. Tarea: T10.5.
 */
export interface TicketSoporteProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:0..1. */
  ticketId: string;
  /** FK opcional → equipos_informaticos.id. NULL = sin equipo asociado. */
  equipoId: string | null;
  descripcionProblema: string | null;
  /** NULL hasta que se registra la solución (F3-Q5). */
  solucionAplicada: string | null;
}

/**
 * TicketSoporteEntity — satélite 1:0..1 del ticket para el flujo SOPORTE IT
 * (F3-Q4, F3-Q5).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4, F3-Q5. Ref design: "Firmas
 * TS clave" (TicketSoporteEntity). Tarea: T10.5.
 */
export class TicketSoporteEntity extends BaseEntity<TicketSoporteProps> {
  private constructor(props: TicketSoporteProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para un nuevo `ticket_soporte`. `solucionAplicada` se
   * inicializa en `null` — se setea después vía `registrarSolucion()`.
   *
   * @param props.equipoId OPCIONAL (F3-Q4): `null` = ticket sin equipo asociado.
   */
  static create(
    props: { ticketId: string; equipoId: string | null; descripcionProblema?: string | null },
    id?: string,
  ): TicketSoporteEntity {
    return new TicketSoporteEntity(
      {
        ticketId: props.ticketId,
        equipoId: props.equipoId,
        descripcionProblema: props.descripcionProblema ?? null,
        solucionAplicada: null,
      },
      id,
    );
  }

  /** Reconstitución desde persistencia (mappers de infraestructura). */
  static reconstitute(
    props: TicketSoporteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketSoporteEntity {
    const entity = new TicketSoporteEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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

  /** Registra la solución aplicada al problema (F3-Q5). */
  registrarSolucion(solucion: string): void {
    this.props.solucionAplicada = solucion;
    this.touch();
  }

  /** Cambia (o quita, con `null`) el equipo asociado al ticket de soporte. */
  actualizarEquipo(equipoId: string | null): void {
    this.props.equipoId = equipoId;
    this.touch();
  }
}
