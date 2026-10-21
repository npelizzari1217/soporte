import { AccionTipoTicket, TipoTicketConModulo } from '../permisos-tipo-ticket';

/**
 * Un par (tipo, acción) concedido a un usuario. `usuarioId` es un id de usuario de master
 * (referencia blanda, sin FK); `tipoId` es un tipo de ticket del tenant.
 */
export interface PermisoTipoTicketFila {
  usuarioId: string;
  tipoId: string;
  accion: AccionTipoTicket;
}

/**
 * IPermisoTipoTicketRepository — puerto de persistencia de los permisos por tipo de ticket,
 * locales al tenant (odd/tasks/permisos-por-tipo-ticket.md, D1). Sin imports de Prisma ni
 * NestJS: la implementación toma el cliente de `TenantContext`.
 */
export interface IPermisoTipoTicketRepository {
  /**
   * Acciones del usuario agrupadas por tipo. Un tipo sin filas no aparece en el mapa.
   *
   * @param usuarioId Id del usuario en master.
   * @returns Mapa `tipoId` → acciones concedidas sobre ese tipo.
   */
  listarPorUsuario(usuarioId: string): Promise<Map<string, Set<AccionTipoTicket>>>;

  /**
   * Reemplaza todas las filas del usuario por `filas`, de forma atómica: o quedan las nuevas,
   * o quedan las anteriores. Con `filas` vacío, el usuario queda sin permisos por tipo.
   *
   * @param usuarioId Id del usuario en master.
   * @param filas Pares (tipo, acción) que quedan concedidos; los repetidos se ignoran.
   */
  reemplazarDeUsuario(
    usuarioId: string,
    filas: readonly Omit<PermisoTipoTicketFila, 'usuarioId'>[],
  ): Promise<void>;

  /**
   * Inserta las filas que todavía no existen y deja intactas las que ya están. Idempotente:
   * correrlo dos veces con las mismas filas no cambia nada.
   *
   * @param filas Ternas (usuario, tipo, acción) a conceder.
   * @returns Cantidad de filas efectivamente insertadas.
   */
  agregarSiFaltan(filas: readonly PermisoTipoTicketFila[]): Promise<number>;

  /**
   * Todos los tipos de ticket del tenant que reciben permisos, con su módulo. Incluye los dados
   * de baja, con el mismo criterio que el backfill (L24): sus tickets siguen visibles y un tipo
   * reactivado no debe volver cerrado.
   *
   * @returns Id y módulo de cada tipo, dados de baja incluidos.
   */
  listarTipos(): Promise<TipoTicketConModulo[]>;
}

/** Token de inyección de dependencias para IPermisoTipoTicketRepository en NestJS. */
export const PERMISO_TIPO_TICKET_REPOSITORY = Symbol('PERMISO_TIPO_TICKET_REPOSITORY');
