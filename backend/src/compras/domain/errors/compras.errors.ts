import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `compras/` (redisenio-modulo-compras, PR-5).
 *
 * Mismo patrón que `tickets/domain/errors/tickets.errors.ts` y
 * `equipos/domain/errors/equipos.errors.ts`: cada error extiende
 * `DomainError`, expone un `code` estable y se modela con `Result.fail()` —
 * nunca `throw` para fallos esperados del dominio.
 *
 * Convención de mapeo a HTTP (spec §5): 404 no existe/no visible · 409
 * precondición de infraestructura de negocio · 422 invariante de dominio.
 * 403 es RBAC resuelto por guard, nunca un `DomainError`. El JSDoc de cada
 * error declara su HTTP — PR-21 construye el `it.each` de error -> HTTP
 * esperado a partir de este contrato, no lo inventa de nuevo.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4 (escenarios) y §5 (catálogo
 * Errores -> HTTP, 19 errores base: 2×409 + 2×404 + 15×422). Ref tasks: PR-5.
 *
 * **WU-15 (`sdd/compras-tres-etapas-y-sectores`, ADR-T2)**: catálogo
 * ampliado a 23 — 2 errores de cantidad nuevos (`CantidadOrdenadaExcede...`/
 * `...Retrocede`), 2 errores de fecha nuevos (`FechaEtapaFuturaError`/
 * `FechaEtapasFueraDeOrdenError`), y 5 renombres (3 de cantidad +
 * `CompraConOrdenEmitidaError`) que NO cambian la cuenta — todos siguen
 * 422 salvo los 2×409/2×404 heredados.
 */

// ─── 409 — precondición de infraestructura de negocio ──────────────────────

/**
 * SinCicloActivoError — no hay un `CicloCliente` con `activo=true` en el
 * tenant al intentar crear una compra. El servidor resuelve el ciclo, nunca
 * el caller; sin ciclo activo no se crea la compra ni se emite numerador.
 * → HTTP 409 en la capa de presentación.
 *
 * Ref spec: S2.
 */
export class SinCicloActivoError extends DomainError {
  readonly code = 'SIN_CICLO_ACTIVO';

  constructor() {
    super('No hay un ciclo activo en este tenant. No se puede crear la compra.');
  }
}

/**
 * NumeradorCompraAgotadoError — la secuencia anual del numerador de compras
 * (`COM-{anio}-{00000}`) superaría los 5 dígitos (> 99999) al generar el
 * próximo número.
 * → HTTP 409 en la capa de presentación.
 *
 * Ref spec: §1 (formato `COM-{anio}-{00000}`), §5.
 */
export class NumeradorCompraAgotadoError extends DomainError {
  readonly code = 'NUMERADOR_COMPRA_AGOTADO';

  constructor(anio: number) {
    super(
      `NumeradorCompra: la secuencia del año ${anio} superó el máximo de 99999. ` +
        `No se pueden generar más números en este ciclo.`,
    );
  }
}

// ─── 404 — no existe / no visible ───────────────────────────────────────────

/**
 * CompraNoEncontradaError — la compra con el id indicado no existe en el
 * tenant activo (o fue soft-deleted).
 * → HTTP 404 en la capa de presentación.
 */
export class CompraNoEncontradaError extends DomainError {
  readonly code = 'COMPRA_NO_ENCONTRADA';

  constructor(compraId: string) {
    super(`Compra con id "${compraId}" no encontrada.`);
  }
}

/**
 * ItemCompraNoEncontradoError — el ítem de compra con el id indicado no
 * existe (o fue soft-deleted).
 * → HTTP 404 en la capa de presentación.
 */
export class ItemCompraNoEncontradoError extends DomainError {
  readonly code = 'ITEM_COMPRA_NO_ENCONTRADO';

  constructor(itemId: string) {
    super(`Ítem de compra con id "${itemId}" no encontrado.`);
  }
}

// ─── 422 — invariante de dominio ────────────────────────────────────────────

/**
 * CompraCanceladaError — se intentó mutar (agregar/editar/eliminar ítems,
 * registrar avance) una compra que ya está cancelada (`canceladaEn != null`,
 * Regla 0 de la tabla de verdad de estado de cabecera).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S5.
 */
