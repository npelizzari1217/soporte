import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * Estados sin arcos de salida (ADR-3): una vez alcanzados, el ticket no
 * puede transicionar a ningún otro estado. RESUELTO NO es terminal: tiene
 * un arco de salida válido hacia CERRADO.
 */
const TERMINAL_STATES = new Set<string>(['CERRADO', 'CANCELADO']);

/**
 * TicketProps — shape completo de las propiedades de dominio del Ticket
 * (usado por getters y `reconstitute`). Sin imports de Prisma ni NestJS —
 * dominio puro.
 *
 * Nota sobre soft refs cross-DB:
 * - solicitanteId, asignadoId: UUIDs de master.usuarios, sin FK. Su
 *   integridad se valida en la capa de aplicación (IUsuarioMasterChecker).
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
  /** UUID del estado actual (FK → estados). Única fuente de verdad. */
  estadoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del ciclo de cliente (FK → ciclos_cliente, nullable). */
  cicloId: string | null;
  /** Self-FK nullable → tickets.id. "Este ticket continúa de #X". */
  ticketReferenciaId: string | null;
  /** Soft ref → master.usuarios.id. Sin FK cross-DB. */
  solicitanteId: string;
  /** Soft ref → master.usuarios.id. NULL = sin asignar. */
  asignadoId: string | null;
  /** Calculado por el módulo SLA (Fase 4). NULL = sin SLA aplicable/calculado aún. */
  slaVenceAt: Date | null;
  /** Desnormalizado — recalculado por el módulo SLA (Fase 4). */
  vencido: boolean;
  /** Fecha de cierre. Seteada por el use case al transicionar a RESUELTO/CERRADO (T12). */
  fechaCierre: Date | null;
}

/**
 * CrearTicketProps — subconjunto de `TicketProps` aceptado por
 * `TicketEntity.create()`. Excluye deliberadamente `asignadoId`,
 * `slaVenceAt`, `vencido` y `fechaCierre`: son invariantes de creación
 * (siempre `null`/`false`), no parámetros de entrada — spec T4.
 */
export type CrearTicketProps = Omit<
  TicketProps,
  'asignadoId' | 'slaVenceAt' | 'vencido' | 'fechaCierre'
>;

/**
 * TicketEntity — entidad central del dominio "tickets".
 *
 * Reglas de dominio (Fase 2):
 * - El estado inicial lo resuelve el caller (use case, pasa el estadoId
 *   del estado con codigo='NUEVO'); la entidad no lo hardcodea.
 * - `create()` fuerza `asignadoId=null`, `slaVenceAt=null`, `vencido=false`
 *   y `fechaCierre=null`: son invariantes de un ticket recién creado (T4).
 * - `canTransitionTo()` valida invariantes de la ENTIDAD (soft-delete,
 *   estado actual terminal). La validación completa del grafo de 6 estados
 *   por tipo vive en `ITicketStateMachine` (PR4, ADR-3).
 *
 * Ref spec: sdd/tickets-core/spec T4, T9, T11, T12. Ref design: ADR-3, ADR-4.
 * Tarea: T3.3, T3.4.
 */
export class TicketEntity extends BaseEntity<TicketProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * El use case debe proveer el estadoId del estado con codigo='NUEVO'
   * (T4). `asignadoId`, `slaVenceAt`, `vencido` y `fechaCierre` se fuerzan
   * a sus valores iniciales — no son parte de `CrearTicketProps`.
   *
   * @param props Propiedades de creación del ticket (sin asignadoId/slaVenceAt/vencido/fechaCierre).
   * @param id    ID opcional (UUIDv7 generado si no se provee).
   */
  static create(props: CrearTicketProps, id?: string): TicketEntity {
    return new TicketEntity(
      { ...props, asignadoId: null, slaVenceAt: null, vencido: false, fechaCierre: null },
      id,
    );
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
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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

  get ticketReferenciaId(): string | null {
    return this.props.ticketReferenciaId;
  }

  get solicitanteId(): string {
    return this.props.solicitanteId;
  }

  get asignadoId(): string | null {
    return this.props.asignadoId;
  }

  get slaVenceAt(): Date | null {
    return this.props.slaVenceAt;
  }

  get vencido(): boolean {
    return this.props.vencido;
  }

  get fechaCierre(): Date | null {
    return this.props.fechaCierre;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Asigna o reasigna el ticket a un responsable. Pasar `null` desasigna.
   * La validación de elegibilidad (por el módulo del catálogo del tipo) y de
   * existencia cross-DB ocurre en `AsignarTicketUseCase` (PR8), no en la entidad.
   */
  assignTo(usuarioId: string | null): void {
    this.props.asignadoId = usuarioId;
    this.touch();
  }

  /**
   * Actualiza el `estadoId` del ticket. Llamado por
   * `TransicionarEstadoUseCase` DESPUÉS de validar con `canTransitionTo`
   * y `ITicketStateMachine` (PR7).
   */
  updateEstado(estadoId: string): void {
    this.props.estadoId = estadoId;
    this.touch();
  }

  /**
   * Setea la fecha de cierre. Llamado al pasar a RESUELTO/CERRADO (T12).
   * `null` limpia la fecha (uso interno/tests).
   */
  setFechaCierre(fecha: Date | null): void {
    this.props.fechaCierre = fecha;
    this.touch();
  }

  /**
   * Actualiza los campos editables de datos del ticket (T8): `titulo`,
   * `descripcion`, `prioridadId`. El `estado` NUNCA se muta por esta vía —
   * es una transición (T9, `updateEstado`), no una edición de datos.
   *
   * Campos `undefined` NO se tocan (PATCH semántico); `descripcion: null`
   * limpia el valor explícitamente.
   *
   * Ref spec: sdd/tickets-core/spec T8. Tarea: T6.5.
   */
  actualizarDatos(datos: {
    titulo?: string;
    descripcion?: string | null;
    prioridadId?: string;
  }): void {
    if (datos.titulo !== undefined) {
      this.props.titulo = datos.titulo;
    }
    if (datos.descripcion !== undefined) {
      this.props.descripcion = datos.descripcion;
    }
    if (datos.prioridadId !== undefined) {
      this.props.prioridadId = datos.prioridadId;
    }
    this.touch();
  }

  /**
   * Verifica los invariantes de la ENTIDAD para iniciar una transición:
   * - Un ticket soft-deleted no puede transicionar.
   * - Un ticket en estado terminal (CERRADO/CANCELADO) no puede
   *   transicionar (sin reapertura — T11).
   *
   * NO valida si el arco `desde → hacia` específico es legal: esa
   * responsabilidad es de `ITicketStateMachine` (PR4), que compone con
   * este chequeo en `TransicionarEstadoUseCase` (PR7).
   *
   * @param desdeEstadoCodigo Código semántico del estado actual (ej. "NUEVO").
   * @param _haciaEstadoCodigo Código semántico del estado destino (no usado a este nivel).
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
