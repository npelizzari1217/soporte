import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { esAdminDeCliente } from '../../auth/domain/permisos.util';
import { AlcanceActorTicket } from '../application/services/visibilidad-ticket';
import { ActorTarea } from '../application/services/tareas-ticket.reglas';

/**
 * Arma el `ActorTarea` de los casos de uso de tareas (odd/tareas-con-tecnico, T3) a partir del JWT
 * y del alcance por tipo ya cargado (`CargadorAlcanceTicket`, odd/permisos-por-tipo-ticket D5 a):
 * - `esAdministrador`: ROOT o ADMINISTRADOR del cliente activo.
 * - `permisosPorTipo`: las acciones del actor por tipo de ticket, `null` para ROOT y ADMINISTRADOR.
 *   Ver las tareas exige `LECTURA` sobre el tipo y gestionarlas, `MODIFICACION`.
 *
 * @param user JWT del actor.
 * @param alcance Alcance por tipo del actor.
 * @returns El actor de los casos de uso de tareas.
 */
export function actorTareaDesdeAlcance(user: JwtPayload, alcance: AlcanceActorTicket): ActorTarea {
  return {
    id: alcance.actorId,
    esAdministrador: esAdminDeCliente(user),
    permisosPorTipo: alcance.permisosPorTipo,
  };
}
