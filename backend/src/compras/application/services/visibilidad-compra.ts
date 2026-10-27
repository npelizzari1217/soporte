import { DomainError, Result } from '../../../shared/domain/result';
import {
  AlcanceActorTicket,
  tieneAccionSobreTipo,
} from '../../../tickets/application/services/visibilidad-ticket';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import {
  CompraNoEncontradaError,
  TipoTicketDeCompraInvalidoError,
  TipoTicketDeCompraNoPermitidoError,
} from '../../domain/errors/compras.errors';
import { CompraParaVisibilidad, ICompraRepository } from '../../domain/ports/i-compra.repository';

/**
 * Visibilidad y alta de compras por tipo de ticket (odd/compras-por-tipo, opción A del dueño): el
 * permiso sale de la matriz por tipo de ticket que ya existe. Las casillas de la fila Compras
 * deciden la acción (las exige `AccionesGuard` en cada ruta); el tipo decide sobre qué compras.
 *
 * - Ver una compra exige LECTURA sobre su tipo (S2). Una compra sin tipo la ve cualquiera que
 *   llegue a la ruta, es decir, con LECTURA de Compras (S4).
 * - Crearla, o pasarla a otro tipo, exige ALTAS sobre ese tipo (S2, S3).
 * - ROOT y ADMINISTRADOR (`permisosPorTipo` en `null`) no tienen restricción por tipo.
 *
 * Es el punto único de la regla: lo usan el guard de las rutas `/compras/:id...`, el listado, la
 * exportación, el alta, la edición y el vínculo de una compra con un ticket.
 */

/**
 * ¿El actor ve la compra? Sin tipo (S4) o sin restricción, siempre.
 *
 * @param compra Tipo de la compra.
 * @param alcance Alcance del actor.
 * @returns `true` si el actor tiene LECTURA sobre el tipo de la compra, o si no aplica.
 */
export function esCompraVisiblePara(
  compra: CompraParaVisibilidad,
  alcance: AlcanceActorTicket,
): boolean {
  if (compra.tipoTicketId === null) return true;
  return tieneAccionSobreTipo(alcance, compra.tipoTicketId, 'LECTURA');
}

/**
 * Los tipos cuyas compras ve el actor, para filtrar un listado en la base (S5). Las compras sin
 * tipo entran siempre: eso lo agrega la consulta, no esta lista.
 *
 * @param alcance Alcance del actor.
 * @returns Los ids de tipo con LECTURA, o `undefined` sin restricción (ROOT y ADMINISTRADOR).
 */
export function tiposVisiblesDeCompras(alcance: AlcanceActorTicket): string[] | undefined {
  if (alcance.permisosPorTipo === null) return undefined;
  return [...alcance.permisosPorTipo]
    .filter(([, acciones]) => acciones.has('LECTURA'))
    .map(([tipoId]) => tipoId);
}

/**
 * Decide si el actor puede operar sobre una compra existente por su id (S2): si la compra existe
 * y el actor no la ve, `CompraNoEncontradaError` (404), el mismo error que una inexistente, para
 * no revelar que existe. Una compra inexistente o dada de baja pasa: el caso de uso responde su
 * propio 404. Sin restricción no consulta la base.
 *
 * @param compraRepo Repositorio de compras.
 * @param compraId Id de la compra.
 * @param alcance Alcance del actor.
 * @returns Ok, o el 404.
 */
export async function verificarCompraVisible(
  compraRepo: Pick<ICompraRepository, 'findParaVisibilidad'>,
  compraId: string,
  alcance: AlcanceActorTicket,
): Promise<Result<void, DomainError>> {
  if (alcance.permisosPorTipo === null) return Result.ok(undefined);
  const compra = await compraRepo.findParaVisibilidad(compraId);
  if (compra !== null && !esCompraVisiblePara(compra, alcance)) {
    return Result.fail(new CompraNoEncontradaError(compraId));
  }
  return Result.ok(undefined);
}

/**
 * Exige que el tipo elegido para una compra nueva, o para reasignar una existente, sea elegible y
 * que el actor tenga ALTAS sobre él (S3). Un tipo inexistente, desactivado o dado de baja es
 * `TipoTicketDeCompraInvalidoError` (400); sin ALTAS, `TipoTicketDeCompraNoPermitidoError` (403).
 * Solo lee: quien lo llama todavía no escribió nada.
 *
 * @param tipoRepo Catálogo de tipos de ticket.
 * @param tipoTicketId Tipo elegido.
 * @param alcance Alcance del actor.
 * @returns El tipo, o el 400 o el 403.
 */
export async function exigirAltaSobreTipoDeCompra(
  tipoRepo: Pick<ITipoTicketRepository, 'findById'>,
  tipoTicketId: string,
  alcance: AlcanceActorTicket,
): Promise<Result<TipoTicketEntity, DomainError>> {
  const tipo = await tipoRepo.findById(tipoTicketId);
  if (!tipo || tipo.isDeleted() || !tipo.activo) {
    return Result.fail(new TipoTicketDeCompraInvalidoError(tipoTicketId));
  }
  if (!tieneAccionSobreTipo(alcance, tipo.id, 'ALTAS')) {
    return Result.fail(new TipoTicketDeCompraNoPermitidoError(tipo.nombre));
  }
  return Result.ok(tipo);
}
