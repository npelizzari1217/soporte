import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `equipos/` (Fase 3, F3-Q1..Q5, F3-M1).
 *
 * Mismo patrón que `compras/domain/errors/compras.errors.ts` y
 * `reparaciones/domain/errors/reparaciones.errors.ts`: cada error extiende
 * `DomainError`, expone un `code` estable y se modela con `Result.fail()` —
 * nunca `throw` para fallos esperados del dominio.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1..Q5. Ref design: "Firmas TS
 * clave" (lista de errores de equipos.errors.ts). Tarea: T10.6.
 */

/**
 * EquipoNoEncontradoError — el equipo informático con el id indicado no
 * existe (o fue soft-deleted).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q1, F3-Q2.
 */
export class EquipoNoEncontradoError extends DomainError {
  readonly code = 'EQUIPO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Equipo informático con id "${id}" no encontrado o fue eliminado.`);
  }
}

/**
 * EquipoInvalidoError — el `equipoId` recibido al crear un ticket de
 * soporte no existe, no está `activo`, o fue eliminado (soft delete).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q4.
 */
export class EquipoInvalidoError extends DomainError {
  readonly code = 'EQUIPO_INVALIDO';

  constructor(equipoId: string) {
    super(
      `El equipo con id "${equipoId}" no existe, está inactivo, o fue eliminado. ` +
        `No puede vincularse a un ticket de soporte.`,
    );
  }
}

/**
 * NumeroSerieDuplicadoError — el `numeroSerie` provisto ya está en uso por
 * otro equipo del tenant (índice único parcial `WHERE numero_serie IS NOT NULL`).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q1.
 */
export class NumeroSerieDuplicadoError extends DomainError {
  readonly code = 'NUMERO_SERIE_DUPLICADO';

  constructor(numeroSerie: string) {
    super(`Ya existe un equipo con el número de serie "${numeroSerie}" en este tenant.`);
  }
}

/**
 * ModeloEquipoInexistenteError — el `modeloEquipoId` recibido al crear/editar
 * un equipo no corresponde a ningún modelo del catálogo `modelos_equipo` del
 * tenant (o el modelo tiene baja lógica, que para elegirlo es lo mismo que no
 * existir).
 *
 * Sin este error el id inexistente llegaba hasta la FK y volvía como el 409
 * genérico de `PrismaExceptionFilter` ("La operación afecta datos
 * relacionados"), que ni siquiera nombra el campo que hay que corregir.
 *
 * Va SEPARADO de `ModeloEquipoDeshabilitadoError` a propósito: son dos
 * arreglos distintos —corregir el id vs. habilitar el modelo—, y un solo error
 * para los dos casos deja al usuario adivinando cuál le tocó.
 * → HTTP 422 en la capa de presentación (es un valor del BODY, no el recurso
 *   de la URL).
 *
 * Ref spec: sdd/insumos-catalogo (catálogo `ModeloEquipo`).
 */
export class ModeloEquipoInexistenteError extends DomainError {
  readonly code = 'MODELO_EQUIPO_INEXISTENTE';

  constructor(modeloEquipoId: string) {
    super(
      `El campo "modeloEquipoId" apunta al modelo con id "${modeloEquipoId}", que no existe en el ` +
        `catálogo de modelos de equipo de este tenant. Elegí un modelo del catálogo o dejá el equipo sin modelo.`,
    );
  }
}

/**
 * ModeloEquipoDeshabilitadoError — el `modeloEquipoId` existe en el catálogo
 * pero el modelo está DESHABILITADO (`activo: false`).
 *
 * Este es el caso que la FK NO puede atrapar: la fila existe, así que la base
 * acepta el vínculo sin chistar y el equipo queda con un modelo que el
 * administrador ya sacó de circulación — una falla silenciosa, sin error ni
 * log. Deshabilitar un modelo significa que no se puede elegir más; si la API
 * lo acepta igual, deshabilitar no sirve para nada.
 *
 * El mensaje nombra el PAR `marca` + `modelo` además del id: el par es lo que
 * el administrador ve en el catálogo, el id no lo lee nadie.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/insumos-catalogo (catálogo `ModeloEquipo`).
 */
