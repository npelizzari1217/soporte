/**
 * IConfiguracionRepository — puerto de persistencia para el CRUD genérico de
 * `ConfiguracionRuntime` (filas key-value por `categoria`/`clave`, scoped a
 * tenant o global — Opción A, design §1).
 *
 * Reusa `ConfigScope` (mismo shape que `AuditLogPort`/`ConfiguracionCambiada`
 * — R9: el scope tenant lleva `clienteId`, NUNCA `dbName` crudo; el adapter
 * re-resuelve el `dbName` real desde `master.clientes`, mismo patrón que
 * `PrismaConfigResolver`/`PrismaAuditLog`).
 *
 * `upsert()` es create-or-update por `(categoria, clave)` dentro del scope —
 * la unicidad la enforce el partial unique index de la DB (Dz9, raw SQL,
 * `WHERE deleted_at IS NULL`); Prisma no expresa un `@@unique` parcial, así
 * que el adapter NO puede usar `.upsert()` nativo (no hay `where` unique
 * disponible) — resuelve existencia vía `findFirst` (NUNCA `findUnique`,
 * Dz9) y decide `create`/`update`.
 *
 * NUNCA lanza — toda falla de infraestructura se modela como
 * `Result.fail(InfraConfigError)` (mismo criterio que `IConfigResolver`/
 * `AuditLogPort`). El repositorio NO conoce `ISecretCipher`: cifrar/descifrar
 * es responsabilidad exclusiva del write use case — `valor`/`iv`/`authTag`
 * llegan y salen tal cual (ciphertext si `esSecreto`).
 *
 * Ref design: §5, §12, Dz9. Ref spec: §0 (modelo genérico), Requirement 8.
 * Tarea: 4.1 (PR4).
 */
import { Result } from '../../../shared/domain/result';
import { ConfigScope } from '../events/configuracion-cambiada.event';
import { ConfigConflictoConcurrenteError, InfraConfigError } from '../errors/config.errors';

/** Token de inyección de dependencias para IConfiguracionRepository en NestJS. */
export const CONFIGURACION_REPOSITORY = Symbol('CONFIGURACION_REPOSITORY');

/**
 * Fila de `ConfiguracionRuntime` tal como la expone el dominio — `valor` es
 * ciphertext (base64) si `esSecreto=true`, cleartext si no. NUNCA se
 * descifra dentro del repositorio ni de este tipo.
 */
export interface ConfiguracionRow {
  readonly id: string;
  readonly categoria: string;
  readonly clave: string;
  readonly valor: string;
  readonly tipo: string;
  readonly esSecreto: boolean;
  readonly iv: string | null;
  readonly authTag: string | null;
  readonly actualizadoPor: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input de `upsert()` — sin `id`/`createdAt`/`updatedAt` (los decide el
 * adapter según exista o no la fila previa). `valor`/`iv`/`authTag` ya
 * vienen cifrados si `esSecreto` — responsabilidad exclusiva del write use
 * case (`ActualizarConfigUseCase`), NUNCA del repositorio.
 */
export interface UpsertConfiguracionInput {
  readonly categoria: string;
  readonly clave: string;
  readonly valor: string;
  readonly tipo: string;
  readonly esSecreto: boolean;
  readonly iv: string | null;
  readonly authTag: string | null;
  readonly actualizadoPor: string;
}

export interface IConfiguracionRepository {
  /**
   * Lista filas ACTIVAS (`deletedAt: null`) del scope indicado, opcionalmente
   * filtradas por `categoria`. NUNCA lanza.
   */
  findAll(
    scope: ConfigScope,
    categoria?: string,
  ): Promise<Result<ConfiguracionRow[], InfraConfigError>>;

  /**
   * Busca una fila ACTIVA por `(categoria, clave)` dentro del scope.
   * `Result.ok(null)` si no existe ninguna fila activa que coincida. NUNCA
   * lanza. Usa `findFirst` internamente (Dz9) — nunca `findUnique`.
   */
  findByClave(
    scope: ConfigScope,
    categoria: string,
    clave: string,
  ): Promise<Result<ConfiguracionRow | null, InfraConfigError>>;

  /**
   * Crea la fila `(categoria, clave)` del scope si no existe una activa, o
   * la actualiza si ya existe. NUNCA lanza.
   *
   * TOCTOU (Judgment Day PR4 Ronda 1, arreglo 4): la resolución de
   * existencia (`findFirst`) y la escritura (`create`/`update`) NO son
   * atómicas — una violación del partial unique index por una escritura
   * concurrente se reporta como `ConfigConflictoConcurrenteError`,
   * distinguible de un `InfraConfigError` genérico (timeout, conexión
   * caída).
   */
  upsert(
    scope: ConfigScope,
    row: UpsertConfiguracionInput,
  ): Promise<Result<ConfiguracionRow, InfraConfigError | ConfigConflictoConcurrenteError>>;
}
