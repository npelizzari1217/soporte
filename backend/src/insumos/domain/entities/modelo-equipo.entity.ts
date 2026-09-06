import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * ModeloEquipoProps — shape de las propiedades del catálogo de modelos de
 * equipo (HP LaserJet Pro M404, Brother HL-L2350DW, ...). Mismo molde que
 * `FamiliaInsumoProps`/`UnidadMedidaProps`, con UNA diferencia: acá no hay
 * `codigo`. La identidad es el PAR `marca` + `modelo`, que es lo que
 * `modelos_equipo` declara como `UNIQUE (marca, modelo)`.
 */
export interface ModeloEquipoProps {
  marca: string;
  modelo: string;
  activo: boolean;
}

/**
 * Topes de largo, espejando `modelos_equipo.marca VarChar(100)` y
 * `modelos_equipo.modelo VarChar(150)` (`prisma_tenant/schema.prisma`).
 *
 * Viven ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `modelos-equipo.dto.ts`
 * los importa de este módulo para que el 400 amable del borde y la precondición
 * del dominio no puedan divergir.
 */
export const MODELO_EQUIPO_MARCA_MAX_LENGTH = 100;
export const MODELO_EQUIPO_MODELO_MAX_LENGTH = 150;

/**
 * Normalización de `marca`, exportada para que la capa de aplicación y el
 * BORDE apliquen exactamente la misma regla.
 *
 * El UNIQUE `(marca, modelo)` es case-sensitive: sin una normalización única,
 * `hp` y `HP` entran como dos marcas distintas y el catálogo queda con
 * duplicados que el UNIQUE no puede frenar. Es la misma regla que el `codigo`
 * de `FamiliaInsumo`/`UnidadMedida`, aplicada acá a la mitad "gritable" del
 * par.
 *
 * Además `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en
 * `'SS'`, 1 carácter en 2—, así que el largo crudo no es cota del largo
 * persistido: quien mida contra el tope de la columna tiene que medir DESPUÉS
 * de normalizar.
 *
 * @param valor Marca cruda, tal como llega del usuario.
 * @returns La marca sin espacios de borde y en mayúscula.
 */
export function normalizarMarcaModeloEquipo(valor: string): string {
  return valor.trim().toUpperCase();
}

/**
 * Normalización de `modelo`: SOLO recorte de espacios de borde. A diferencia
 * de `marca`, el modelo NO se pasa a mayúscula — la designación comercial se
 * lee tal como la escribió el fabricante, y "LaserJet Pro M404" gritado a
 * "LASERJET PRO M404" no es como figura en la máquina ni como nadie lo busca.
 *
 * Sin el recorte, `'   '` cumple el `@MinLength(1)` del DTO —mide 3
 * caracteres— y se persiste como espacios: un modelo sin designación visible
 * en el catálogo. Por eso el recorte tiene que correr ANTES de la validación
 * de largo mínimo, nunca después.
 *
 * A diferencia de `toUpperCase()`, `trim()` nunca AGRANDA el string, así que no
 * puede empujar el valor por encima del tope de la columna.
 *
 * @param valor Modelo crudo, tal como llega del usuario.
 * @returns El modelo sin espacios de borde, con sus mayúsculas y minúsculas intactas.
 */
