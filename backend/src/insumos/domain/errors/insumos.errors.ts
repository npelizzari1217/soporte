import { DomainError } from '../../../shared/domain/result';

/**
 * InsumoNoEncontradoError — el `id` de insumo indicado no existe en el
 * catálogo del tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class InsumoNoEncontradoError extends DomainError {
  readonly code = 'INSUMO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Insumo con id "${id}" no encontrado en el catálogo del tenant.`);
  }
}

/**
 * InsumoCodigoDuplicadoError — el `codigo` provisto al crear/editar ya está
 * tomado en el tenant.
 *
 * El mensaje aclara que sigue tomado aunque el insumo esté deshabilitado o
 * dado de baja porque `insumos_codigo_key` NO es un índice parcial: no filtra
 * por `activo` ni por `deleted_at`. Sin esa aclaración el administrador busca
 * el código en el listado, no lo encuentra —el listado muestra solo lo
 * vigente— y concluye que el sistema le miente.
 * → HTTP 422 en la capa de presentación.
 */
export class InsumoCodigoDuplicadoError extends DomainError {
  readonly code = 'INSUMO_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(
      `Ya existe un insumo con el código "${codigo}" en este tenant (activo o inactivo, incluso con baja lógica).`,
    );
  }
}

/**
 * FamiliaInsumoInexistenteError — la `familiaId` provista no corresponde a
 * ninguna familia del catálogo del tenant.
 *
 * Vive en este archivo y no en `familias-insumo.errors.ts` porque el dueño del
 * error es el consumidor que lo produce: lo emite el alta/edición de insumo,
 * no el ABM de familias. Mismo criterio que `ModeloEquipoInexistenteError` en
 * `equipos.errors.ts`.
 * → HTTP 422 en la capa de presentación.
 */
export class FamiliaInsumoInexistenteError extends DomainError {
  readonly code = 'FAMILIA_INSUMO_INEXISTENTE';

  constructor(id: string) {
    super(`La familia de insumo con id "${id}" no existe en el catálogo del tenant.`);
  }
}

/**
 * FamiliaInsumoDeshabilitadaError — la familia existe pero está deshabilitada,
 * así que no es elegible para un insumo nuevo ni para una reasignación.
 *
 * Es un error DISTINTO del de la familia inexistente y no un matiz del mismo:
 * la FK no puede atrapar este caso —la fila existe— y decirle "no existe" al
 * administrador sobre algo que ve en su propio listado lo manda a buscar un
 * problema que no está.
 * → HTTP 422 en la capa de presentación.
 */
export class FamiliaInsumoDeshabilitadaError extends DomainError {
  readonly code = 'FAMILIA_INSUMO_DESHABILITADA';

  constructor(id: string) {
    super(
      `La familia de insumo con id "${id}" está deshabilitada y no puede asignarse a un insumo.`,
    );
  }
}

/**
 * UnidadMedidaInexistenteError — la `unidadMedidaId` provista no corresponde a
 * ninguna unidad del catálogo del tenant. Vive acá por el mismo criterio de
 * pertenencia que `FamiliaInsumoInexistenteError`.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadMedidaInexistenteError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_INEXISTENTE';

  constructor(id: string) {
    super(`La unidad de medida con id "${id}" no existe en el catálogo del tenant.`);
  }
}

/**
 * UnidadMedidaDeshabilitadaError — la unidad existe pero está deshabilitada, y
 * por lo tanto no es elegible. Existir no es ser elegible: la FK deja pasar
 * este caso porque la fila está.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadMedidaDeshabilitadaError extends DomainError {
  readonly code = 'UNIDAD_MEDIDA_DESHABILITADA';

  constructor(id: string) {
    super(
      `La unidad de medida con id "${id}" está deshabilitada y no puede asignarse a un insumo.`,
    );
  }
}

/**
 * CodigoAlternativoDuplicadoError — el par `(codigo, fabricante)` ya está
 * tomado. Cubre los dos caminos por los que eso ocurre: el par repetido dentro
 * del mismo payload y el par que ya pertenece a otro insumo del tenant. Son el
 * mismo problema para quien carga —el par tiene que resolver a un solo
 * insumo— y por eso comparten código de error.
 *
 * El mensaje nombra el PAR COMPLETO porque el UNIQUE es sobre las dos
 * columnas: el mismo `CE285A` de dos fabricantes distintos convive sin
 * problema, y decir solo el código haría parecer prohibido algo que no lo es.
 *
 * Con `fabricante` en `null` el par es el código genérico, y el mensaje lo
 * dice con palabras: interpolar el `null` produciría `del fabricante "null"`,
 * que manda al administrador a buscar un fabricante que no existe.
 * → HTTP 422 en la capa de presentación.
 */
export class CodigoAlternativoDuplicadoError extends DomainError {
  readonly code = 'CODIGO_ALTERNATIVO_DUPLICADO';

  constructor(codigo: string, fabricante: string | null) {
    super(
      fabricante === null
        ? `El código alternativo genérico "${codigo}", sin fabricante, ya está en uso en este tenant.`
        : `El código alternativo "${codigo}" del fabricante "${fabricante}" ya está en uso en este tenant.`,
    );
  }
}
