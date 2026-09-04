import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * FamiliaInsumoProps — shape de las propiedades del catálogo de familias de
 * insumo (tóner, cartucho, repuesto, ...). Calcado de `SectorProps`: catálogo
 * editable por tenant, con `codigo`/`nombre` y un `activo` que habilita o
 * deshabilita la familia sin borrarla.
 */
export interface FamiliaInsumoProps {
  codigo: string;
  nombre: string;
  activo: boolean;
}

/**
 * Topes de largo, espejando `familias_insumo.codigo VarChar(30)` y
 * `familias_insumo.nombre VarChar(100)` (`prisma_tenant/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `familias-insumo.dto.ts`
 * los importa de este módulo para que el 400 amable del borde y la precondición
 * del dominio no puedan divergir.
 */
export const FAMILIA_INSUMO_CODIGO_MAX_LENGTH = 30;
export const FAMILIA_INSUMO_NOMBRE_MAX_LENGTH = 100;

/**
 * Normalización de `codigo`, exportada para que la capa de aplicación y el
 * BORDE apliquen exactamente la misma regla.
 *
 * `familias_insumo.codigo` es UNIQUE case-sensitive: sin una normalización
 * única, `toner` y `TONER` entran como dos familias distintas y el catálogo
 * queda con duplicados que el UNIQUE no puede frenar.
 *
 * Además `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en
 * `'SS'`, 1 carácter en 2—, así que el largo crudo no es cota del largo
 * persistido: quien mida contra el tope de la columna tiene que medir DESPUÉS
 * de normalizar.
 *
 * @param valor Código crudo, tal como llega del usuario.
 * @returns El código sin espacios de borde y en mayúscula.
 */
export function normalizarCodigoFamiliaInsumo(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Normalización de `nombre`, exportada por el mismo motivo que la de `codigo`:
 * la capa de aplicación y el BORDE tienen que aplicar exactamente la regla.
 *
 * Sin ella, `'   '` cumple el `@MinLength(1)` del DTO —mide 3 caracteres— y se
 * persiste como espacios: una familia sin nombre visible en el catálogo. Por eso
 * el recorte tiene que correr ANTES de la validación de largo mínimo, nunca
 * después.
 *
 * A diferencia de `toUpperCase()`, `trim()` nunca AGRANDA el string, así que no
 * puede empujar el valor por encima del tope de la columna.
 *
 * @param valor Nombre crudo, tal como llega del usuario.
 * @returns El nombre sin espacios de borde.
 */
export function normalizarNombreFamiliaInsumo(valor: string): string {
  return valor.trim();
}

/**
 * Precondición de largo. Va como `throw` y no como `Result` porque un
 * primitivo fuera de rango llegando a la entidad es una violación de contrato
 * del caller, no una desviación de negocio que el usuario deba ver.
 *
 * NO se aplica en `reconstitute()`: ahí la fila ya existe en la base, y hacer
 * explotar una lectura por un valor histórico convertiría un dato viejo en una
 * caída de sistema.
 *
 * @param codigo Código a medir, o `undefined` si el caller no lo toca.
 * @param nombre Nombre a medir, o `undefined` si el caller no lo toca.
 * @returns Nada; lanza si algún valor excede el tope de su columna.
 */
function validarLargos(codigo?: string, nombre?: string): void {
  if (codigo !== undefined && codigo.length > FAMILIA_INSUMO_CODIGO_MAX_LENGTH) {
    throw new Error(
      `FamiliaInsumoEntity: codigo excede ${FAMILIA_INSUMO_CODIGO_MAX_LENGTH} caracteres.`,
    );
  }
  if (nombre !== undefined && nombre.length > FAMILIA_INSUMO_NOMBRE_MAX_LENGTH) {
    throw new Error(
      `FamiliaInsumoEntity: nombre excede ${FAMILIA_INSUMO_NOMBRE_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * FamiliaInsumoEntity — entidad de dominio del catálogo de familias de insumo
 * (Tóner, Cartucho, Repuesto, ...). Catálogo EDITABLE por el ADMINISTRADOR del
 * cliente, nace vacío (sin seed).
 *
 * No hay borrado: `familias_insumo` es referenciada por `insumos` con
 * `ON DELETE RESTRICT`, así que una familia en uso no se elimina — se
 * DESHABILITA (`activo = false`), y sigue apareciendo en el listado para que
 * el administrador pueda volver a habilitarla.
 */
export class FamiliaInsumoEntity extends BaseEntity<FamiliaInsumoProps> {
  /**
   * Crea una familia nueva, validando la precondición de largo.
   *
   * @param props Código, nombre y estado de la familia.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La entidad creada.
   * @throws Error si `codigo` o `nombre` exceden el tope de su columna.
   */
  static create(props: FamiliaInsumoProps, id?: string): FamiliaInsumoEntity {
    validarLargos(props.codigo, props.nombre);
    return new FamiliaInsumoEntity(props, id);
  }

  /**
   * Rehidrata una familia desde persistencia, preservando id y timestamps.
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
    props: FamiliaInsumoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): FamiliaInsumoEntity {
    const entity = new FamiliaInsumoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /** Código semántico de la familia, normalizado en mayúscula. UNIQUE en DB. */
  get codigo(): string {
    return this.props.codigo;
  }

  /** Nombre visible de la familia. */
  get nombre(): string {
    return this.props.nombre;
  }

  /** `false` si la familia está deshabilitada. */
  get activo(): boolean {
    return this.props.activo;
  }

  /**
   * Actualiza los campos editables (PATCH semántico — `undefined` no toca el
   * campo). La unicidad de `codigo` se valida en la capa de aplicación
   * (`EditarFamiliaInsumoUseCase`), no acá.
   *
   * @param datos Campos a modificar; los ausentes quedan intactos.
   * @returns Nada; lanza si algún valor excede el tope de su columna.
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

  /**
   * Da de baja la familia: la DESHABILITA, no la elimina.
   *
   * NO toca `deletedAt` a propósito. El listado filtra por `deletedAt: null`,
   * así que marcarlo haría desaparecer la fila de la única pantalla que
   * existe y dejaría `activar()` inalcanzable — nadie podría conseguir el id
   * para reactivarla. La familia deshabilitada sigue en el listado con
   * `activo: false`, a la vista del administrador.
   */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Vuelve a habilitar una familia deshabilitada. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
