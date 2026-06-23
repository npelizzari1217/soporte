/**
 * IUsuarioTiposTicketRepository — puerto para verificar elegibilidad de asignación.
 *
 * `usuario_tipos_ticket` define qué tipos de ticket puede atender un usuario
 * dentro de este tenant. NO es un permiso de RBAC: es enrutamiento de trabajo.
 *
 * La tabla es una join simple (usuario_id, tipo_ticket_id) sin audit completo
 * (solo tiene created_at, sin soft delete). El repositorio opera dentro del
 * tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:tickets-core/Tabla usuario_tipos_ticket,
 *            Elegibilidad de asignación separada de permisos]
 * Tarea: 3.A.3
 */
export interface IUsuarioTiposTicketRepository {
  /**
   * Verifica si un usuario está habilitado para atender un tipo de ticket.
   *
   * Retorna true si existe una fila en `usuario_tipos_ticket` con
   * usuario_id = usuarioId AND tipo_ticket_id = tipoTicketId.
   *
   * Usado por AsignarTicketUseCase antes de aceptar la asignación.
   */
  isUserEligibleForType(usuarioId: string, tipoTicketId: string): Promise<boolean>;

  /**
   * Retorna los IDs de tipos de ticket que puede atender un usuario.
   * Útil para filtrar tickets asignables a un agente.
   */
  findTipoIdsByUsuario(usuarioId: string): Promise<string[]>;

  /**
   * Retorna los IDs de usuarios elegibles para un tipo de ticket específico.
   * Útil para sugerir asignados en la UI.
   */
  findUsuarioIdsByTipo(tipoTicketId: string): Promise<string[]>;

  /**
   * Asigna elegibilidad a un usuario para un tipo de ticket.
   * Idempotente: no falla si ya existe la fila.
   */
  assign(usuarioId: string, tipoTicketId: string): Promise<void>;

  /**
   * Elimina elegibilidad de un usuario para un tipo de ticket.
   * No falla si la fila no existe (idempotente).
   * NOTA: Esta tabla no tiene soft delete — se elimina la fila físicamente.
   */
  revoke(usuarioId: string, tipoTicketId: string): Promise<void>;
}

/** Token de inyección de dependencias para IUsuarioTiposTicketRepository en NestJS. */
export const USUARIO_TIPOS_TICKET_REPOSITORY = Symbol('USUARIO_TIPOS_TICKET_REPOSITORY');
