import { DomainError, Result } from '../../../shared/domain/result';
import { IModeloEquipoRepository } from '../../../insumos/domain/ports/i-modelo-equipo.repository';
import {
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
} from '../../domain/errors/equipos.errors';

/**
 * Lo único que la validación necesita del catálogo de modelos. Se pide como
 * `Pick` y no como el puerto entero para que el use case no herede
 * capacidades de escritura sobre un catálogo que no le pertenece.
 */
export type LectorCatalogoModelos = Pick<IModeloEquipoRepository, 'findById'>;

/**
 * Verifica que un `modeloEquipoId` sea ELEGIBLE: que exista en el catálogo del
 * tenant y que esté habilitado.
 *
 * Vive como función compartida —y no duplicada en `CrearEquipoUseCase` y
 * `EditarEquipoUseCase`— porque los dos hermanos ya divergieron una vez
 * (el guardarraíl del P2002 se escribió con truthiness en uno y con `!== null`
 * en el otro). Una sola regla no puede desincronizarse consigo misma.
 *
 * Los dos fallos van SEPARADOS: un id inexistente se arregla corrigiendo el
 * id, un modelo deshabilitado se arregla habilitándolo. Colapsados en un solo
 * error, el usuario no sabe cuál de los dos le tocó.
 *
 * El modelo con baja lógica cuenta como INEXISTENTE: `findById()` no filtra
 * por `deletedAt`, así que la fila vuelve igual, y elegir un modelo dado de
 * baja no es una opción distinta de elegir uno que nunca existió.
 *
 * @param catalogo Lector del catálogo de modelos del tenant.
 * @param modeloEquipoId Id a validar; el caller ya descartó `null`/`undefined`.
 * @returns `Result.ok()` si el modelo es elegible; `Result.fail()` con
 *   `ModeloEquipoInexistenteError` o `ModeloEquipoDeshabilitadoError` si no.
 */
export async function validarModeloEquipoElegible(
  catalogo: LectorCatalogoModelos,
  modeloEquipoId: string,
): Promise<Result<void, DomainError>> {
  const modelo = await catalogo.findById(modeloEquipoId);

  if (!modelo || modelo.isDeleted()) {
    return Result.fail(new ModeloEquipoInexistenteError(modeloEquipoId));
  }

  if (!modelo.activo) {
    return Result.fail(
      new ModeloEquipoDeshabilitadoError(modeloEquipoId, modelo.marca, modelo.modelo),
    );
  }

  return Result.ok(undefined);
}
