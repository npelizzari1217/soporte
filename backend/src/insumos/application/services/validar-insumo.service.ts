import { DomainError, Result } from '../../../shared/domain/result';
import {
  CompatibilidadModelo,
  crearCompatibilidadModelo,
} from '../../domain/entities/compatibilidad-modelo';
import {
  InsumoCodigoAlternativoEntity,
  normalizarCodigoAlternativo,
  normalizarFabricanteCodigoAlternativo,
} from '../../domain/entities/insumo-codigo-alternativo.entity';
import {
  CodigoAlternativoDuplicadoError,
  CompatibilidadDuplicadaError,
  FamiliaInsumoDeshabilitadaError,
  FamiliaInsumoInexistenteError,
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
  UnidadMedidaDeshabilitadaError,
  UnidadMedidaInexistenteError,
} from '../../domain/errors/insumos.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/**
 * Lo único que la validación necesita del catálogo de familias. Se pide como
 * `Pick` y no como el puerto entero para que el caso de uso no herede
 * capacidades de escritura sobre un catálogo que no le pertenece.
 */
export type LectorCatalogoFamilias = Pick<IFamiliaInsumoRepository, 'findById'>;

/** Mismo criterio que `LectorCatalogoFamilias`, para el catálogo de unidades. */
export type LectorCatalogoUnidades = Pick<IUnidadMedidaRepository, 'findById'>;

/** Mismo criterio, para el catálogo de modelos de equipo. */
export type LectorCatalogoModelosEquipo = Pick<IModeloEquipoRepository, 'findById'>;

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
 * Un modelo compatible tal como llega del borde: sin normalizar, y con el
 * `rol` opcional porque no todo insumo cumple un rol distinguible dentro del
 * equipo.
 */
export interface CompatibilidadInput {
  modeloEquipoId: string;
  rol?: string | null;
}

/**
 * Clave de comparación de un `modeloEquipoId` dentro del payload.
 *
 * Va en minúscula porque la columna es `uuid`, no texto: Postgres normaliza el
 * literal antes de compararlo, así que `9F1B…` y `9f1b…` son la MISMA fila
 * para la clave primaria. Comparando los strings crudos, ese duplicado se
 * escaparía del guard y volvería como la violación de PK que el guard existe
 * para evitar.
 *
 * @param modeloEquipoId Id tal como llega del borde.
 * @returns La clave con la que se comparan dos entradas entre sí.
 */