export class CompraCanceladaError extends DomainError {
  readonly code = 'COMPRA_CANCELADA';

  constructor(compraId: string) {
    super(`La compra "${compraId}" está cancelada. No admite nuevas mutaciones.`);
  }
}

/**
 * CompraYaCanceladaError — se intentó cancelar una compra que ya está
 * cancelada.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S30.
 */
export class CompraYaCanceladaError extends DomainError {
  readonly code = 'COMPRA_YA_CANCELADA';

  constructor(compraId: string) {
    super(`La compra "${compraId}" ya está cancelada.`);
  }
}

/**
 * CompraYaCerradaError — se intentó cancelar una compra que ya está cerrada
 * (todos los ítems aprobados fueron entregados o cerrados con faltante).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S28.
 */
export class CompraYaCerradaError extends DomainError {
  readonly code = 'COMPRA_YA_CERRADA';

  constructor(compraId: string) {
    super(`La compra "${compraId}" ya está cerrada. No se puede cancelar.`);
  }
}

/**
 * CompraConOrdenEmitidaError — se intentó cancelar una compra que tiene al
 * menos un ítem con `cantidadOrdenada > 0`. Una orden emitida es un
 * compromiso tomado FUERA del sistema (decisión del usuario,
 * `sdd/compras-tres-etapas-y-sectores/decision-cancelacion`) — cancelar en
 * la app sin cancelar con el proveedor deja al sistema mintiendo sobre la
 * realidad. El camino correcto para remediar es cerrar el/los ítem(s) con
 * faltante, no cancelar la compra.
 *
 * **Renombrada** (WU-15, `compras-tres-etapas-y-sectores` R13/S68/S69):
 * reemplaza a `CompraConComprasRegistradasError` — con la etapa de ORDEN
 * nueva, el guard pasó de mirar `cantidadComprada` (hoy `cantidadRecibida`)
 * a mirar `cantidadOrdenada`, así que el nombre viejo ya no describe qué
 * valida. La condición sigue siendo ÚNICA (no compuesta con
 * `cantidadRecibida > 0`): por el invariante `cantidadRecibida ≤
 * cantidadOrdenada`, `cantidadOrdenada > 0` subsume estructuralmente haber
 * recibido algo.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R13, S68, S69.
 */
export class CompraConOrdenEmitidaError extends DomainError {
  readonly code = 'COMPRA_CON_ORDEN_EMITIDA';

  constructor(compraId: string) {
    super(
      `La compra "${compraId}" tiene al menos un ítem con orden emitida. ` +
        `Cerrá el/los ítems con faltante en vez de cancelar la compra.`,
    );
  }
}

/**
 * ItemCompraAprobadoNoEliminableError — se intentó eliminar un ítem de
 * compra ya aprobado. Solo los ítems PENDIENTE o RECHAZADO se pueden
 * eliminar.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S7.
 */
export class ItemCompraAprobadoNoEliminableError extends DomainError {
  readonly code = 'ITEM_COMPRA_APROBADO_NO_ELIMINABLE';

  constructor(itemId: string) {
    super(`El ítem de compra "${itemId}" está aprobado y no se puede eliminar.`);
  }
}

/**
 * ItemCompraYaDecididoError — se intentó aprobar o rechazar un ítem de
 * compra que ya fue decidido (la decisión es una máquina de un solo paso,
 * sin retorno). NO muta ni registra bitácora.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S10.
 */
export class ItemCompraYaDecididoError extends DomainError {
  readonly code = 'ITEM_COMPRA_YA_DECIDIDO';

  constructor(itemId: string) {
    super(`El ítem de compra "${itemId}" ya fue decidido (aprobado o rechazado).`);
  }
}

/**
 * ItemCompraCongeladoError — se intentó editar `cantidad`/`monto`/`moneda`
 * de un ítem que ya no está PENDIENTE (APROBADO o RECHAZADO — ambos
 * congelan esos campos; los campos libres como `descripcion`/`proveedor`
 * siguen editables en APROBADO).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S13.
 */
export class ItemCompraCongeladoError extends DomainError {
  readonly code = 'ITEM_COMPRA_CONGELADO';

  constructor(itemId: string) {
    super(
      `El ítem de compra "${itemId}" ya fue decidido y sus datos de solicitud ` +
        `(cantidad/monto/moneda) están congelados.`,
    );
  }
}

