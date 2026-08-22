import {
  CompraParaDerivacion,
  derivarGrupoEstadoCompra,
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

/**
 * Compra vinculada, en la forma mínima que `derivarGrupoEstadoCompra`
 * necesita para derivar el bloqueo (`CompraParaDerivacion`), más su
 * identidad visible (`compraId`/`numero`) para poder mostrarla en el chip
 * del listado sin una consulta aparte.
 */
export interface CompraVinculada extends CompraParaDerivacion {
  readonly compraId: string;
  readonly numero: string;
}

/**
 * Compras que HOY frenan la reparación: las vinculadas cuyo grupo de estado
 * derivado es `ACTIVAS`.
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
  return vinculadas.filter((compra) => derivarGrupoEstadoCompra(compra) === 'ACTIVAS');
}