function claveDelModelo(modeloEquipoId: string): string {
  return modeloEquipoId.toLowerCase();
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

/**
 * Verifica que un `modeloEquipoId` sea ELEGIBLE, con el mismo criterio que
 * `validarFamiliaInsumoElegible`: existir no es ser elegible.
 *
 * Este chequeo vive en `insumos` y no se importa de `src/equipos/`, que tiene
 * uno equivalente: `equipos` ya importa el puerto del catálogo de modelos desde
 * `insumos`, así que el import inverso cerraría un ciclo entre los dos módulos.
 * Los errores comparten `code` con los de allá justamente para que el cliente
 * vea el mismo código lo reporte quien lo reporte.
 *
 * @param catalogo Lector del catálogo de modelos de equipo del tenant.
 * @param modeloEquipoId Id a validar.
 * @returns `Result.ok()` si es elegible; `Result.fail()` con
 *   `ModeloEquipoInexistenteError` o `ModeloEquipoDeshabilitadoError` si no.
 */
export async function validarModeloEquipoElegible(
  catalogo: LectorCatalogoModelosEquipo,
  modeloEquipoId: string,
): Promise<Result<void, DomainError>> {
  const modelo = await catalogo.findById(modeloEquipoId);

  if (!modelo || modelo.isDeleted()) {
    return Result.fail(new ModeloEquipoInexistenteError(modeloEquipoId));
  }

  if (!modelo.activo) {
    return Result.fail(new ModeloEquipoDeshabilitadoError(modeloEquipoId));
  }

  return Result.ok(undefined);
}

/**
 * Valida la lista de modelos compatibles que llega del borde y construye los
 * value objects que van a REEMPLAZAR a la lista guardada.
 *
 * Vive como función compartida —y no duplicada en el alta y en la edición—
 * porque las dos aplican exactamente la misma regla: una sola regla no puede
 * desincronizarse consigo misma.
 *
 * El orden de los dos rechazos importa, con el mismo criterio que
 * `resolverCodigosAlternativos`. El duplicado DENTRO del payload se resuelve
 * primero y sin tocar la base: es un error de carga que no necesita una
 * consulta para diagnosticarse, y sin ese guard las dos filas llegan a la
 * escritura anidada y mueren como violación de la PK `(insumo, modelo)` — un
 * 500 crudo en lugar del 422 que nombra el modelo repetido.
 *
 * Con la lista vacía no se consulta nada: no hay ningún id que verificar, y la
 * consulta sería una ida y vuelta garantizada a no encontrar nada.
 *
 * **La elegibilidad se verifica solo sobre los modelos que el insumo NO tenía
 * ya.** La lista se reemplaza entera, así que toda edición reenvía también los
 * modelos viejos; revalidarlos convertiría una baja en el catálogo en una
 * trampa: deshabilitar un modelo dejaría sin poder editar —ni siquiera el
 * nombre— a todos los insumos que ya eran compatibles con él, y la única
 * salida sería borrar una compatibilidad que nadie pidió borrar. Es el mismo
 * criterio con el que `EditarInsumoUseCase` no valida los campos ausentes del
 * PATCH, y el equivalente del `excluyendoInsumoId` de los códigos
 * alternativos. Declarar un modelo deshabilitado POR PRIMERA VEZ sigue siendo
 * un 422.
 *
 * @param entradas Modelos compatibles crudos, tal como llegan del borde.
 * @param catalogo Lector del catálogo de modelos de equipo del tenant.
 * @param opciones `existentes` son los modelos que el insumo ya tenía
 *   declarados; se dan por elegibles y no se vuelven a consultar. Se omite en
 *   el alta, donde no hay nada previo.
 * @returns Los pares listos para entrar al agregado, con el rol normalizado; o
 *   `CompatibilidadDuplicadaError`, `ModeloEquipoInexistenteError` o
 *   `ModeloEquipoDeshabilitadoError` si alguna entrada no pasa.
 */
export async function resolverCompatibilidad(
  entradas: readonly CompatibilidadInput[],
  catalogo: LectorCatalogoModelosEquipo,
  opciones: { existentes?: readonly CompatibilidadModelo[] } = {},
): Promise<Result<CompatibilidadModelo[], DomainError>> {
  const vistos = new Set<string>();

  for (const entrada of entradas) {
    const clave = claveDelModelo(entrada.modeloEquipoId);
    if (vistos.has(clave)) {
      return Result.fail(new CompatibilidadDuplicadaError(entrada.modeloEquipoId));
    }
    vistos.add(clave);
  }

  const yaDeclarados = new Set(
    (opciones.existentes ?? []).map((par) => claveDelModelo(par.modeloEquipoId)),
  );

  // Secuencial y no en paralelo: el primer modelo no elegible corta el resto,
  // así que una lista larga con el primero deshabilitado hace una sola
  // consulta en vez de una por modelo. El puerto expone `findById` y no una
  // búsqueda por lote, así que el peor caso —un alta que declara el techo de
  // modelos, todos elegibles— sigue siendo una consulta por modelo; se acepta
  // porque es una operación de administración y porque el filtro de arriba
  // deja fuera todo lo que el insumo ya tenía.
  for (const entrada of entradas) {
    if (yaDeclarados.has(claveDelModelo(entrada.modeloEquipoId))) continue;

    const elegible = await validarModeloEquipoElegible(catalogo, entrada.modeloEquipoId);
    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }
  }

  return Result.ok(entradas.map((entrada) => crearCompatibilidadModelo(entrada)));
}
