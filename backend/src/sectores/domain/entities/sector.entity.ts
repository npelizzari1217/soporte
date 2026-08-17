import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * SectorProps — shape de las propiedades del catálogo Sector (WU-04,
 * sdd/compras-tres-etapas-y-sectores). Calcado de `TipoTicketProps`: catálogo
 * editable por tenant, sin columnas color/orden.
 */
export interface SectorProps {
  codigo: string;
  nombre: string;
  activo: boolean;
}

/**
 * SectorEntity — entidad de dominio del catálogo de sectores de destino de
 * una compra (Computación, Librería, Mantenimiento edilicio, ...). Catálogo
 * EDITABLE por el ADMINISTRADOR del cliente, nace vacío (sin seed, ADR-T10).
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10. Ref design: ADR-T10.
 */
export class SectorEntity extends BaseEntity<SectorProps> {
  static create(props: SectorProps, id?: string): SectorEntity {
    return new SectorEntity(props, id);
  }

  static reconstitute(
    props: SectorProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): SectorEntity {
    const entity = new SectorEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  /**
   * Actualiza los campos editables (PATCH semántico — `undefined` no toca el
   * campo). La unicidad de `codigo` se valida en la capa de aplicación
   * (`EditarSectorUseCase`), no acá.
   */
  actualizar(datos: { codigo?: string; nombre?: string }): void {
    if (datos.codigo !== undefined) {
      this.props.codigo = datos.codigo;
    }
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    this.touch();
  }

  /** Da de baja el sector (soft delete) — no rompe compras existentes que lo referencian. */
  desactivar(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /** Reactiva un sector dado de baja. */
  activar(): void {
    this.props.activo = true;
    this._deletedAt = null;
    this.touch();
  }
}
