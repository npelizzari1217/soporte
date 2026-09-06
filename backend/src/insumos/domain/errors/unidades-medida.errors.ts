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
