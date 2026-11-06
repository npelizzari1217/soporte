import {
  CompraParaDerivacion,
  derivarGrupoEstadoCompra,
  ItemParaDerivacion,
} from '../../../compras/domain/services/estado-compra';

/**
 * comprasQueBloquean — deriva qué compras vinculadas frenan HOY una
 * reparación. ÚNICO lugar del sistema donde se decide qué es una reparación
 * bloqueada.
 *
 * NO re-deriva la regla de compras: **importa** `derivarGrupoEstadoCompra`
 * de `compras/domain/services/estado-compra.ts` sin modificarla (design D1).
 * El import `reparaciones/domain → compras/domain` es lint-limpio: la
 * fitness rule de eslint (`backend/eslint.config.js:117-130`) solo restringe
 * `@prisma/client`/`.prisma/*` fuera de `**\/infrastructure/**`, no el cruce
 * entre módulos del mismo anillo — mismo precedente que
 * `listar-reparaciones.use-case.ts` importando de `tickets/domain/`.
 *
 * Ref spec: sdd/reparacion-bloqueada-por-compra/spec, capability "Estado de
 * bloqueo derivado". Ref design: contrato `bloqueo-reparacion.ts`, D1.
 * Tarea: WU1.7.
 */

/** Ítem de una compra vinculada: lo que pide la derivación, más si es de servicio (S2). */
export interface ItemVinculado extends ItemParaDerivacion {
  readonly esServicio: boolean;
}

/**
 * Compra vinculada, en la forma mínima que `derivarGrupoEstadoCompra`
 * necesita para derivar el bloqueo (`CompraParaDerivacion`), más su
 * identidad visible (`compraId`/`numero`) para poder mostrarla en el chip
 * del listado sin una consulta aparte.
 */
export interface CompraVinculada extends CompraParaDerivacion {
  readonly compraId: string;
  readonly numero: string;
  /**
   * Tipo de ticket de la compra (odd/compras-por-tipo), o `null` si no tiene. No interviene en el
   * bloqueo: decide solo quién ve la compra en la lista del ticket.
   */
  readonly tipoTicketId: string | null;
  readonly items: readonly ItemVinculado[];
}

/**
 * Compras que HOY frenan la reparación: las vinculadas cuyo grupo de estado
 * derivado es `ACTIVAS`, salvo las que son solo de servicio.
 *
 * Una compra cuyos ítems activos son TODOS de servicio es un presupuesto de
 * obra (odd/edilicia-obra-externa, S2): el trabajo avanza mientras se ejecuta,
 * así que no frena el ticket, cualquiera sea su modalidad. Una compra mixta
 * sigue bloqueando, porque espera insumos. Un ítem RECHAZADO no cuenta para
 * esa decisión: no se va a comprar (odd/decisiones-obra-externa, S3).
 *
 * Caso aceptado a propósito (no un bug): una compra vinculada SIN ítems
 * cargados (`items: []`) bloquea igual — `derivarGrupoEstadoCompra` cae en
 * T1/`PENDIENTE` con `n=0`, mismo criterio que el listado de compras.
 *
 * `bloqueada` no es un campo de esta función: el caller (`ListarReparacionesUseCase`,
 * WU3) lo calcula como `comprasQueBloquean(...).length > 0`.
 *
 * @param vinculadas Compras vinculadas a UNA reparación (ya resueltas por lote, WU3).
 */
export function comprasQueBloquean(
  vinculadas: readonly CompraVinculada[],
): readonly CompraVinculada[] {
  return vinculadas.filter(
    (compra) => derivarGrupoEstadoCompra(compra) === 'ACTIVAS' && !esSoloDeServicio(compra),
  );
}

/**
 * `true` si la compra tiene ítems no rechazados y todos son de servicio. Los RECHAZADOS se
 * descartan porque no se van a comprar (S3). Sin ítems vigentes NO es solo de servicio: "todos"
 * sobre un conjunto vacío es verdadero por vacuidad, y la convertiría en una compra que no
 * bloquea sin que nadie haya dicho qué contrata.
 */
function esSoloDeServicio(compra: CompraVinculada): boolean {
  const vigentes = compra.items.filter((item) => item.estadoAprobacion !== 'RECHAZADO');
  return vigentes.length > 0 && vigentes.every((item) => item.esServicio);
}