/**
 * ItemCompraNoAprobadoError — se intentó registrar una compra sobre un
 * ítem que no está APROBADO.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S16.
 */
export class ItemCompraNoAprobadoError extends DomainError {
  readonly code = 'ITEM_COMPRA_NO_APROBADO';

  constructor(itemId: string) {
    super(`El ítem de compra "${itemId}" no está aprobado. No se puede registrar una compra.`);
  }
}

/**
 * CantidadOrdenadaExcedeSolicitadaError — la `cantidadOrdenada` registrada
 * excedería la `cantidad` solicitada del ítem.
 *
 * **Nueva** (WU-15, `compras-tres-etapas-y-sectores` R1/R2, ADR-T2): la
 * etapa de ORDEN es la primera de las tres — su techo es la cantidad
 * solicitada, igual que antes lo era para "comprada".
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S45.
 */
export class CantidadOrdenadaExcedeSolicitadaError extends DomainError {
  readonly code = 'CANTIDAD_ORDENADA_EXCEDE_SOLICITADA';

  constructor(itemId: string) {
    super(
      `La cantidad ordenada registrada para el ítem "${itemId}" excede la cantidad solicitada.`,
    );
  }
}

/**
 * CantidadOrdenadaRetrocedeError — la `cantidadOrdenada` registrada sería
 * menor a la ya acumulada. `cantidadOrdenada` nunca retrocede (mismo
 * criterio que las otras dos cantidades de ejecución).
 *
 * **Nueva** (WU-15, `compras-tres-etapas-y-sectores` R2, ADR-T2).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S46.
 */
export class CantidadOrdenadaRetrocedeError extends DomainError {
  readonly code = 'CANTIDAD_ORDENADA_RETROCEDE';

  constructor(itemId: string) {
    super(
      `La cantidad ordenada del ítem "${itemId}" no puede retroceder respecto de la ya registrada.`,
    );
  }
}

/**
 * CantidadRecibidaExcedeOrdenadaError — la `cantidadRecibida` registrada
 * excedería la `cantidadOrdenada` del ítem.
 *
 * **Renombrada** (WU-15, `compras-tres-etapas-y-sectores` R1/R2, ADR-T2):
 * reemplaza a `CantidadCompradaExcedeSolicitadaError`. Bajo el modelo de
 * tres etapas, "recibida" (antes "comprada") ya no se acota contra la
 * cantidad SOLICITADA sino contra la cantidad ORDENADA — el nombre viejo
 * mentía sobre contra qué validaba.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S43.
 */
export class CantidadRecibidaExcedeOrdenadaError extends DomainError {
  readonly code = 'CANTIDAD_RECIBIDA_EXCEDE_ORDENADA';

  constructor(itemId: string) {
    super(`La cantidad recibida registrada para el ítem "${itemId}" excede la cantidad ordenada.`);
  }
}

/**
 * CantidadRecibidaRetrocedeError — la `cantidadRecibida` registrada sería
 * menor a la ya acumulada. `cantidadRecibida` nunca retrocede.
 *
 * **Renombrada** (WU-15): reemplaza a `CantidadCompradaRetrocedeError`.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S46.
 */
export class CantidadRecibidaRetrocedeError extends DomainError {
  readonly code = 'CANTIDAD_RECIBIDA_RETROCEDE';

  constructor(itemId: string) {
    super(
      `La cantidad recibida del ítem "${itemId}" no puede retroceder respecto de la ya registrada.`,
    );
  }
}

/**
 * CantidadEntregadaExcedeRecibidaError — la `cantidadEntregada` registrada
 * excedería la `cantidadRecibida` del ítem.
 *
 * **Renombrada** (WU-15): reemplaza a `CantidadEntregadaExcedeCompradaError`
 * — el campo contra el que se acota pasó de `cantidadComprada` a
 * `cantidadRecibida` (mismo campo físico, nombre nuevo tras el `RENAME
 * COLUMN` de M2).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S44.
 */
export class CantidadEntregadaExcedeRecibidaError extends DomainError {
  readonly code = 'CANTIDAD_ENTREGADA_EXCEDE_RECIBIDA';

