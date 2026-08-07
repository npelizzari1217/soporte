import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TipoOperacionProps — shape de las propiedades del catálogo TipoOperacion.
 * Sin imports de Prisma ni NestJS — dominio puro. Sin columnas color/orden
 * en el schema real (idéntica forma a TipoTicketProps).
 */
export interface TipoOperacionProps {
  codigo: string;
  nombre: string;
  activo: boolean;
}

/**
 * TipoOperacionEntity — entidad de dominio del catálogo FIJO de 5 tipos de
 * evento registrables en el timeline de un ticket (CAMBIO_ESTADO, COMENTARIO,
 * ASIGNACION, ADJUNTO, AVANCE_EDILICIO). Sembrado en provisioning por
 * `TenantSeederAdapter` (Fase 1).
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1
 */
export class TipoOperacionEntity extends BaseEntity<TipoOperacionProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: TipoOperacionProps, id?: string): TipoOperacionEntity {
    return new TipoOperacionEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TipoOperacionProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TipoOperacionEntity {
    const entity = new TipoOperacionEntity(props, id);
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

  get activo(): boolean {
    return this.props.activo;
  }
}
