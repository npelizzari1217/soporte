/**
 * IUsuarioMasterChecker — puerto mínimo para validar que un usuario existe
 * en master.usuarios y pertenece al tenant indicado.
 *
 * Se usa en CrearTicketUseCase y AsignarTicketUseCase para validar
 * soft refs cross-DB (solicitante_id, asignado_id → master.usuarios.id).
 *
 * La implementación concreta vive en tickets/infrastructure/ y consulta
 * master.usuarios vía MasterPrismaClient (no TenantContext).
 *
 * DECISIÓN INFERIDA: definición mínima con un único método para no acoplar
 * el módulo de tickets a IUsuarioRepository del módulo auth (que incluye
 * métodos de escritura no relacionados con esta validación).
 *
 * Ref spec: [SPEC:tickets-core/Validación soft refs cross-DB]
 * Tarea: 3.C.2
 */
export interface IUsuarioMasterChecker {
  /**
   * Verifica que un usuario existe en master.usuarios con deleted_at IS NULL
   * y pertenece al cliente indicado (cliente_id = clienteId).
   *
   * @param usuarioId UUID del usuario a verificar (soft ref desde tenant).
   * @param clienteId UUID del cliente desde el JWT (tenant de origen).
   * @returns true si el usuario existe, está activo y pertenece al tenant.
   *          false en cualquier otro caso.
   */
  existeEnTenant(usuarioId: string, clienteId: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IUsuarioMasterChecker en NestJS. */
export const USUARIO_MASTER_CHECKER = Symbol('USUARIO_MASTER_CHECKER');
