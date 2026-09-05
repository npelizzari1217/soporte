import { DomainError, Result } from '../../../shared/domain/result';
import {
  InsumoCodigoAlternativoEntity,
  normalizarCodigoAlternativo,
  normalizarFabricanteCodigoAlternativo,
} from '../../domain/entities/insumo-codigo-alternativo.entity';
import {
  CodigoAlternativoDuplicadoError,
  FamiliaInsumoDeshabilitadaError,
  FamiliaInsumoInexistenteError,
  UnidadMedidaDeshabilitadaError,
  UnidadMedidaInexistenteError,
} from '../../domain/errors/insumos.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/**
 * Lo único que la validación necesita del catálogo de familias. Se pide como
 * `Pick` y no como el puerto entero para que el caso de uso no herede
 * capacidades de escritura sobre un catálogo que no le pertenece.
 */
export type LectorCatalogoFamilias = Pick<IFamiliaInsumoRepository, 'findById'>;

/** Mismo criterio que `LectorCatalogoFamilias`, para el catálogo de unidades. */
export type LectorCatalogoUnidades = Pick<IUnidadMedidaRepository, 'findById'>;

/** Lo único que la resolución de códigos alternativos necesita del repositorio de insumos. */
export type LectorConflictosCodigoAlternativo = Pick<
  IInsumoRepository,
  'findConflictosDeCodigoAlternativo'
>;

/**
 * Un código alternativo tal como llega del borde: sin normalizar, y con el
 * `fabricante` opcional porque el código genérico no tiene ninguno.
 */
export interface CodigoAlternativoInput {
  codigo: string;
  fabricante?: string | null;
}

/**
 * Clave de comparación de un par `(codigo, fabricante)` ya normalizado.
 *
 * El separador es `NUL`, que ninguna de las dos mitades puede contener:
 * concatenarlas con un carácter que sí pueda aparecer —un espacio, por
 * ejemplo— haría que `('AB', 'C D')` y `('AB C', 'D')` colapsaran en la misma
 * clave `AB C D` y el alta rechazaría un par legítimo.
 *
 * @param codigo Código ya normalizado.
 * @param fabricante Fabricante ya normalizado, o `null` si el código es genérico.
 * @returns La clave con la que se comparan dos pares entre sí.
 */
function claveDelPar(codigo: string, fabricante: string | null): string {
  return `${codigo}\u0000${fabricante ?? ''}`;
}

/**
 * Verifica que una `familiaId` sea ELEGIBLE: que exista en el catálogo del
 * tenant y que esté habilitada.
 *
 * Los dos fallos van SEPARADOS: un id inexistente se corrige cambiando el id,
 * una familia deshabilitada se corrige habilitándola. Colapsados en un solo
 * error, el administrador no sabe cuál de los dos le tocó — y decirle "no
 * existe" sobre algo que ve en su propio listado lo manda a buscar un problema
 * que no está.
 *
 * La FK de Postgres no cubre el segundo caso: la fila EXISTE, así que la base
 * acepta la referencia en silencio.
 *
 * La familia con baja lógica cuenta como INEXISTENTE: `findById()` no filtra
 * por `deletedAt`, así que la fila vuelve igual, y elegir una familia dada de
 * baja no es una opción distinta de elegir una que nunca existió.
 *
 * @param catalogo Lector del catálogo de familias del tenant.
 * @param familiaId Id a validar.
 * @returns `Result.ok()` si es elegible; `Result.fail()` con
 *   `FamiliaInsumoInexistenteError` o `FamiliaInsumoDeshabilitadaError` si no.
 */
export async function validarFamiliaInsumoElegible(
  catalogo: LectorCatalogoFamilias,
  familiaId: string,
): Promise<Result<void, DomainError>> {
  const familia = await catalogo.findById(familiaId);

  if (!familia || familia.isDeleted()) {
    return Result.fail(new FamiliaInsumoInexistenteError(familiaId));
  }

  if (!familia.activo) {
    return Result.fail(new FamiliaInsumoDeshabilitadaError(familiaId));
  }

  return Result.ok(undefined);
}

