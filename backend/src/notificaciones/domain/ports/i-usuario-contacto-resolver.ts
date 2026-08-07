/** Datos de contacto mínimos de un usuario para armar un EmailMessage (N4). */
export interface ContactoUsuario {
  email: string;
  nombre: string;
}

/**
 * IUsuarioContactoResolver — puerto de resolución de contacto cross-DB a
 * `master.usuarios`/`master.membresias` (N4). Los eventos de dominio NUNCA
 * llevan PII (ADR-6) — este puerto es el ÚNICO punto donde el módulo
 * notificaciones resuelve email/nombre a partir de un `usuarioId`.
 *
 * Ref spec: sdd/premium/spec N3, N4. Ref design: ADR-P8. Tarea: N8/N9.
 */
export interface IUsuarioContactoResolver {
  /**
   * Resuelve el contacto (email, nombre) de un usuario por su UUID.
   * Retorna `null` si el usuario no existe (soft-deleted incluido) — el
   * listener que llama a este método debe omitir el envío y loguear (N4).
   */
  resolverContacto(usuarioId: string): Promise<ContactoUsuario | null>;

  /**
   * Resuelve los ADMINISTRADORES activos del tenant (membresías activas con
   * `rol.codigo='ADMINISTRADOR'`, usuario activo y no soft-deleted). Usado
   * por el listener de `sla.vencido` (S4, N3) para notificar al equipo de
   * gestión además del asignado. Retorna `[]` si no hay ninguno.
   */
  resolverAdministradores(clienteId: string): Promise<ContactoUsuario[]>;
}

/** Token de inyección de dependencias para IUsuarioContactoResolver en NestJS. */
export const USUARIO_CONTACTO_RESOLVER = Symbol('USUARIO_CONTACTO_RESOLVER');
