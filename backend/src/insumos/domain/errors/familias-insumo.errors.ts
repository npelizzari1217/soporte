import { DomainError } from '../../../shared/domain/result';

/**
 * FamiliaInsumoNoEncontradaError — el `id` de familia indicado no existe en el
 * catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class FamiliaInsumoNoEncontradaError extends DomainError {
  readonly code = 'FAMILIA_INSUMO_NO_ENCONTRADA';

  constructor(id: string) {
    super(`Familia de insumo con id "${id}" no encontrada en el catálogo del tenant.`);
  }
}

/**
 * FamiliaInsumoCodigoDuplicadoError — el `codigo` provisto al crear/editar una
 * familia ya existe en el tenant, esté esa familia habilitada o no:
 * `findByCodigo()` no filtra por `activo` ni por `deleted_at`, y
 * `familias_insumo.codigo` es UNIQUE sin índice parcial (mismo criterio que
 * `sectores`), así que un código ocupado NO se reutiliza. Deshabilitar una
 * familia no libera su código.
 * → HTTP 422 en la capa de presentación.
 */
export class FamiliaInsumoCodigoDuplicadoError extends DomainError {
  readonly code = 'FAMILIA_INSUMO_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(
      `Ya existe una familia de insumo con codigo "${codigo}" en este tenant (activa o inactiva).`,
    );
  }
}
