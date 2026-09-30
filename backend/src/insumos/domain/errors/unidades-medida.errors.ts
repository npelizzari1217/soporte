import { DomainError } from '../../../shared/domain/result';

/**
 * UnidadMedidaNoEncontradaError — el `id` de unidad indicado no existe en el
 * catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class UnidadMedidaNoEncontradaError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_NO_ENCONTRADA';

  constructor(id: string) {
    super(`Unidad de medida con id "${id}" no encontrada en el catálogo del tenant.`);
  }
}

/**
 * UnidadMedidaCodigoDuplicadoError — el `codigo` provisto al crear/editar una
 * unidad ya existe en el tenant, esté esa unidad habilitada o no:
 * `findByCodigo()` no filtra por `activo` ni por `deleted_at`, y
 * `unidades_medida.codigo` es UNIQUE sin índice parcial (mismo criterio que
 * `sectores`), así que un código ocupado NO se reutiliza. Deshabilitar una
 * unidad no libera su código.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadMedidaCodigoDuplicadoError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(
      `Ya existe una unidad de medida con codigo "${codigo}" en este tenant (activa o inactiva).`,
    );
  }
}

/**
 * UnidadMedidaNoEnteraError — un insumo con seguimiento por serie exige una
 * unidad de medida entera (piezas, pares): una unidad por pieza no se mide en
 * litros ni en metros.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadMedidaNoEnteraError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_NO_ENTERA';

  constructor(unidadMedidaId: string) {
    super(
      `La unidad de medida "${unidadMedidaId}" no es entera: un insumo con número de serie exige una unidad entera.`,
    );
  }
}

/**
 * UnidadMedidaEnUsoPorSerieError — no se puede desmarcar `entera` mientras
 * algún insumo con seguimiento por serie use la unidad de medida.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadMedidaEnUsoPorSerieError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_EN_USO_POR_SERIE';

  constructor(unidadMedidaId: string) {
    super(
      `La unidad de medida "${unidadMedidaId}" la usa algún insumo con número de serie y debe seguir siendo entera.`,
    );
  }
}

/**
 * UnidadMedidaCambiadaError — entre la lectura del insumo y su bloqueo otra
 * edición le cambió la unidad de medida, así que la validación de `entera`
 * hecha sobre la unidad vieja ya no vale. Es reintentable: el cliente repite
 * el pedido.
 * → HTTP 409 en la capa de presentación.
 */
export class UnidadMedidaCambiadaError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_CAMBIADA';

  constructor(insumoId: string) {
    super(
      `La unidad de medida del insumo "${insumoId}" cambió mientras se procesaba el pedido. Reintentá la operación.`,
    );
  }
}