export class ModeloEquipoDeshabilitadoError extends DomainError {
  readonly code = 'MODELO_EQUIPO_DESHABILITADO';

  constructor(modeloEquipoId: string, marca: string, modelo: string) {
    super(
      `El campo "modeloEquipoId" apunta al modelo "${marca} ${modelo}" (id "${modeloEquipoId}"), que está ` +
        `deshabilitado. Un modelo deshabilitado no se puede elegir: habilitalo en el catálogo de modelos ` +
        `de equipo o elegí otro.`,
    );
  }
}

/**
 * TipoComponenteCodigoRequeridoError — falta `tipoComponenteCodigo` al crear
 * un componente de equipo. NORMALIZADO a `Result.fail` (ADR-9): soporte1
 * lanzaba excepción; este proyecto usa el mismo criterio Result que el
 * resto de factories.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q2. Ref: sdd/tipos-componente-master (PR4b — dominio pasa a
 * referenciar el catálogo MASTER por `codigo`, no por `id` tenant).
 *
 * TRANSITORIO: sdd/catalogo-unico-componentes lo conserva solo porque
 * `ComponenteEquipoEntity.create()` aún valida `tipoComponenteCodigo` mientras
 * la columna existe; se borra en WU-6 junto con la columna.
 */
export class TipoComponenteCodigoRequeridoError extends DomainError {
  readonly code = 'TIPO_COMPONENTE_CODIGO_REQUERIDO';

  constructor() {
    super('tipoComponenteCodigo es obligatorio para crear un componente de equipo.');
  }
}

/**
 * InsumoRepuestoInexistenteError — el `insumoId` recibido al agregar un
 * componente no existe en el catálogo de insumos del tenant, o fue dado de
 * baja lógica.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref: sdd/repuestos-vinculo-componente (WU-3).
 */
export class InsumoRepuestoInexistenteError extends DomainError {
  readonly code = 'INSUMO_REPUESTO_INEXISTENTE';

  constructor(insumoId: string) {
    super(
      `El campo "insumoId" apunta al insumo con id "${insumoId}", que no existe en el catálogo de ` +
        `este tenant o fue dado de baja. Elegí un insumo vigente del catálogo.`,
    );
  }
}

/**
 * InsumoNoEsRepuestoError — el `insumoId` recibido existe y está `activo`,
 * pero su familia tiene `esRepuesto = false`: es un consumible (tóner,
 * cartucho...), no un repuesto de equipo. El arreglo es elegir OTRO insumo,
 * de una familia marcada como repuesto.
 *
 * Va SEPARADO de `FamiliaRepuestoDeshabilitadaError` a propósito, mismo
 * criterio que `ModeloEquipoInexistenteError`/`ModeloEquipoDeshabilitadoError`
 * un poco más arriba en este archivo: son dos arreglos distintos —elegir otro
 * insumo vs. habilitar la familia en el ABM—, y un solo error para los dos
 * casos deja al usuario adivinando cuál le tocó. (Hasta WU-3 esto era un
 * único error para ambas razones; se partió por el mismo hallazgo de
 * revisión automática que separó los dos de `modeloEquipoId`.)
 * → HTTP 422 en la capa de presentación.
 *
 * Ref: sdd/repuestos-vinculo-componente (WU-3).
 */
export class InsumoNoEsRepuestoError extends DomainError {
  readonly code = 'INSUMO_NO_ES_REPUESTO';

  constructor(insumoId: string) {
    super(
      `El insumo con id "${insumoId}" no se puede vincular a un componente: su familia no es de repuesto ` +
        `(es un consumible). Elegí un insumo de una familia marcada como repuesto.`,
    );
  }
}

