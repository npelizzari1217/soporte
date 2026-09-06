import { TipoAjusteInsumo } from '../entities/tipo-movimiento-insumo';
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
 * InsumoDeshabilitadoError — el insumo existe y está vigente, pero fue
 * DESHABILITADO (`activo: false`), así que no admite una ENTRADA de stock.
 *
 * Es el caso que la FK de `movimientos_insumo` NO puede atrapar: la fila del
 * insumo existe, la base acepta el movimiento sin chistar y el depósito recibe
 * más de algo que la organización ya sacó de circulación — una falla
 * silenciosa, sin error ni log. Deshabilitar significa "no se compra más de
 * esto"; si la API acepta la recepción igual, deshabilitar no sirve para nada.
 *
 * **La restricción es SOLO de la entrada, y por eso el mensaje lo dice.** Una
 * SALIDA sobre un insumo deshabilitado es consumir lo que quedó en el depósito
 * —justo lo que se espera después de retirarlo—, y un AJUSTE es corregir su
 * conteo físico; rechazarlas dejaría ese stock atrapado, sin forma de llegar a
 * cero salvo volviendo a habilitar el insumo o asentando un ajuste que
 * mentiría sobre lo que pasó. Sin la aclaración en el mensaje, quien lee "está
 * deshabilitado" generaliza la prohibición a toda la bitácora — el mismo
 * riesgo que `MotivoAjusteRequeridoError` evita nombrando el tipo exacto.
 * → HTTP 422 en la capa de presentación.
 */
export class InsumoDeshabilitadoError extends DomainError {
  readonly code = 'INSUMO_DESHABILITADO';

