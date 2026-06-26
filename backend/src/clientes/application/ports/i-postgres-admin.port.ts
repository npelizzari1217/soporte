/**
 * IPostgresAdminPort — puerto de abstracción para operaciones administrativas de DB.
 *
 * Permite que la capa de aplicación (CrearClienteUseCase) dependa de una interfaz
 * en vez de la clase concreta PostgresAdminService (que está en shared/infrastructure/).
 * Esto preserva la regla de dependencias: application → ports (never application → infrastructure).
 *
 * La implementación concreta es PostgresAdminService (7.A.2), que estructuralmente
 * satisface esta interfaz (TypeScript structural typing — no requiere `implements` explícito).
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo, Rollback compensatorio]
 * Tarea: 7.A.3 (puerto)
 */
export interface IPostgresAdminPort {
  /**
   * Crea una base de datos Postgres con el nombre indicado.
   * El identificador se quoted para prevenir SQL injection.
   *
   * @throws Error si la DB ya existe o hay un error de conexión.
   */
  createDatabase(dbName: string): Promise<void>;

  /**
   * Dropea una base de datos si existe (DROP DATABASE IF EXISTS).
   * Segura como compensación en rollback: si la DB nunca fue creada, no falla.
   *
   * IMPORTANTE: Postgres no permite DROP si hay conexiones activas.
   * El caller (use case) debe asegurarse de que los colaboradores cerraron
   * sus conexiones (migrationRunner y seeder) antes de invocar este método.
   *
   * @throws Error si hay conexiones activas a la DB.
   */
  dropDatabase(dbName: string): Promise<void>;

  /**
   * Verifica si una base de datos existe en el servidor Postgres.
   * @returns true si existe, false si no.
   */
  databaseExists(dbName: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IPostgresAdminPort en NestJS. */
export const POSTGRES_ADMIN = Symbol('POSTGRES_ADMIN');