/**
 * FamiliaRepuestoDeshabilitadaError — el `insumoId` recibido existe y está
 * `activo`, y su familia tiene `esRepuesto = true`, pero la familia está
 * DESHABILITADA (`activo = false`).
 *
 * Mismo criterio que `ModeloEquipoDeshabilitadoError`: la fila de la familia
 * existe, así que la base acepta el vínculo sin chistar, y deshabilitar una
 * familia no serviría de nada si igual se pudiera seguir vinculando
 * repuestos de esa familia a un componente — una falla silenciosa, sin error
 * ni log. El arreglo es habilitar la familia en el ABM, no elegir otro
 * insumo: por eso este error va separado de `InsumoNoEsRepuestoError`.
 *
 * El mensaje nombra el PAR `código` + `nombre` de la familia, igual que
 * `ModeloEquipoDeshabilitadoError` nombra `marca` + `modelo`: es lo que el
 * administrador ve en el catálogo de familias, el id de la familia no lo lee
 * nadie.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref: sdd/repuestos-vinculo-componente (WU-3, hallazgo de revisión automática).
 */
export class FamiliaRepuestoDeshabilitadaError extends DomainError {
  readonly code = 'FAMILIA_REPUESTO_DESHABILITADA';

  constructor(insumoId: string, familiaCodigo: string, familiaNombre: string) {
    super(
      `El insumo con id "${insumoId}" no se puede vincular a un componente: su familia "${familiaNombre}" ` +
        `(código "${familiaCodigo}") es de repuesto pero está deshabilitada. Habilitala en el catálogo de ` +
        `familias de insumo o elegí un repuesto de otra familia.`,
    );
  }
}

/**
 * ComponenteNoEncontradoError — el componente de equipo con el id indicado
 * no existe o fue eliminado (soft delete).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q2.
 */
export class ComponenteNoEncontradoError extends DomainError {
  readonly code = 'COMPONENTE_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Componente de equipo con id "${id}" no encontrado o fue eliminado.`);
  }
}

/**
 * ComponenteDadoDeBajaError — se intentó editar un componente que ya está
 * dado de baja (soft-deleted). Hay que reactivarlo primero.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q2 (listado enriquecido — editar/reactivar componentes).
 */
export class ComponenteDadoDeBajaError extends DomainError {
  readonly code = 'COMPONENTE_DADO_DE_BAJA';

  constructor(id: string) {
    super(`El componente con id "${id}" está dado de baja. Reactivalo antes de editarlo.`);
  }
}

/**
 * ComponenteYaActivoError — se intentó reactivar un componente que ya está
 * activo (no fue soft-deleted).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-Q2 (listado enriquecido — editar/reactivar componentes).
 */
export class ComponenteYaActivoError extends DomainError {
  readonly code = 'COMPONENTE_YA_ACTIVO';

  constructor(id: string) {
    super(`El componente con id "${id}" ya está activo.`);
  }
}

/**
 * TicketSoporteNoEncontradoError — el satélite `ticket_soporte` con el
 * id/ticketId indicado no existe.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-Q4, F3-Q5.
 */
export class TicketSoporteNoEncontradoError extends DomainError {
  readonly code = 'TICKET_SOPORTE_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Ticket de soporte con id "${id}" no encontrado.`);
  }
}

/**
 * ExportacionDemasiadoGrandeError — la exportación a CSV del inventario de
 * equipos excedería el tope de filas (`TOPE_FILAS_EXPORT`, 5000).
 * → HTTP 422 en la capa de presentación.
 *
 * Mismo criterio que `tickets/domain/errors/tickets.errors.ts` (sdd/exportar-listados-csv,
 * decisión D2): existe para NO entregar un CSV truncado en silencio.
 *
 * El mensaje es DISTINTO al de tickets a propósito: este export NO tiene
 * filtros que acotar (spec, capability exportacion-equipos — "No filter
 * parameters are accepted"), así que decirle al usuario "acotá los filtros"
 * sería una instrucción imposible de seguir. El mensaje dice honestamente que
 * la lista superó el volumen soportado y señala la exportación por partes
 * como lo que hay que habilitar — un próximo paso real, no una acción que el
 * usuario no puede tomar.
 *
 * Ref: sdd/exportar-listados-csv/spec, capability exportacion-equipos.
 */
export class ExportacionDemasiadoGrandeError extends DomainError {
  readonly code = 'EXPORTACION_DEMASIADO_GRANDE';

  constructor(total: number, tope: number) {
    super(
      `El listado de equipos tiene ${total} filas y el máximo soportado por la exportación es ${tope}. ` +
        `Hace falta habilitar la exportación en partes para poder descargar este listado.`,
    );
  }
}