  constructor(id: string) {
    super(
      `El insumo con id "${id}" está deshabilitado: no se puede registrar una entrada de stock ` +
        `sobre él. Habilítelo en el catálogo si vuelve a comprarse. La salida y el ajuste sí se ` +
        `registran, para poder consumir y corregir lo que quedó en el depósito.`,
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

/**
 * ModeloEquipoInexistenteError — un `modeloEquipoId` de la lista de
 * compatibilidad no corresponde a ningún modelo del catálogo `modelos_equipo`
 * del tenant.
 *
 * Comparte NOMBRE y `code` con el error homónimo de
 * `src/equipos/domain/errors/equipos.errors.ts`, y eso es DELIBERADO: es la
 * misma condición de negocio —un id que no está en el catálogo de modelos— y
 * el código que ve el cliente tiene que ser el mismo lo reporte el alta de un
 * equipo o el alta de un insumo. Un mismo problema con dos códigos obliga al
 * frontend a mantener dos ramas para la misma corrección.
 *
 * Está DUPLICADO y no importado porque `equipos` ya importa el puerto del
 * catálogo de modelos desde `insumos`: importar en sentido inverso cerraría un
 * ciclo entre los dos módulos. Es el mismo criterio con el que la familia y la
 * unidad de medida tienen su chequeo propio en cada consumidor. Ningún archivo
 * importa los dos.
 * → HTTP 422 en la capa de presentación (es un valor del BODY, no el recurso
 *   de la URL).
 */
export class ModeloEquipoInexistenteError extends DomainError {
  readonly code = 'MODELO_EQUIPO_INEXISTENTE';

  constructor(modeloEquipoId: string) {
    super(
      `El modelo de equipo con id "${modeloEquipoId}" no existe en el catálogo del tenant y no puede ` +
        `declararse compatible con un insumo.`,
    );
  }
}

/**
 * ModeloEquipoDeshabilitadoError — el modelo existe en el catálogo pero está
 * DESHABILITADO (`activo: false`), así que no es elegible.
 *
 * Este es el caso que la FK NO puede atrapar: la fila existe, la base acepta el
 * vínculo sin chistar y el insumo queda declarado compatible con un modelo que
 * el administrador ya sacó de circulación —una falla silenciosa, sin error ni
 * log—. Deshabilitar un modelo significa que no se puede elegir más; si la API
 * lo acepta igual, deshabilitar no sirve para nada.
 *
 * Comparte nombre y `code` con el homónimo de `equipos.errors.ts` por el mismo
 * motivo que `ModeloEquipoInexistenteError`. Lo que NO comparte es la firma: el
 * de `equipos` nombra el par `marca` + `modelo` porque valida UN modelo por
 * equipo y ya lo tiene leído; acá la lista puede traer decenas, y arrastrar la
 * marca y el modelo de cada uno solo para el mensaje obligaría a leerlos aunque
 * la validación pase.
 * → HTTP 422 en la capa de presentación.
 */
export class ModeloEquipoDeshabilitadoError extends DomainError {
  readonly code = 'MODELO_EQUIPO_DESHABILITADO';

  constructor(modeloEquipoId: string) {
    super(
      `El modelo de equipo con id "${modeloEquipoId}" está deshabilitado y no puede declararse ` +
        `compatible con un insumo. Habilítelo en el catálogo de modelos de equipo o quítelo de la lista.`,
    );
  }
}

/**
 * CompatibilidadDuplicadaError — el mismo modelo de equipo aparece más de una
 * vez en la lista de compatibilidad que llega en el payload.
 *
 * El duplicado es SIEMPRE dentro del payload, nunca contra el catálogo: la PK
 * de `insumos_modelos_equipo` es el par `(insumo_id, modelo_equipo_id)`, así
 * que dos insumos distintos SÍ pueden declarar el mismo modelo — eso es justo
 * lo que la relación N:N significa. Frenarlo acá y no en el `upsert` es lo que
 * distingue "cargaste dos veces la misma fila" de "el segundo rol pisó al
 * primero en silencio".
 * → HTTP 422 en la capa de presentación.
 */
export class CompatibilidadDuplicadaError extends DomainError {
  readonly code = 'COMPATIBILIDAD_DUPLICADA';

  constructor(modeloEquipoId: string) {
    super(
      `El modelo de equipo con id "${modeloEquipoId}" aparece más de una vez en la lista de ` +
        `compatibilidad. Cada modelo se declara una sola vez por insumo.`,
    );
  }
}

/**
 * MotivoAjusteRequeridoError — se intentó registrar un ajuste —en cualquiera
 * de sus dos direcciones, `AJUSTE_POSITIVO` o `AJUSTE_NEGATIVO`— sin motivo, o
 * con un motivo que después de recortar los espacios no tiene contenido.
 *
 * Es la regla que la base NO puede sostener, y por eso vive en el dominio: un
 * `CHECK` condicional sería un segundo dueño de una regla que ya está en la
 * entidad —dos dueños de la misma regla derivan—, y además Postgres no puede
 * exigir que el motivo tenga CONTENIDO: un motivo de un solo espacio
 * conformaría al `NOT NULL` igual.
 *
 * Va como `Result.fail` y no como `throw` porque es una desviación de negocio
 * que el usuario tiene que ver y corregir, no una violación de contrato del
 * caller: el borde no puede rechazarla con un decorador simple, porque la
 * obligatoriedad depende del `tipo` que venga en el mismo body. Precedente
 * exacto: `MotivoCierreFaltanteRequeridoError` (`compras.errors.ts`).
 *
 * El mensaje nombra el tipo EXACTO y no la palabra genérica "ajuste". Por dos
 * razones: el motivo es OPCIONAL en la `ENTRADA` y en la `SALIDA` —sin el tipo,
 * quien registra una salida lee "el motivo es obligatorio", lo generaliza y
 * termina cargando relleno en toda la bitácora—, y los dos ajustes se
 * confunden entre sí con facilidad, así que quien acaba de asentar un faltante
 * necesita leer que el sistema entendió `AJUSTE_NEGATIVO`.
 * → HTTP 422 en la capa de presentación.
 */
export class MotivoAjusteRequeridoError extends DomainError {
  readonly code = 'MOTIVO_AJUSTE_REQUERIDO';

  constructor(insumoId: string, tipo: TipoAjusteInsumo) {
    super(
      `El motivo es obligatorio para registrar un movimiento de tipo ${tipo} sobre el insumo con id ` +
        `"${insumoId}": un ajuste sin explicación es un faltante sin explicación. La entrada y la ` +
        `salida no lo exigen.`,
    );
  }
}

/**
 * StockInsuficienteError — se intentó registrar una SALIDA (o un
 * `AJUSTE_NEGATIVO`) por más unidades de las que el insumo tiene en el
 * depósito. El stock resultante habría quedado negativo, que es la única
 * invariante que la bitácora existe para proteger.
 *
 * **Es la regla que la base NO puede sostener, y por eso el dominio es su
 * único dueño.** Postgres no puede expresar `SUM(cantidad) >= 0` sobre varias
 * filas: no hay `CHECK` ni FK que ataje esto, así que no hay backstop. La
 * invariante depende de que toda escritura pase por el único punto que toma el
 * advisory lock (`IMovimientoInsumoRepository.lockAndSumByTipo`) y compara el
 * saldo ANTES de insertar, dentro de la misma transacción.
 *
 * Va como `Result.fail` y no como `throw`: es una desviación de negocio que
 * quien registra el movimiento tiene que ver y corregir —contando el depósito
 * o corrigiendo lo que escribió—, no una violación de contrato del caller. El
 * borde no puede rechazarla con un decorador, porque el disponible depende del
 * estado de la bitácora en el instante de la escritura.
 *
 * El mensaje dice los DOS números. Con uno solo, quien carga no sabe si el
 * error está en lo que escribió o en el depósito, y "no hay stock suficiente"
 * a secas lo obliga a abrir otra pantalla para averiguar cuánto hay.
 * → HTTP 422 en la capa de presentación.
 */
export class StockInsuficienteError extends DomainError {
  readonly code = 'STOCK_INSUFICIENTE';

  constructor(insumoId: string, solicitada: number, disponible: number) {
    super(
      `El insumo con id "${insumoId}" no tiene stock suficiente: se pidieron ${solicitada} unidades ` +
        `y hay ${disponible} disponibles. Registre primero la entrada que falta, o corrija la cantidad.`,
    );
  }
}
