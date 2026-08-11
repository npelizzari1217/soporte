import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

/**
 * Regla de elegibilidad de un ASIGNADO por MÓDULO/CATÁLOGO, compartida por
 * `AsignarTicketUseCase` y `AsignarYPonerEnProcesoUseCase` (DRY — una sola
 * fuente de verdad de la regla, ambos flujos deben rechazar exactamente los
 * mismos asignados).
 *
 * Criterio: ROOT/ADMINISTRADOR (`esAdminTotal`) son elegibles para cualquier
 * tipo; el resto solo si tienen asignado el `modulo` del tipo ACTUAL del ticket
 * (B2: se lee la columna `tipos_ticket.modulo`, fuente de verdad). Con la
 * separación estricta cada tipo — incluidos los custom — pertenece a un módulo
 * real, así que un asignado con ese módulo ya es elegible (antes los custom
 * solo los tomaba ROOT/ADMIN por no tener módulo derivable del `codigo`).
 *
 * Ortogonal al permiso RBAC `ticket:asignar` del ACTOR (T15): un actor con el
 * permiso puede intentar asignar a alguien no elegible y de todos modos falla.
 *
 * @param asignadoId UUID del usuario que recibiría la asignación.
 * @param clienteId UUID del cliente activo (para resolver la autorización).
 * @param tipoId UUID del tipo ACTUAL del ticket a asignar.
 * @param usuarioMasterChecker Puerto cross-DB que resuelve la autorización por módulo.
 * @param tipoTicketRepo Puerto para cargar el tipo (y su `modulo`) en el tenant.
 * @returns `true` si el asignado es elegible para el tipo del ticket.
 */
export async function esAsignadoElegiblePorModulo(
  asignadoId: string,
  clienteId: string,
  tipoId: string,
  usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'getAutorizacionModulos'>,
  tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
): Promise<boolean> {
  const auth = await usuarioMasterChecker.getAutorizacionModulos(asignadoId, clienteId);
  if (auth.esAdminTotal) {
    return true;
  }

  const tipo = await tipoTicketRepo.findById(tipoId);
  if (!tipo) {
    return false;
  }

  return auth.modulos.includes(tipo.modulo);
}
