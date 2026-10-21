import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { puedeEjecutar } from '../../auth/domain/permisos.util';
import { AlcanceActorTicket } from '../application/services/visibilidad-ticket';

/**
 * Módulos que acotan los tickets que ve el actor. ROOT y ADMINISTRADOR ven los tipos de todos los
 * módulos (incluidos los propios del tenant): `null` significa "sin restricción".
 *
 * @param user JWT del actor.
 * @returns Los módulos del JWT, o `null` para ROOT y ADMINISTRADOR.
 */
export function modulosPermitidosDesdeJwt(user: JwtPayload): string[] | null {
  return user.is_global_admin || user.rol === 'ADMINISTRADOR' ? null : user.modulos;
}

/**
 * Arma el `AlcanceActorTicket` con el que la capa de aplicación decide si el actor ve un ticket
 * (odd/permisos-por-tipo-ticket, S0). Lo comparten el detalle, el timeline, el PDF y la API v1,
 * para que todas las lecturas por id apliquen la misma regla que el listado.
 *
 * @param user JWT del actor.
 * @returns Id del actor, `TICKETS:VER_TODOS` y los módulos permitidos.
 */
export function alcanceTicketDesdeJwt(user: JwtPayload): AlcanceActorTicket {
  return {
    actorId: user.sub,
    tienePermisoVerTodos: puedeEjecutar(user, 'TICKETS:VER_TODOS'),
    modulosPermitidos: modulosPermitidosDesdeJwt(user),
  };
}
