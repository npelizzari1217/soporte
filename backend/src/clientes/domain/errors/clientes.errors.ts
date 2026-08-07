import { DomainError } from '../../../shared/domain/result';

/**
 * CicloVigenteInvalidDatesError — se lanza cuando `fechaFin <= fechaInicio`
 * al construir/reprogramar un `CicloVigenteEntity` (invariante estructural,
 * R20). La entidad valida esto en `create()`; `CrearCicloVigenteUseCase` lo
 * captura y lo re-emite como `Result.fail` en el límite de aplicación.
 * → HTTP 422 Unprocessable Entity en la capa de presentación.
 */
export class CicloVigenteInvalidDatesError extends DomainError {
  readonly code = 'CICLO_VIGENTE_INVALID_DATES';

  constructor() {
    super('fecha_fin debe ser estrictamente mayor que fecha_inicio.');
  }
}

/**
 * CicloVigenteNotFoundError — el `cicloVigenteId` solicitado no existe en el
 * catálogo master, o no es elegible (`activo=false` o soft-deleted) (R21).
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class CicloVigenteNotFoundError extends DomainError {
  readonly code = 'CICLO_VIGENTE_NOT_FOUND';

  constructor(id: string) {
    super(`Ciclo vigente con id "${id}" no encontrado o no elegible.`);
  }
}

/**
 * CicloOverlapError — las fechas (snapshot del master elegido) se solapan
 * con un ciclo ACTIVO existente del tenant (R21). Ciclos inactivos o
 * soft-deleted del tenant NO bloquean.
 * → HTTP 409 Conflict en la capa de presentación.
 */
export class CicloOverlapError extends DomainError {
  readonly code = 'CICLO_OVERLAP';

  constructor() {
    super('Las fechas del ciclo elegido se solapan con el ciclo activo del tenant.');
  }
}

/**
 * CicloClienteNotFoundError — el ciclo a activar no existe en el tenant
 * resuelto (R22).
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class CicloClienteNotFoundError extends DomainError {
  readonly code = 'CICLO_CLIENTE_NOT_FOUND';

  constructor(id: string) {
    super(`Ciclo con id "${id}" no encontrado en este tenant.`);
  }
}

/**
 * InvalidDatabaseNameError — el nombre de base de datos recibido por
 * `IPostgresAdminPort` no es un identificador Postgres seguro (defensa
 * anti SQL-injection, R17: "el identificador de DB MUST ir quoted").
 * Se valida ANTES de interpolar el nombre en cualquier sentencia
 * `CREATE DATABASE` / `DROP DATABASE` — Postgres no soporta parámetros
 * bindeados ($1) para identificadores de DDL, por eso la validación de
 * whitelist (alfanumérico + guion bajo, sin comillas/espacios) es la
 * defensa real, y el quoting es defensa en profundidad adicional.
 */
export class InvalidDatabaseNameError extends DomainError {
  readonly code = 'INVALID_DATABASE_NAME';

  constructor(dbName: string) {
    super(
      `Nombre de base de datos inválido: "${dbName}". ` +
        `Solo se permiten letras, números y guion bajo, sin empezar con número.`,
    );
  }
}

/**
 * OnlyRootCanCreateClienteError — el actor que invoca `CrearClienteUseCase`
 * no es `is_global_admin` (R16: "MUST estar guardado por GlobalAdminGuard Y
 * revalidar actor.isRoot en el use case", defensa en profundidad — el guard
 * ya lo bloquea en el controller, esto cubre invocación directa del use case).
 * → HTTP 403 en la capa de presentación.
 */
export class OnlyRootCanCreateClienteError extends DomainError {
  readonly code = 'CLIENTES_ONLY_ROOT_CAN_CREATE';

  constructor() {
    super('Solo un usuario ROOT (is_global_admin) puede crear un cliente.');
  }
}

/**
 * AdministradorRoleNotFoundError — el rol `ADMINISTRADOR` no existe en el
 * catálogo RBAC (`master.roles`) al momento de provisionar un cliente nuevo.
 * No debería ocurrir en un sistema correctamente sembrado (R1, seed
 * `seed_rbac_4_roles_permisos`) — se valida ANTES de tocar Postgres físico
 * (fail-fast, evita crear/migrar/sembrar una DB tenant completa si el
 * catálogo RBAC del propio master está roto).
 * → HTTP 500 en la capa de presentación (falla de configuración, no del caller).
 */
export class AdministradorRoleNotFoundError extends DomainError {
  readonly code = 'CLIENTES_ADMINISTRADOR_ROLE_NOT_FOUND';

  constructor() {
    super(
      'El rol ADMINISTRADOR no existe en el catálogo RBAC (master.roles). ' +
        'Verificar que el seed "seed_rbac_4_roles_permisos" se haya aplicado.',
    );
  }
}

/**
 * AdminEmailYaRegistradoError — el `adminEmail` del alta de cliente (R16) ya
 * pertenece a un usuario existente en `master.usuarios` (email UNIQUE).
 * Validado ANTES de provisionar la DB física (fail-fast, evita crear/migrar/
 * sembrar un tenant completo para luego fallar en la creación del admin).
 * → HTTP 409 Conflict en la capa de presentación.
 */
export class AdminEmailYaRegistradoError extends DomainError {
  readonly code = 'CLIENTES_ADMIN_EMAIL_YA_REGISTRADO';

  constructor(email: string) {
    super(`El email "${email}" ya está registrado en el sistema.`);
  }
}