  constructor(itemId: string) {
    super(`La cantidad entregada registrada para el ítem "${itemId}" excede la cantidad recibida.`);
  }
}

/**
 * CantidadEntregadaRetrocedeError — la `cantidadEntregada` registrada sería
 * menor a la ya acumulada. `cantidadEntregada` nunca retrocede (spec §7.3).
 * SIN CAMBIO de nombre (WU-15/ADR-T2: es el único de los cinco que no
 * necesitaba renombrarse — el campo que valida no cambió de nombre).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S21.
 */
export class CantidadEntregadaRetrocedeError extends DomainError {
  readonly code = 'CANTIDAD_ENTREGADA_RETROCEDE';

  constructor(itemId: string) {
    super(
      `La cantidad entregada del ítem "${itemId}" no puede retroceder respecto de la ya registrada.`,
    );
  }
}

/**
 * FechaEtapaFuturaError — se intentó registrar/editar la fecha de una etapa
 * (orden/recepción/entrega) posterior al día de hoy (fecha LOCAL de
 * Argentina, ver `domain/services/fecha-argentina.ts`).
 *
 * **Nueva** (WU-15, `compras-tres-etapas-y-sectores` R5, ADR-T2/ADR-T3).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S53.
 */
export class FechaEtapaFuturaError extends DomainError {
  readonly code = 'FECHA_ETAPA_FUTURA';

  constructor(itemId: string) {
    super(`La fecha de etapa registrada para el ítem "${itemId}" no puede ser posterior a hoy.`);
  }
}

/**
 * FechaEtapasFueraDeOrdenError — el conjunto de fechas no nulas
 * (`fechaOrden`/`fechaRecepcion`/`fechaEntrega`) de un ítem, tras aplicar la
 * escritura/edición solicitada, dejaría de cumplir `fechaOrden ≤
 * fechaRecepcion ≤ fechaEntrega`.
 *
 * **Nueva** (WU-15, `compras-tres-etapas-y-sectores` R5, ADR-T2/ADR-T3).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec S54, S55.
 */
export class FechaEtapasFueraDeOrdenError extends DomainError {
  readonly code = 'FECHA_ETAPAS_FUERA_DE_ORDEN';

  constructor(itemId: string) {
    super(
      `Las fechas de etapa del ítem "${itemId}" quedarían fuera de orden ` +
        `(fechaOrden ≤ fechaRecepcion ≤ fechaEntrega).`,
    );
  }
}

/**
 * ItemCompraYaCerradoError — se intentó registrar compra, entrega, o un
 * nuevo cierre con faltante sobre un ítem que ya fue cerrado con faltante.
 * `cerradoConFaltante` es TERMINAL (spec §6.3): bloquea cualquier mutación
 * posterior de cantidades sobre ese ítem.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S25.
 */
export class ItemCompraYaCerradoError extends DomainError {
  readonly code = 'ITEM_COMPRA_YA_CERRADO';

  constructor(itemId: string) {
    super(
      `El ítem de compra "${itemId}" ya fue cerrado con faltante (estado terminal). ` +
        `No admite nuevas compras, entregas ni cierres.`,
    );
  }
}

/**
 * ItemSinFaltanteError — se intentó cerrar con faltante un ítem que no
 * tiene faltante real (`cantidadRecibida >= cantidad`, WU-15/R3: el campo
 * que valida esta regla se renombró de `cantidadComprada`, la lógica no
 * cambió).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S23.
 */
export class ItemSinFaltanteError extends DomainError {
  readonly code = 'ITEM_SIN_FALTANTE';

  constructor(itemId: string) {
    super(
      `El ítem de compra "${itemId}" no tiene faltante real (la cantidad recibida ` +
        `ya alcanza la solicitada). No se puede cerrar con faltante.`,
    );
  }
}

/**
 * MotivoCierreFaltanteRequeridoError — se intentó cerrar un ítem con
 * faltante sin proveer `motivoCierreFaltante`.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S24.
 */
export class MotivoCierreFaltanteRequeridoError extends DomainError {
  readonly code = 'MOTIVO_CIERRE_FALTANTE_REQUERIDO';

  constructor(itemId: string) {
    super(`motivoCierreFaltante es obligatorio para cerrar con faltante el ítem "${itemId}".`);
  }
}
