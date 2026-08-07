import { DomainError } from '../../../shared/domain/result';

/**
 * CredencialesInvalidasError — credenciales incorrectas o cuenta inactiva.
 * Mensaje deliberadamente genérico para no revelar si la cuenta existe
 * (R3: mismo error tanto para usuario inexistente como para password incorrecto).
 * → HTTP 401 en la capa de presentación.
 */
export class CredencialesInvalidasError extends DomainError {
  readonly code = 'AUTH_INVALID_CREDENTIALS';

  constructor() {
    super('Credenciales inválidas o cuenta inactiva.');
  }
}

/**
 * SinMembresiaActivaError — el usuario no tiene ninguna membresía activa
 * en ningún cliente (R4: usuario normal con 0 membresías).
 * → HTTP 403 en la capa de presentación.
 */
export class SinMembresiaActivaError extends DomainError {
  readonly code = 'AUTH_SIN_MEMBRESIA_ACTIVA';

  constructor() {
    super('El usuario no tiene ninguna membresía activa.');
  }
}

/**
 * ClienteNoAutorizadoError — el clienteId solicitado no pertenece al conjunto
 * seleccionable del actor (R5: normal sin membresía en ese cliente; R10: switch
 * a un cliente sin membresía).
 * → HTTP 403 en la capa de presentación.
 */
export class ClienteNoAutorizadoError extends DomainError {
  readonly code = 'AUTH_CLIENTE_NO_AUTORIZADO';

  constructor() {
    super('No tenés autorización para operar sobre este cliente.');
  }
}

/**
 * ClienteInactivoError — el cliente asociado al usuario está inactivo o
 * borrado (R12: TenantGuard).
 * → HTTP 403 en la capa de presentación.
 */
export class ClienteInactivoError extends DomainError {
  readonly code = 'AUTH_CLIENTE_INACTIVO';

  constructor() {
    super('El cliente asociado a esta cuenta no está disponible.');
  }
}

/**
 * TokenInvalidoError — el refresh token no existe en el sistema (hash sin
 * match en `refresh_tokens`).
 * → HTTP 401 en la capa de presentación.
 */
export class TokenInvalidoError extends DomainError {
  readonly code = 'AUTH_TOKEN_INVALIDO';

  constructor() {
    super('El token es inválido.');
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
 * PermisoCodigoInvalidoError — código de permiso no cumple el formato
 * "recurso:accion".
 * → HTTP 422 en la capa de presentación.
 */
export class PermisoCodigoInvalidoError extends DomainError {
  readonly code = 'AUTH_PERMISO_CODIGO_INVALIDO';

  constructor(codigo: string) {
    super(`Código de permiso inválido: "${codigo}". Formato requerido: "recurso:accion".`);
  }
}

/**
 * RolNoEncontradoError — el `rolCodigo` recibido (alta de usuario del tenant
 * o cambio de rol de una membresía) no existe en el catálogo RBAC
 * (`master.roles`). Validación de INPUT del actor (ADMINISTRADOR), no un
 * problema de configuración del sistema — a diferencia de
 * `AdministradorRoleNotFoundError` (clientes.errors, rol fijo del sistema).
 * → HTTP 422 en la capa de presentación.
 */
export class RolNoEncontradoError extends DomainError {
  readonly code = 'AUTH_ROL_NO_ENCONTRADO';

  constructor(rolCodigo: string) {
    super(`El rol "${rolCodigo}" no existe en el catálogo.`);
  }
}

/**
 * MembresiaYaActivaError — el usuario ya tiene una membresía ACTIVA en el
 * cliente del token al intentar crear una nueva (`POST /usuarios`). Evita
 * membresías duplicadas para el mismo (usuario, cliente) desde este flujo de
 * alta simplificado (el modelo de dominio SÍ permite múltiples roles por
 * cliente, pero la gestión mínima de usuarios no expone esa granularidad).
 * → HTTP 409 en la capa de presentación.
 */
export class MembresiaYaActivaError extends DomainError {
  readonly code = 'AUTH_MEMBRESIA_YA_ACTIVA';

  constructor() {
    super('El usuario ya tiene una membresía activa en este cliente.');
  }
}

/**
 * MembresiaNoEncontradaError — no existe una membresía del usuario `:id` en
 * el cliente del token (`PATCH /usuarios/:id/rol`, `DELETE
 * /usuarios/:id/membresia`). Mismo código HTTP tanto si el usuario no existe
 * como si existe pero pertenece a OTRO cliente — es el mecanismo de
 * aislamiento estricto: un ADMINISTRADOR nunca sabe si un id ajeno existe en
 * otro tenant.
 * → HTTP 404 en la capa de presentación.
 */
export class MembresiaNoEncontradaError extends DomainError {
  readonly code = 'AUTH_MEMBRESIA_NO_ENCONTRADA';

  constructor() {
    super('No se encontró una membresía de este usuario en este cliente.');
  }
}
