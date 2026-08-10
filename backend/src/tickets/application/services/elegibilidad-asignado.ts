import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { MODULO_A_TIPO_CODIGO } from '../../../shared/domain/modulos';

/**
 * Regla de elegibilidad de un ASIGNADO por MÓDULO/CATÁLOGO, compartida por
 * `AsignarTicketUseCase` y `AsignarYPonerEnProcesoUseCase` (DRY — una sola
 * fuente de verdad de la regla, ambos flujos deben rechazar exactamente los
 * mismos asignados).
 *
 * Criterio (espeja `resolverScope`): ROOT/ADMINISTRADOR (`esAdminTotal`) son
 * elegibles para cualquier tipo; el resto solo si tienen el módulo que mapea
 * al tipo ACTUAL del ticket (`MODULO_A_TIPO_CODIGO`). Los tipos custom (sin
 * módulo) solo los puede tomar ROOT/ADMINISTRADOR.
 *
 * Ortogonal al permiso RBAC `ticket:asignar` del ACTOR (T15): un actor con el
 * permiso puede intentar asignar a alguien no elegible y de todos modos falla.
 *
 * @param asignadoId UUID del usuario que recibiría la asignación.
 * @param clienteId UUID del cliente activo (para resolver la autorización).
 * @param tipoId UUID del tipo ACTUAL del ticket a asignar.
 * @param usuarioMasterChecker Puerto cross-DB que resuelve la autorización por módulo.
 * @param tipoTicketRepo Puerto para resolver `codigo de tipo → id` en el tenant.
 * @returns `true` si el asignado es elegible para el tipo del ticket.
 */
export async function esAsignadoElegiblePorModulo(
  asignadoId: string,
  clienteId: string,
  tipoId: string,
  usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'getAutorizacionModulos'>,
  tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
): Promise<boolean> {
  const auth = await usuarioMasterChecker.getAutorizacionModulos(asignadoId, clienteId);
  if (auth.esAdminTotal) {
    return true;
  }

  const codigosPermitidos = auth.modulos
    .map((modulo) => MODULO_A_TIPO_CODIGO[modulo])
    .filter((codigo): codigo is string => Boolean(codigo));
  const tipoIdsPermitidos = (
    await Promise.all(codigosPermitidos.map((codigo) => tipoTicketRepo.findIdByCodigo(codigo)))
  ).filter((id): id is string => id !== null);

  return tipoIdsPermitidos.includes(tipoId);
}
