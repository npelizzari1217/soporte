import { BaseEntity } from '../../../shared/domain/base-entity';
import { Modulo } from '../../../shared/domain/modulos';

/**
 * TipoTicketProps — shape de las propiedades del catálogo TipoTicket.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * A diferencia de Estado/Prioridad, `tipos_ticket` NO tiene columnas
 * color/orden en el schema real (`prisma_tenant/schema.prisma`) — el
 * discriminador de flujo es `codigo`, y `modulo` (B2) define el módulo
 * funcional dueño del tipo (separación estricta: exactamente uno).
 */
export interface TipoTicketProps {
  codigo: string;
  nombre: string;
  modulo: Modulo;
  activo: boolean;
}

/**
 * TipoTicketEntity — entidad de dominio del catálogo EDITABLE de tipos de
 * ticket (spec T2). Base sembrada en provisioning (SOPORTE, COMPRAS,
 * EDILICIA, MANTENIMIENTO) + altas custom del ADMINISTRADOR del tenant (PR11,
 * ADR-2: `cliente:gestionar`, salvo que el dueño confirme `catalogo:gestionar`
 * dedicado). Dar de baja (soft delete) NO rompe tickets existentes que lo
 * referencian (spec T2) — solo se oculta de nuevas altas.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T2.1
 */
export class TipoTicketEntity extends BaseEntity<TipoTicketProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: TipoTicketProps, id?: string): TipoTicketEntity {
    return new TipoTicketEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TipoTicketProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TipoTicketEntity {
    const entity = new TipoTicketEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get modulo(): Modulo {
    return this.props.modulo;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio (T2, CRUD editable — PR11) ────────────────

  /**
   * Actualiza los campos editables del catálogo (T2): `codigo`, `nombre`.
   * La unicidad de `codigo` y la colisión de prefijo derivado (ADR-4) se
   * validan en la capa de aplicación (`EditarTipoTicketUseCase`), no acá —
   * la entidad solo aplica la mutación.
   *
   * Campos `undefined` NO se tocan (PATCH semántico).
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
   */
  actualizar(datos: { codigo?: string; nombre?: string; modulo?: Modulo }): void {
    if (datos.codigo !== undefined) {
      this.props.codigo = datos.codigo;
    }
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.modulo !== undefined) {
      this.props.modulo = datos.modulo;
    }
    this.touch();
  }

  /**
   * Da de baja el tipo de ticket (T2): soft delete (`deletedAt`) + setea
   * `activo=false`. NO rompe tickets existentes que lo referencian — solo
   * se oculta de nuevas altas (`findAllActive` filtra por `deletedAt`).
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
   */
  desactivar(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /**
   * Reactiva el tipo de ticket dado de baja: limpia `deletedAt` y setea
   * `activo=true`. Vuelve a estar disponible para nuevas altas.
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
   */
  activar(): void {
    this.props.activo = true;
    this._deletedAt = null;
    this.touch();
  }
}
