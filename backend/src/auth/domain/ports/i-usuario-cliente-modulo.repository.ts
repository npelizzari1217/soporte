/**
 * IUsuarioClienteModuloRepository — puerto de resolución de los módulos
 * funcionales asignados a un usuario en un cliente específico.
 *
 * Alimenta el eje de autorización "módulos" del JWT (feature 5.2 CAPA 1),
 * ortogonal al RBAC (roles/permisos). Definido en la capa de dominio: sin
 * imports de Prisma ni NestJS. La impl concreta vive en
 * auth/infrastructure/persistence/prisma/.
 */
export interface IUsuarioClienteModuloRepository {
  /** Códigos de módulo asignados al usuario en ese cliente. */
  findModulosByUsuarioYCliente(usuarioId: string, clienteId: string): Promise<string[]>;

  /**
   * REEMPLAZO idempotente del set de módulos de un usuario en un cliente:
   * borra todas las filas de (usuarioId, clienteId) e inserta una por cada
   * `modulo` del set nuevo (deduplicado). Ejecutado en una transacción para
   * que el reemplazo sea atómico (nunca un estado intermedio sin filas).
   * Usado por `AsignarModulosUsuarioTenantUseCase` (`PATCH /usuarios/:id/modulos`).
   */
  setModulos(usuarioId: string, clienteId: string, modulos: string[]): Promise<void>;
}

/** Token de inyección de dependencias para IUsuarioClienteModuloRepository. */
export const USUARIO_CLIENTE_MODULO_REPOSITORY = Symbol('USUARIO_CLIENTE_MODULO_REPOSITORY');
