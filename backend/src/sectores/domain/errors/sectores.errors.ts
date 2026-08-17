import { DomainError } from '../../../shared/domain/result';

/**
 * SectorNoEncontradoError — el `id` de sector indicado no existe en el
 * catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10.
 */
export class SectorNoEncontradoError extends DomainError {
  readonly code = 'SECTOR_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Sector con id "${id}" no encontrado en el catálogo del tenant.`);
  }
}

/**
 * SectorCodigoDuplicadoError — el `codigo` provisto al crear/editar un
 * Sector ya existe en el tenant (incluso si el registro existente está
 * soft-deleted: `sectores.codigo` es UNIQUE sin índice parcial por
 * `deleted_at`, mismo criterio que `tipos_ticket` — un código dado de baja
 * NO se reutiliza).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10.
 */
export class SectorCodigoDuplicadoError extends DomainError {
  readonly code = 'SECTOR_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(`Ya existe un sector con codigo "${codigo}" en este tenant (activo o dado de baja).`);
  }
}
