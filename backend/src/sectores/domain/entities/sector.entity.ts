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
 * Topes de largo, espejando `sectores.codigo VarChar(50)` y
 * `sectores.nombre VarChar(100)` (`prisma_tenant/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. El DTO los importa de
 * este módulo para que el 400 amable del borde y la precondición del dominio
 * no puedan divergir.
 */
export const SECTOR_CODIGO_MAX_LENGTH = 50;
export const SECTOR_NOMBRE_MAX_LENGTH = 100;

/**
 * Precondición de largo. Va como `throw` y no como `Result` porque un
 * primitivo fuera de rango llegando a la entidad es una violación de contrato
 * del caller, no una desviación de negocio que el usuario deba ver.
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en una
 * caída de sistema.
 */
function validarLargos(codigo?: string, nombre?: string): void {
  if (codigo !== undefined && codigo.length > SECTOR_CODIGO_MAX_LENGTH) {
    throw new Error(`SectorEntity: codigo excede ${SECTOR_CODIGO_MAX_LENGTH} caracteres.`);
  }
  if (nombre !== undefined && nombre.length > SECTOR_NOMBRE_MAX_LENGTH) {
    throw new Error(`SectorEntity: nombre excede ${SECTOR_NOMBRE_MAX_LENGTH} caracteres.`);
  }
}

/**
 * SectorEntity — entidad de dominio del catálogo de sectores de destino de
 * una compra (Computación, Librería, Mantenimiento edilicio, ...). Catálogo
 * EDITABLE por el ADMINISTRADOR del cliente, nace vacío (sin seed, ADR-T10).
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10. Ref design: ADR-T10.
 */
export class SectorEntity extends BaseEntity<SectorProps> {
  /**
   * Crea un sector nuevo, validando la precondición de largo.
   *
   * @param props Código, nombre y estado del sector.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La entidad creada.
   * @throws Error si `codigo` o `nombre` exceden el tope de su columna.
   */
  static create(props: SectorProps, id?: string): SectorEntity {
    validarLargos(props.codigo, props.nombre);
    return new SectorEntity(props, id);
  }

  /**
   * Rehidrata un sector desde persistencia, preservando id y timestamps.
   *
   * NO valida largos a propósito: la fila ya existe en la base, y hacer
   * explotar una lectura por un valor histórico convertiría un dato viejo en
   * una caída de sistema.
   *
   * @param props Código, nombre y estado leídos de la base.
   * @param id Id persistido.
   * @param createdAt Alta original.
   * @param updatedAt Última modificación.
   * @param deletedAt Fecha de baja lógica, o `null` si está vigente.
   * @returns La entidad reconstituida.
   */
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
    validarLargos(datos.codigo, datos.nombre);
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