/**
 * Verifica que una `unidadMedidaId` sea ELEGIBLE, con el mismo criterio que
 * `validarFamiliaInsumoElegible`: existir no es ser elegible, y la FK deja
 * pasar la unidad deshabilitada porque su fila está.
 *
 * @param catalogo Lector del catálogo de unidades de medida del tenant.
 * @param unidadMedidaId Id a validar.
 * @returns `Result.ok()` si es elegible; `Result.fail()` con
 *   `UnidadMedidaInexistenteError` o `UnidadMedidaDeshabilitadaError` si no.
 */
export async function validarUnidadMedidaElegible(
  catalogo: LectorCatalogoUnidades,
  unidadMedidaId: string,
): Promise<Result<void, DomainError>> {
  const unidad = await catalogo.findById(unidadMedidaId);

  if (!unidad || unidad.isDeleted()) {
    return Result.fail(new UnidadMedidaInexistenteError(unidadMedidaId));
  }

  if (!unidad.activo) {
    return Result.fail(new UnidadMedidaDeshabilitadaError(unidadMedidaId));
  }

  return Result.ok(undefined);
}

/**
 * Normaliza la lista de códigos alternativos que llega del borde, la valida y
 * construye las entidades que van a REEMPLAZAR a la lista guardada.
 *
 * Vive como función compartida —y no duplicada en el alta y en la edición—
 * porque las dos aplican exactamente la misma regla sobre el mismo índice
 * global: una sola regla no puede desincronizarse consigo misma.
 *
 * El orden de los dos rechazos importa. El duplicado DENTRO del payload se
 * resuelve primero y sin tocar la base: es un error de carga que no necesita
 * una consulta para diagnosticarse, y consultar igual devolvería el error del
 * choque global, que manda al usuario a buscar un insumo ajeno cuando el
 * problema está en su propio formulario.
 *
 * Con la lista vacía no se consulta nada: el UNIQUE no puede violarse sin
 * pares, y la consulta sería una ida y vuelta garantizada a devolver vacío.
 *
 * @param entradas Códigos alternativos crudos, tal como llegan del borde.
 * @param repo Lector de conflictos del catálogo de insumos del tenant.
 * @param opciones `existentes` son los códigos que el insumo ya tiene —se
 *   reutilizan para no perder su id ni su fecha de alta—; `excluyendoInsumoId`
 *   saca de la comparación global los códigos propios del insumo que se edita.
 * @returns Las entidades listas para persistir, o
 *   `CodigoAlternativoDuplicadoError` si algún par está repetido o ya tomado.
 */
export async function resolverCodigosAlternativos(
  entradas: readonly CodigoAlternativoInput[],
  repo: LectorConflictosCodigoAlternativo,
  opciones: {
    existentes?: readonly InsumoCodigoAlternativoEntity[];
    excluyendoInsumoId?: string;
  } = {},
): Promise<Result<InsumoCodigoAlternativoEntity[], DomainError>> {
  const pares: { codigo: string; fabricante: string | null }[] = [];
  const vistos = new Set<string>();

  for (const entrada of entradas) {
    const codigo = normalizarCodigoAlternativo(entrada.codigo);
    const fabricante = normalizarFabricanteCodigoAlternativo(entrada.fabricante);
    const clave = claveDelPar(codigo, fabricante);

    if (vistos.has(clave)) {
      return Result.fail(new CodigoAlternativoDuplicadoError(codigo, fabricante));
    }
    vistos.add(clave);
    pares.push({ codigo, fabricante });
  }

  if (pares.length > 0) {
    const conflictos = await repo.findConflictosDeCodigoAlternativo(
      pares,
      opciones.excluyendoInsumoId,
    );
    const primero = conflictos[0];
    if (primero) {
      return Result.fail(new CodigoAlternativoDuplicadoError(primero.codigo, primero.fabricante));
    }
  }

  // Reutilizar la entidad que ya existía conserva su id y su `createdAt`. Sin
  // esto, editar el nombre del insumo le cambiaría el id a todos sus códigos
  // alternativos y les borraría la fecha de alta, porque la lista se reemplaza
  // entera en cada guardado del agregado.
  const porClave = new Map<string, InsumoCodigoAlternativoEntity>();
  for (const existente of opciones.existentes ?? []) {
    porClave.set(claveDelPar(existente.codigo, existente.fabricante), existente);
  }

  return Result.ok(
    pares.map(
      ({ codigo, fabricante }) =>
        porClave.get(claveDelPar(codigo, fabricante)) ??
        InsumoCodigoAlternativoEntity.create({ codigo, fabricante }),
    ),
  );
}
