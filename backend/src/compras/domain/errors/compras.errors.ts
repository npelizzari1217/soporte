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
 * Errores -> HTTP, 19 errores: 2×409 + 2×404 + 15×422). Ref tasks: PR-5.
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
 * CompraConComprasRegistradasError — se intentó cancelar una compra que
 * tiene al menos un ítem con `cantidadComprada > 0`. El camino correcto para
 * ese caso es cerrar el/los ítem(s) con faltante, no cancelar la compra.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S29.
 */
export class CompraConComprasRegistradasError extends DomainError {
  readonly code = 'COMPRA_CON_COMPRAS_REGISTRADAS';

  constructor(compraId: string) {
    super(
      `La compra "${compraId}" tiene al menos un ítem con compras registradas. ` +
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
 * CantidadCompradaExcedeSolicitadaError — la `cantidadComprada` registrada
 * excedería la `cantidad` solicitada del ítem.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S17.
 */
export class CantidadCompradaExcedeSolicitadaError extends DomainError {
  readonly code = 'CANTIDAD_COMPRADA_EXCEDE_SOLICITADA';

  constructor(itemId: string) {
    super(
      `La cantidad comprada registrada para el ítem "${itemId}" excede la cantidad solicitada.`,
    );
  }
}

/**
 * CantidadCompradaRetrocedeError — la `cantidadComprada` registrada sería
 * menor a la ya acumulada. `cantidadComprada` nunca retrocede (spec §7.3).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S18.
 */
export class CantidadCompradaRetrocedeError extends DomainError {
  readonly code = 'CANTIDAD_COMPRADA_RETROCEDE';

  constructor(itemId: string) {
    super(
      `La cantidad comprada del ítem "${itemId}" no puede retroceder respecto de la ya registrada.`,
    );
  }
}

/**
 * CantidadEntregadaExcedeCompradaError — la `cantidadEntregada` registrada
 * excedería la `cantidadComprada` del ítem.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S20.
 */
export class CantidadEntregadaExcedeCompradaError extends DomainError {
  readonly code = 'CANTIDAD_ENTREGADA_EXCEDE_COMPRADA';

  constructor(itemId: string) {
    super(`La cantidad entregada registrada para el ítem "${itemId}" excede la cantidad comprada.`);
  }
}

/**
 * CantidadEntregadaRetrocedeError — la `cantidadEntregada` registrada sería
 * menor a la ya acumulada. `cantidadEntregada` nunca retrocede (spec §7.3).
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
 * tiene faltante real (`cantidadComprada >= cantidad`).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: S23.
 */
export class ItemSinFaltanteError extends DomainError {
  readonly code = 'ITEM_SIN_FALTANTE';

  constructor(itemId: string) {
    super(
      `El ítem de compra "${itemId}" no tiene faltante real (la cantidad comprada ` +
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
