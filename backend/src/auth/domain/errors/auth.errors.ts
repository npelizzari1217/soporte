import { DomainError } from '../../../shared/domain/result';

/**
 * CredencialesInvalidasError — credenciales incorrectas o cuenta inactiva.
 * Mensaje deliberadamente genérico para no revelar si la cuenta existe.
 * → HTTP 401 en la capa de presentación.
 */
export class CredencialesInvalidasError extends DomainError {
  readonly code = 'AUTH_INVALID_CREDENTIALS';

  constructor() {
    super('Credenciales inválidas o cuenta inactiva.');
  }
}

/**
 * ClienteInactivoError — el cliente asociado al usuario está inactivo.
 * → HTTP 403 en la capa de presentación.
 */
export class ClienteInactivoError extends DomainError {
  readonly code = 'AUTH_CLIENTE_INACTIVO';

  constructor() {
    super('El cliente asociado a esta cuenta no está disponible.');
  }
}

/**
 * TokenExpiradoError — el refresh token superó su fecha de expiración.
 * → HTTP 401 en la capa de presentación.
 */
export class TokenExpiradoError extends DomainError {
  readonly code = 'AUTH_TOKEN_EXPIRADO';

  constructor() {
    super('El token ha expirado.');
  }
}

/**
 * TokenRevocadoError — el refresh token fue revocado explícitamente.
 * → HTTP 401 en la capa de presentación.
 */
export class TokenRevocadoError extends DomainError {
  readonly code = 'AUTH_TOKEN_REVOCADO';

  constructor() {
    super('El token ha sido revocado.');
  }
}

/**
 * TokenInvalidoError — el token no existe en el sistema.
 * → HTTP 401 en la capa de presentación.
 */
export class TokenInvalidoError extends DomainError {
  readonly code = 'AUTH_TOKEN_INVALIDO';

  constructor() {
    super('El token es inválido.');
  }
}

/**
 * UsuarioNoEncontradoError — usuario no encontrado por id.
 * → HTTP 404 en la capa de presentación.
 */
export class UsuarioNoEncontradoError extends DomainError {
  readonly code = 'AUTH_USUARIO_NOT_FOUND';

  constructor(id: string) {
    super(`Usuario con id "${id}" no encontrado.`);
  }
}

/**
 * RolNoEncontradoError — rol no encontrado por código.
 * → HTTP 404 en la capa de presentación.
 */
export class RolNoEncontradoError extends DomainError {
  readonly code = 'AUTH_ROL_NOT_FOUND';

  constructor(codigo: string) {
    super(`Rol "${codigo}" no encontrado.`);
  }
}

/**
 * RolYaAsignadoError — el rol ya está asignado al usuario.
 * → HTTP 409 en la capa de presentación.
 */
export class RolYaAsignadoError extends DomainError {
  readonly code = 'AUTH_ROL_YA_ASIGNADO';

  constructor(rolCodigo: string) {
    super(`El rol "${rolCodigo}" ya está asignado a este usuario.`);
  }
}

/**
 * PermisoCodigoInvalidoError — código de permiso no cumple el formato "recurso:accion".
 * → HTTP 422 en la capa de presentación.
 */
export class PermisoCodigoInvalidoError extends DomainError {
  readonly code = 'AUTH_PERMISO_CODIGO_INVALIDO';

  constructor(codigo: string) {
    super(`Código de permiso inválido: "${codigo}". Formato requerido: "recurso:accion".`);
  }
}

/**
 * AutoBajaProhibidaError — un usuario no puede darse de baja a sí mismo.
 * → HTTP 422 en la capa de presentación.
 *
 * Spec ref: clientes-tenancy/PATCH /usuarios/:id/baja — Escenario self-baja.
 * Tarea: T3.6
 */
export class AutoBajaProhibidaError extends DomainError {
  readonly code = 'AUTH_AUTO_BAJA_PROHIBIDA';

  constructor() {
    super('Un usuario no puede darse de baja a sí mismo.');
  }
}

/**
 * UsuarioConflictError — ya existe un usuario con el email dado.
 * → HTTP 409 en la capa de presentación.
 *
 * Spec ref: clientes-tenancy/POST /usuarios — Escenario email duplicado.
 * Tarea: T3.2
 */
export class UsuarioConflictError extends DomainError {
  readonly code = 'AUTH_USUARIO_CONFLICT';

  constructor(email: string) {
    super(`Ya existe un usuario con email "${email}".`);
  }
}