export function normalizarModeloModeloEquipo(valor: string): string {
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
 * @param marca Marca a medir, o `undefined` si el caller no la toca.
 * @param modelo Modelo a medir, o `undefined` si el caller no lo toca.
 * @returns Nada; lanza si algún valor excede el tope de su columna.
 */
function validarLargos(marca?: string, modelo?: string): void {
  if (marca !== undefined && marca.length > MODELO_EQUIPO_MARCA_MAX_LENGTH) {
    throw new Error(
      `ModeloEquipoEntity: marca excede ${MODELO_EQUIPO_MARCA_MAX_LENGTH} caracteres.`,
    );
  }
  if (modelo !== undefined && modelo.length > MODELO_EQUIPO_MODELO_MAX_LENGTH) {
    throw new Error(
      `ModeloEquipoEntity: modelo excede ${MODELO_EQUIPO_MODELO_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * ModeloEquipoEntity — entidad de dominio del catálogo de modelos de equipo
 * (HP LaserJet Pro M404, Brother HL-L2350DW, ...). Catálogo EDITABLE por el
 * ADMINISTRADOR del cliente, nace vacío (sin seed).
 *
 * Es la pieza de la que cuelga la compatibilidad con insumos: un tóner sirve al
 * MODELO, no a la instancia de equipo. `equipos_informaticos.modelo_equipo_id`
 * apunta acá (nullable — un clon armado en casa no tiene modelo de catálogo).
 *
 * No hay borrado: `modelos_equipo` es referenciada por `equipos_informaticos` y
 * por `insumos_modelo_equipo`, así que un modelo en uso no se elimina — se
 * DESHABILITA (`activo = false`), y sigue apareciendo en el listado para que
 * el administrador pueda volver a habilitarlo.
 */
export class ModeloEquipoEntity extends BaseEntity<ModeloEquipoProps> {
  /**
   * Crea un modelo nuevo, validando la precondición de largo.
   *
   * @param props Marca, modelo y estado.
   * @param id Id explícito; si se omite lo genera `BaseEntity`.
   * @returns La entidad creada.
   * @throws Error si `marca` o `modelo` exceden el tope de su columna.
   */
  static create(props: ModeloEquipoProps, id?: string): ModeloEquipoEntity {
    validarLargos(props.marca, props.modelo);
    return new ModeloEquipoEntity(props, id);
  }

  /**
   * Rehidrata un modelo desde persistencia, preservando id y timestamps.
   *
   * NO valida largos a propósito: la fila ya existe en la base, y hacer
   * explotar una lectura por un valor histórico convertiría un dato viejo en
   * una caída de sistema.
   *
   * @param props Marca, modelo y estado leídos de la base.
   * @param id Id persistido.
   * @param createdAt Alta original.
   * @param updatedAt Última modificación.
   * @param deletedAt Fecha de baja lógica, o `null` si está vigente.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: ModeloEquipoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ModeloEquipoEntity {
    const entity = new ModeloEquipoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /** Marca del equipo, normalizada en mayúscula. Mitad del UNIQUE en DB. */
  get marca(): string {
    return this.props.marca;
  }

  /** Designación comercial del modelo, con sus mayúsculas y minúsculas. Mitad del UNIQUE en DB. */
  get modelo(): string {
    return this.props.modelo;
  }

  /** `false` si el modelo está deshabilitado. */
  get activo(): boolean {
    return this.props.activo;
  }

  /**
   * Actualiza los campos editables (PATCH semántico — `undefined` no toca el
   * campo). La unicidad del PAR `marca` + `modelo` se valida en la capa de
   * aplicación (`EditarModeloEquipoUseCase`), no acá.
   *
   * @param datos Campos a modificar; los ausentes quedan intactos.
   * @returns Nada; lanza si algún valor excede el tope de su columna.
   */
  actualizar(datos: { marca?: string; modelo?: string }): void {
    validarLargos(datos.marca, datos.modelo);
    if (datos.marca !== undefined) {
      this.props.marca = datos.marca;
    }
    if (datos.modelo !== undefined) {
      this.props.modelo = datos.modelo;
    }
    this.touch();
  }

  /**
   * Da de baja el modelo: lo DESHABILITA, no lo elimina.
   *
   * NO toca `deletedAt` a propósito. El listado filtra por `deletedAt: null`,
   * así que marcarlo haría desaparecer la fila de la única pantalla que
   * existe y dejaría `activar()` inalcanzable — nadie podría conseguir el id
   * para reactivarlo. El modelo deshabilitado sigue en el listado con
   * `activo: false`, a la vista del administrador.
   */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Vuelve a habilitar un modelo deshabilitado. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
