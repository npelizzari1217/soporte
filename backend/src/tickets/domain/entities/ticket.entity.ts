import { BaseEntity } from '../../../shared/domain/base-entity';
import { TituloInvalidoError } from '../errors/tickets.errors';

/**
 * Códigos de estado terminal: no admiten ninguna transición saliente.
 * Ref spec: [SPEC:tickets-core/Máquina de estados base]
 */
const TERMINAL_STATES = new Set<string>(['CERRADO', 'CANCELADO']);

/**
 * Campos editables del ticket vía PATCH.
 * `undefined` = no tocar; `null` = limpiar (solo campos nullable).
 * NOTA: `tipoId` está EXCLUIDO (locked decision L1 — número derivado del tipo original).
 */
export interface ActualizarDatosTicket {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  cicloId?: string | null;
}

/**
 * TicketProps — shape de las propiedades de dominio del Ticket.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * NORMALIZADO: el Ticket almacena solo `estadoId` (UUID FK → estados).
 * El código semántico del estado (ABIERTO, EN_PROGRESO, etc.) NO se guarda
 * en la entidad — se carga desde IEstadoRepository cuando se necesita
 * para lógica de dominio (state machine) o para `canTransitionTo()`.
 *
 * Nota sobre soft refs:
 * - solicitante_id, asignado_id: UUIDs de master.usuarios — sin FK cross-DB.
 *   Su integridad se valida en la capa de aplicación (caso de uso).
 */
export interface TicketProps {
  /** Número legible del ticket. Ej: "SOP-2026-00042". */
  numero: string;
  /** Título/resumen del ticket. */
  titulo: string;
  /** Descripción detallada (nullable). */
  descripcion: string | null;
  /** UUID del tipo de ticket (FK → tipos_ticket). */
  tipoId: string;
  /** UUID del estado actual (FK → estados). Una sola fuente de verdad. */
  estadoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del ciclo de cliente (FK → ciclos_cliente, nullable). */
  cicloId: string | null;
  /** Soft ref → master.usuarios.id. Sin FK cross-DB. */
  solicitanteId: string;
  /** Soft ref → master.usuarios.id. NULL = sin asignar. */
  asignadoId: string | null;
  /** Fecha de resolución del ticket (nullable). */
  fechaResolucion: Date | null;
}

/**
 * TicketEntity — entidad central del dominio.
 *
 * Representa un incidente, compra o reparación edilicia. Discriminado por
 * `tipoId` con tablas satélite 1:1 por flujo (ticket_compra, ticket_edilicia).
 *
 * Reglas de dominio:
 * - El estado inicial al crear DEBE ser ABIERTO (el use case pasa el estadoId
 *   correspondiente al estado con codigo='ABIERTO').
 * - assignTo() permite asignar o desasignar un responsable.
 * - canTransitionTo(desde, hacia) verifica invariantes de la entidad:
 *   soft-delete y estados terminales. La lógica de transición específica
 *   por tipo de ticket vive en ITicketStateMachine (3.B).
 * - solicitante_id y asignado_id son soft refs cross-DB (sin FK domain-level).
 *
 * Ref spec: [SPEC:tickets-core/Tabla tickets]
 * Tarea: 3.A.2
 */
export class TicketEntity extends BaseEntity<TicketProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * El use case debe proveer el estadoId del estado con codigo='ABIERTO'.
   */
  static create(props: TicketProps, id?: string): TicketEntity {
    return new TicketEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TicketProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketEntity {
    const entity = new TicketEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get numero(): string {
    return this.props.numero;
  }

  get titulo(): string {
    return this.props.titulo;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get tipoId(): string {
    return this.props.tipoId;
  }

  get estadoId(): string {
    return this.props.estadoId;
  }

  get prioridadId(): string {
    return this.props.prioridadId;
  }

  get cicloId(): string | null {
    return this.props.cicloId;
  }

  get solicitanteId(): string {
    return this.props.solicitanteId;
  }

  get asignadoId(): string | null {
    return this.props.asignadoId;
  }

  get fechaResolucion(): Date | null {
    return this.props.fechaResolucion;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Asigna o reasigna el ticket a un responsable.
   * Pasar null para desasignar.
   *
   * La validación de elegibilidad (usuario_tipos_ticket) ocurre en el caso de uso
   * AsignarTicketUseCase, no en la entidad.
   */
  assignTo(usuarioId: string | null): void {
    this.props.asignadoId = usuarioId;
  }

  /**
   * Actualiza el estadoId del ticket.
   * Llamado por el caso de uso de transición DESPUÉS de validar con la máquina de estados.
   */
  updateEstado(estadoId: string): void {
    this.props.estadoId = estadoId;
  }

  /**
   * Partial update de campos de datos. Semántica: undefined=no tocar, null=limpiar.
   * Lanza TituloInvalidoError si titulo viene definido pero es vacío tras trim().
   * Actualiza updatedAt al momento de la mutación.
   */
  updateDatos(datos: ActualizarDatosTicket): void {
    if (datos.titulo !== undefined) {
      if (datos.titulo.trim() === '') throw new TituloInvalidoError();
      this.props.titulo = datos.titulo;
    }
    if (datos.descripcion !== undefined) this.props.descripcion = datos.descripcion;
    if (datos.prioridadId !== undefined) this.props.prioridadId = datos.prioridadId;
    if (datos.cicloId !== undefined) this.props.cicloId = datos.cicloId;
    this.touch();
  }

  /**
   * Invariante de editabilidad: el ticket puede ser editado solo si no está
   * soft-deleted y su estado actual no es terminal (CERRADO/CANCELADO).
   *
   * El use case carga el código del estado vía IEstadoRepository y lo pasa aquí.
   * Espejo de canTransitionTo, separado por responsabilidad.
   *
   * @param estadoActualCodigo Código semántico del estado actual (ej. "ABIERTO").
   */
  canEdit(estadoActualCodigo: string): boolean {
    if (this.isDeleted()) return false;
    if (TERMINAL_STATES.has(estadoActualCodigo)) return false;
    return true;
  }

  /**
   * Verifica si el ticket puede iniciar una transición de estado,
   * dado el código del estado actual y el código del estado destino.
   *
   * Esta es la verificación de INVARIANTES DE LA ENTIDAD:
   * - Tickets soft-deleted no pueden transicionar.
   * - Tickets en estados terminales (CERRADO, CANCELADO) no pueden transicionar.
   *
   * El uso case carga `desdeEstadoCodigo` desde IEstadoRepository y lo pasa aquí.
   * La validación completa de si la transición específica (desde → hacia) es legal
   * para el tipo de ticket es responsabilidad de ITicketStateMachine (Tarea 3.B).
   *
   * @param desdeEstadoCodigo Código semántico del estado actual (ej. "ABIERTO").
   * @param haciaEstadoCodigo Código semántico del estado destino (ej. "EN_PROGRESO").
   */
  canTransitionTo(desdeEstadoCodigo: string, _haciaEstadoCodigo: string): boolean {
    if (this.isDeleted()) {
      return false;
    }
    if (TERMINAL_STATES.has(desdeEstadoCodigo)) {
      return false;
    }
    return true;
  }
}
