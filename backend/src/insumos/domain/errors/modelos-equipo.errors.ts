import { DomainError } from '../../../shared/domain/result';

/**
 * ModeloEquipoNoEncontradoError — el `id` de modelo indicado no existe en el
 * catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class ModeloEquipoNoEncontradoError extends DomainError {
  readonly code = 'MODELO_EQUIPO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Modelo de equipo con id "${id}" no encontrado en el catálogo del tenant.`);
  }
}

/**
 * ModeloEquipoDuplicadoError — el par `marca` + `modelo` provisto al
 * crear/editar ya existe en el tenant, esté ese modelo habilitado o no:
 * `findByMarcaModelo()` no filtra por `activo` ni por `deleted_at`, y
 * `modelos_equipo` tiene `UNIQUE (marca, modelo)` sin índice parcial (mismo
 * criterio que `sectores`), así que un par ocupado NO se reutiliza.
 * Deshabilitar un modelo no libera su par.
 *
 * El mensaje nombra el PAR COMPLETO y no una de las mitades: acá la identidad
 * no es un código suelto, y decir solo "HP" mandaría al administrador a buscar
 * una marca duplicada cuando lo que choca es "HP LaserJet Pro M404".
 * → HTTP 422 en la capa de presentación.
 */
export class ModeloEquipoDuplicadoError extends DomainError {
  readonly code = 'MODELO_EQUIPO_DUPLICADO';

  constructor(marca: string, modelo: string) {
    super(
      `Ya existe un modelo de equipo "${marca}" / "${modelo}" en este tenant (activo o inactivo).`,
    );
  }
}
