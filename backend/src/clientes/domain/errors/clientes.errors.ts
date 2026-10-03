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
 * ClienteNoEncontradoError — el `clienteId` recibido por los use cases de ABM
 * de clientes (editar/desactivar/reactivar, correo, csat) no existe en
 * `master.clientes`.
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class ClienteNoEncontradoError extends DomainError {
  readonly code = 'CLIENTE_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Cliente con id "${id}" no encontrado.`);
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

/**
 * CorreoPasswordFaltanteError — `ConfigurarCorreoClienteUseCase` recibió la
 * config SMTP sin `password` para un cliente que TODAVÍA no tiene una config
 * de correo guardada (nada que preservar). Distinto del caso "omitida +
 * cliente ya configurado", que preserva el ciphertext existente en vez de
 * fallar (D7, sdd/configuracion-correo-por-cliente).
 * → HTTP 400 Bad Request en la capa de presentación.
 */
export class CorreoPasswordFaltanteError extends DomainError {
  readonly code = 'CORREO_PASSWORD_FALTANTE';

  constructor() {
    super('Falta la contraseña: el cliente todavía no tiene una configuración de correo guardada.');
  }
}

/**
 * EmailCryptoKeyAusenteError — `EMAIL_CRYPTO_KEY` falta o es inválida en el
 * momento de GUARDAR la config de correo (D2). El adaptador de persistencia
 * cifra ANTES de escribir en la base (ver `PrismaClienteEmailConfigRepository.save`),
 * así que si esto ocurre no se persistió nada — nunca se guarda un secreto
 * sin cifrar.
 * → HTTP 503 Service Unavailable en la capa de presentación.
 */
export class EmailCryptoKeyAusenteError extends DomainError {
  readonly code = 'EMAIL_CRYPTO_KEY_AUSENTE';

  constructor() {
    super(
      'No se puede guardar la configuración de correo: falta o es inválida la clave de ' +
        'cifrado del servidor (EMAIL_CRYPTO_KEY). No se guardó ningún dato.',
    );
  }
}

/**
 * CorreoNoConfiguradoError — se pidió "Probar conexión" (`ProbarCorreoClienteUseCase`)
 * para un cliente que no tiene una configuración de correo guardada.
 * → HTTP 400 Bad Request en la capa de presentación.
 */
export class CorreoNoConfiguradoError extends DomainError {
  readonly code = 'CORREO_NO_CONFIGURADO';

  constructor() {
    super('El cliente no tiene una configuración de correo guardada para probar.');
  }
}

/**
 * LogoClienteNoEncontradoError — `VerLogoClienteUseCase` (sdd/logo-por-cliente,
 * WU2) no tiene un logo que devolver para este cliente: o bien el cliente
 * existe pero nunca cargó uno (`logoStorageKey === null`), o bien la fila
 * apunta a una key que `IFileStorage.retrieve()` ya no encuentra (huérfano de
 * lectura). Deliberadamente DISTINTO de `ClienteNoEncontradoError` (ese es
 * "el cliente no existe"; este es "el cliente existe, pero no hay logo") —
 * ambos mapean al mismo 404 en la capa de presentación (spec, regla 7:
 * degradación al fallback ante cualquier motivo, 404 incluido), pero
 * conviene no perder la distinción en el dominio.
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class LogoClienteNoEncontradoError extends DomainError {
  readonly code = 'LOGO_CLIENTE_NO_ENCONTRADO';

  constructor(clienteId: string) {
    super(`El cliente con id "${clienteId}" no tiene un logo disponible.`);
  }
}

/**
 * SlugInvalidoError — el slug del formulario publico no cumple el formato
 * (`SLUG_REGEX`), tiene forma de UUID, o coincide con el `id` o el `dbName`
 * del cliente: el slug nunca puede ser un identificador interno.
 * → HTTP 400/422 en la capa de presentacion.
 */
export class SlugInvalidoError extends DomainError {
  readonly code = 'SLUG_INVALIDO';

  constructor(motivo: string) {
    super(`Slug inválido: ${motivo}`);
  }
}

/**
 * SlugCongeladoError — el cliente ya emitio un QR y su slug quedo congelado:
 * cambiarlo romperia los QR impresos.
 * → HTTP 409 Conflict en la capa de presentacion.
 */
export class SlugCongeladoError extends DomainError {
  readonly code = 'SLUG_CONGELADO';

  constructor() {
    super('El slug del cliente está congelado porque ya se emitió un QR.');
  }
}

/**
 * SlugRequeridoError — se intento habilitar el formulario publico de un
 * cliente sin slug: no existiria una URL publica.
 * → HTTP 409/422 en la capa de presentacion.
 */
export class SlugRequeridoError extends DomainError {
  readonly code = 'SLUG_REQUERIDO';

  constructor() {
    super('No se puede habilitar el formulario público de un cliente sin slug.');
  }
}

/**
 * SlugDuplicadoError — otro cliente ya usa ese slug (UNIQUE).
 * → HTTP 409 Conflict en la capa de presentacion.
 */
export class SlugDuplicadoError extends DomainError {
  readonly code = 'SLUG_DUPLICADO';

  constructor() {
    super('Ya existe otro cliente con ese slug.');
  }
}
