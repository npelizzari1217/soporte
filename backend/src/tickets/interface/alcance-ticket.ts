import { Inject, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { esAdminDeCliente } from '../../auth/domain/permisos.util';
import { AlcanceActorTicket } from '../application/services/visibilidad-ticket';
import { ActorTarea } from '../application/services/tareas-ticket.reglas';
import {
  IPermisoTipoTicketRepository,
  PERMISO_TIPO_TICKET_REPOSITORY,
} from '../domain/ports/i-permiso-tipo-ticket.repository';
import { actorTareaDesdeAlcance } from './actor-tarea';

/**
 * Carga, por request, el `AlcanceActorTicket` con el que la capa de aplicación decide qué ve y qué
 * hace el actor sobre un ticket existente (odd/permisos-por-tipo-ticket, D1, D5 a). Los permisos
 * por tipo viven en la tabla `permisos_tipo_ticket` del tenant y no viajan en el JWT: se leen con
 * una consulta indexada por usuario, del tenant que `TenantGuard` ya dejó ligado. Lo usan las
 * operaciones por id, el alta, los listados y las métricas (D5 c-e). Las celdas `TICKETS:*` del
 * JWT no deciden nada acá.
 */
@Injectable()
export class CargadorAlcanceTicket {
  constructor(
    @Inject(PERMISO_TIPO_TICKET_REPOSITORY)
    private readonly permisos: Pick<IPermisoTipoTicketRepository, 'listarPorUsuario'>,
  ) {}

  /**
   * ROOT y ADMINISTRADOR quedan sin restricción (`permisosPorTipo: null`) y no consultan la tabla.
   *
   * @param user JWT del actor.
   * @returns El alcance del actor.
   */
  async cargar(user: JwtPayload): Promise<AlcanceActorTicket> {
    if (esAdminDeCliente(user)) return { actorId: user.sub, permisosPorTipo: null };
    return { actorId: user.sub, permisosPorTipo: await this.permisos.listarPorUsuario(user.sub) };
  }

  /**
   * El actor de los casos de uso de tareas, con el mismo alcance que `cargar`.
   *
   * @param user JWT del actor.
   * @returns El actor de tareas.
   */
  async cargarActorTarea(user: JwtPayload): Promise<ActorTarea> {
    return actorTareaDesdeAlcance(user, await this.cargar(user));
  }
}
