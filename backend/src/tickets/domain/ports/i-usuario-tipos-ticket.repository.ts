/**
 * IUsuarioTiposTicketRepository — puerto de persistencia para el routing
 * usuario↔tipo_ticket (`usuario_tipos_ticket`, spec T3).
 *
 * "Routing": qué tipos de ticket puede atender cada usuario dentro del
 * tenant activo. NO es un permiso RBAC — es un dato de enrutamiento de
 * trabajo, consultado por `AsignarTicketUseCase` (T14/T15) para validar
 * elegibilidad, ortogonal al permiso `ticket:asignar` del asignador.
 *
 * La tabla es una join física simple (PK compuesta `usuarioId,tipoTicketId`)
 * SIN soft delete (spec T3: "MUST crear/eliminar FÍSICAMENTE la fila").
 * `usuarioId` es soft ref → master.usuarios.id (sin FK cross-DB);
 * `tipoTicketId` sí tiene FK real → tipos_ticket.id (misma DB tenant).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaUsuarioTiposTicketRepository`, PR8)
 * obtiene su PrismaClient desde `TenantContext.getClient()`.
 *
 * Ref spec: sdd/tickets-core/spec T3, T14, T15. Tarea: T8.3.
 */
/** Una fila `(usuarioId, tipoTicketId)` del routing — sin más datos (join sin soft delete). */
export interface RoutingAsociacion {
  usuarioId: string;
  tipoTicketId: string;
}

export interface IUsuarioTiposTicketRepository {
  /**
   * Retorna `true` si existe una fila `(usuarioId, tipoTicketId)` — el
   * usuario está habilitado para atender ese tipo de ticket. Usado por
   * `AsignarTicketUseCase` antes de aceptar una asignación (T14, T15).
   */
  isUserEligibleForType(usuarioId: string, tipoTicketId: string): Promise<boolean>;

  /**
   * Retorna TODAS las asociaciones del tenant activo. Usado por
   * `GET /routing` (sdd/beta-frontend item 5) — antes el frontend operaba
   * "a ciegas" (sin lista, solo POST/DELETE) para asociar/desasociar.
   */
  findAll(): Promise<RoutingAsociacion[]>;

  /**
   * Crea la fila `(usuarioId, tipoTicketId)`. Idempotente: no falla si ya
   * existe (misma PK compuesta).
   */
  assign(usuarioId: string, tipoTicketId: string): Promise<void>;

  /**
   * Elimina físicamente la fila `(usuarioId, tipoTicketId)` si existe.
   * Idempotente: no falla si la fila no existe. Sin soft delete (spec T3).
   */
  revoke(usuarioId: string, tipoTicketId: string): Promise<void>;
}

/** Token de inyección de dependencias para IUsuarioTiposTicketRepository en NestJS. */
export const USUARIO_TIPOS_TICKET_REPOSITORY = Symbol('USUARIO_TIPOS_TICKET_REPOSITORY');
