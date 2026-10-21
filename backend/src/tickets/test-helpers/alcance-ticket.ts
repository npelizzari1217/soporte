import { AlcanceActorTicket } from '../application/services/visibilidad-ticket';
import { AccionTipoTicket } from '../domain/permisos-tipo-ticket';

/**
 * Alcance de un actor con permisos por tipo, para tests (odd/permisos-por-tipo-ticket, D5 a).
 *
 * @param actorId Id del actor.
 * @param permisos Acciones concedidas por id de tipo; un tipo ausente no tiene ninguna.
 * @returns El alcance con el mapa armado.
 */
export function alcancePorTipo(
  actorId: string,
  permisos: Readonly<Record<string, readonly AccionTipoTicket[]>>,
): AlcanceActorTicket {
  return {
    actorId,
    permisosPorTipo: new Map(
      Object.entries(permisos).map(([tipoId, acciones]) => [tipoId, new Set(acciones)]),
    ),
  };
}

/**
 * Alcance de ROOT o ADMINISTRADOR, sin restricción por tipo, para tests.
 *
 * @param actorId Id del actor.
 * @returns El alcance con `permisosPorTipo` en `null`.
 */
export function alcanceSinRestriccion(actorId: string): AlcanceActorTicket {
  return { actorId, permisosPorTipo: null };
}
