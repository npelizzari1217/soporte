import { UnidadMedidaEntity } from '../entities/unidad-medida.entity';

/**
 * IUnidadMedidaRepository — puerto de acceso al catálogo de unidades de medida
 * del tenant.
 */
export interface IUnidadMedidaRepository {
  /** Busca una unidad por id. Retorna null si no existe (incl. soft-deleted). */
  findById(id: string): Promise<UnidadMedidaEntity | null>;

  /**
   * Busca una unidad por su código semántico. Retorna null si no existe.
   * El código llega YA normalizado (`trim().toUpperCase()`) desde la capa de
   * aplicación — el repositorio no normaliza.
   */
  findByCodigo(codigo: string): Promise<UnidadMedidaEntity | null>;

  /**
   * Retorna las unidades vigentes del tenant: excluye las que tienen baja
   * lógica, pero INCLUYE las deshabilitadas (`activo: false`) — son las que el
   * administrador necesita ver para volver a habilitarlas.
   */
  findAllActive(): Promise<UnidadMedidaEntity[]>;

  /** Upsert por id: INSERT si es nueva, UPDATE si ya existe. */
  save(unidad: UnidadMedidaEntity): Promise<void>;

  /**
   * Lee `entera` de la unidad con `FOR SHARE` (L0 de ADR-12,
   * sdd/repuestos-numero-de-serie): mientras la transacción viva, nadie puede
   * desmarcarla ni cambiarle el código. Lo toman `CrearInsumo`, la activación
   * `NINGUNO → SERIE` y `EditarInsumo` con cambio de unidad. Va ANTES de todo
   * otro lock del orden. `FOR SHARE` es compatible consigo mismo, así que dos
   * altas no se esperan.
   *
   * Exige transacción activa y lanza si no la hay.
   *
   * @param id Id de la unidad de medida.
   * @returns `{ entera }`, o `null` si no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  leerParaUso(id: string): Promise<{ entera: boolean } | null>;

  /**
   * Variante de ESCRITURA de `leerParaUso()`, para editar la unidad (L0 de
   * ADR-12): `FOR UPDATE` si el cambio toca `codigo` (un cambio de columna
   * clave, que choca con los `FOR KEY SHARE` implícitos de las FK) y
   * `FOR NO KEY UPDATE` si no. Se toma de entrada, sin escalar desde un lock
   * menor a mitad de la transacción.
   *
   * Exige transacción activa y lanza si no la hay.
   *
   * @param id Id de la unidad de medida.
   * @param modo `'CAMBIA_CODIGO'` o `'SIN_CAMBIO_DE_CODIGO'`.
   * @returns La unidad leída bajo el lock, o `null` si no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearParaEdicion(
    id: string,
    modo: 'CAMBIA_CODIGO' | 'SIN_CAMBIO_DE_CODIGO',
  ): Promise<UnidadMedidaEntity | null>;
}

/** Token de inyección de dependencias para IUnidadMedidaRepository en NestJS. */
export const UNIDAD_MEDIDA_REPOSITORY = Symbol('UNIDAD_MEDIDA_REPOSITORY');
