import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { esAdminDeCliente, puedeEjecutar } from '../../auth/domain/permisos.util';
import { MODULOS } from '../../shared/domain/modulos';
import { ActorTarea } from '../application/services/tareas-ticket.reglas';
import { modulosPermitidosDesdeJwt } from './alcance-ticket';

/**
 * Arma el `ActorTarea` de los casos de uso de tareas a partir del JWT (odd/tareas-con-tecnico, T3).
 *
 * Lo usan el controller de tareas del ticket y las rutas de subtareas de reparaciones que delegan
 * en él, para que las dos vías apliquen exactamente la misma regla:
 * - `esAdministrador`: ROOT o ADMINISTRADOR del cliente activo.
 * - `tienePermisoVerTodos`: `TICKETS:VER_TODOS`, igual que el detalle del ticket.
 * - `modulosConModificacion`: los módulos de `MODULOS` en los que el actor tiene
 *   `<MODULO>:MODIFICACION`, con `puedeEjecutar`.
 * - `modulosPermitidos`: los módulos del JWT (`modulosPermitidosDesdeJwt`), `null` para ROOT y
 *   ADMINISTRADOR; un ticket de un tipo de otro módulo es 404 (odd/permisos-por-tipo-ticket, S0).
 *
 * @param user JWT del actor.
 * @returns El actor de los casos de uso de tareas.
 */
export function actorTareaDesdeJwt(user: JwtPayload): ActorTarea {
  return {
    id: user.sub,
    esAdministrador: esAdminDeCliente(user),
    tienePermisoVerTodos: puedeEjecutar(user, 'TICKETS:VER_TODOS'),
    modulosConModificacion: MODULOS.filter((modulo) =>
      puedeEjecutar(user, `${modulo}:MODIFICACION`),
    ),
    modulosPermitidos: modulosPermitidosDesdeJwt(user),
  };
}

/**
 * Módulos de `MODULOS` en los que el actor tiene `<MODULO>:LECTURA`, con `puedeEjecutar` (ROOT y
 * ADMINISTRADOR los tienen todos). Lo usa el listado de tareas, que sigue el permiso de lectura del
 * módulo del tipo del ticket (odd/tareas-con-tecnico T12).
 */
export function modulosConLecturaDesdeJwt(user: JwtPayload): string[] {
  return MODULOS.filter((modulo) => puedeEjecutar(user, `${modulo}:LECTURA`));
}
