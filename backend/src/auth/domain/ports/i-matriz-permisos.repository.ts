/**
 * IMatrizPermisosRepository — puerto de resolución y escritura de la matriz
 * de permisos por usuario (tabla `usuario_cliente_permisos`).
 *
 * Reemplaza al eje doble RBAC (`roles_permisos`) + módulos
 * (`usuario_cliente_modulos`) por una única fuente celda por celda. Consumido
 * por `resolverScope` (lectura, WU-7.1) y por el ABM de permisos (escritura,
 * WU-7.4). Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La impl concreta vive en `auth/infrastructure/persistence/prisma/`.
 *
 * El puerto tipa con `string[]`, NO `CodigoAccion[]`: el dominio de auth no
 * debe importar el catálogo de módulos (`shared/domain/acciones.ts`) solo
 * para tipar un puerto de persistencia — el tipado estricto se aplica en el
 * decorador del guard y en el DTO del ABM, que es donde escribe el
 * desarrollador (ADR-P10).
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R2. Ref design: ADR-P3, ADR-P10.
 */
export interface IMatrizPermisosRepository {
  /** Códigos `MODULO:ACCION` de las celdas del usuario en ese cliente. */
  findByUsuarioYCliente(usuarioId: string, clienteId: string): Promise<string[]>;

  /**
   * REEMPLAZO idempotente y atómico del set de celdas de un usuario en un
   * cliente: borra todas las filas de (usuarioId, clienteId) e inserta una
   * por cada código del set nuevo (deduplicado), en una transacción — nunca
   * un estado intermedio sin filas. Mismo patrón que
   * `PrismaUsuarioClienteModuloRepository.setModulos`
   * (`prisma-usuario-cliente-modulo.repository.ts:35-37`).
   */
  setPermisos(usuarioId: string, clienteId: string, celdas: readonly string[]): Promise<void>;
}

/** Token de inyección de dependencias para IMatrizPermisosRepository. */
export const MATRIZ_PERMISOS_REPOSITORY = Symbol('MATRIZ_PERMISOS_REPOSITORY');
