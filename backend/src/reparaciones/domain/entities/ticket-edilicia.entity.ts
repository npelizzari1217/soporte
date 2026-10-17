import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * Tope de largo de `ubicacion`, espejando `ticketsEdilicia.ubicacion`
 * `VarChar(255)` (`prisma_tenant/schema.prisma`).
 *
 * Vive ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `reparaciones.dto.ts` lo
 * importa de este módulo para que el 400 amable del borde y la precondición del
 * dominio no puedan divergir. Mismo criterio que `equipo-informatico.entity.ts`.
 *
 * `ubicacion` es texto libre y NO se normaliza en ningún borde, así que estamos
 * en la rama 1 de la "regla de tres ramas": el borde mide exactamente el mismo
 * string que mide el dominio y alcanza un `throw` plano. Si alguna vez se le
 * agrega una normalización que pueda AGRANDAR el largo, este guard pasa a rama
 * 3 y el borde tiene que normalizar antes de medir.
 */
export const TICKET_EDILICIA_UBICACION_MAX_LENGTH = 255;

/**
 * Precondición de largo de `ubicacion`. NO se aplica en `reconstitute()`: una
 * fila que ya existe se lee, no se revalida — hacer explotar una lectura por un
 * valor histórico convertiría un dato viejo en una caída de sistema.
 */
function validarLargoUbicacion(ubicacion?: string | null): void {
  if (ubicacion != null && ubicacion.length > TICKET_EDILICIA_UBICACION_MAX_LENGTH) {
    throw new Error(
      `TicketEdiliciaEntity: ubicacion excede ${TICKET_EDILICIA_UBICACION_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * TicketEdiliciaProps — shape de las propiedades del satélite de reparaciones
 * edilicias. Satélite 1:0..1 de `Ticket` (Fase 2) para tickets de tipo
 * EDILICIA. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * El avance ya no vive acá: se calcula al leer sobre las tareas del ticket
 * (`calcularAvanceTareas`). `personalAsignadoId` y `porcentajeAvance` se
 * retiraron en odd/tareas-con-tecnico T8.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export interface TicketEdiliciaProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:0..1. */
  ticketId: string;
  /** Ubicación física donde ocurre la reparación (texto libre, opcional). */
  ubicacion: string | null;
}

/**
 * TicketEdiliciaEntity — satélite 1:0..1 del ticket para el flujo EDILICIA.
 *
 * Reglas de dominio (F3-E1):
 * - Este satélite no decide el estado del ticket. El ADR-2 original ("completar la
 *   última tarea NO resuelve el ticket") quedó revertido el 2026-10-16 por decisión
 *   del dueño (odd/estado-por-tareas): ahora el estado sigue a las tareas, para todo
 *   tipo de ticket, desde el núcleo de tickets (`estado-por-tareas.policy.ts`), sin
 *   acoplar el core a este satélite.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * ADR-2, "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export class TicketEdiliciaEntity extends BaseEntity<TicketEdiliciaProps> {
  private constructor(props: TicketEdiliciaProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva instancia de `ticket_edilicia`.
   *
   * @param props `ticketId` y `ubicacion` opcional.
   * @param id    UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   */
  static create(
    props: { ticketId: string; ubicacion?: string | null },
    id?: string,
  ): TicketEdiliciaEntity {
    validarLargoUbicacion(props.ubicacion);
    return new TicketEdiliciaEntity(
      {
        ticketId: props.ticketId,
        ubicacion: props.ubicacion ?? null,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TicketEdiliciaProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketEdiliciaEntity {
    const entity = new TicketEdiliciaEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get ubicacion(): string | null {
    return this.props.ubicacion;
  }
}
