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
    super('No tiene autorización para operar sobre este cliente.');
  }
}

/**
 * ClienteInactivoError — el cliente asociado al usuario está inactivo o
 * borrado.
 *
 * SIN USO EN PRODUCCIÓN (verificado el 2026-08-22): nadie lo instancia.
 * `TenantGuard` tira un `ForbiddenException` crudo en su lugar, así que el
 * 403 que ve el cliente NO pasa por acá. Se conserva porque el spec guardián
 * de `auth.controller.spec.ts` afirma el catálogo completo de errores; si
 * algún día el guard lo usa de verdad, hay que mapearlo a 403 explícito —
 * hoy caería en el fallback 401 (ruidoso, con `logger.error`).
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
 *
 * SIN USO EN PRODUCCIÓN (verificado el 2026-08-22): su única fuente es
 * `PermisoEntity.create`, que hoy solo se invoca desde fixtures de test.
 * Si un caso de uso empieza a construir permisos, mapearlo a 422 explícito.
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

/**
 * CeldaPermisoInvalidaError — uno o más códigos `MODULO:ACCION` recibidos al
 * reemplazar la matriz de un usuario (`PATCH /usuarios/:id/permisos`, WU-7.4)
 * no pertenecen al catálogo `PARES_VALIDOS` (`shared/domain/acciones`).
 * Defensa en profundidad detrás del `@IsIn` del DTO. `ModuloInvalidoError`
 * (equivalente para el ABM viejo de módulos) se retiró en WU-7.6 junto con
 * ese ABM.
 * → HTTP 422 en la capa de presentación.
 */
export class CeldaPermisoInvalidaError extends DomainError {
  readonly code = 'AUTH_CELDA_PERMISO_INVALIDA';

  constructor(celdas: string[]) {
    super(`Celda(s) de permiso inválida(s): ${celdas.join(', ')}.`);
  }
}

/**
 * PresetRolNoDefinidoError — el `rolCodigo` recibido en
 * `AplicarPresetPermisosUseCase` (`POST /usuarios/:id/permisos/aplicar-preset`,
 * WU-7.4) SÍ existe como `Role` en el catálogo RBAC pero NO tiene entrada en
 * `PRESETS_ROL` (`auth/domain/presets-rol.ts`). A diferencia de
 * `RolNoEncontradoError` (rol inexistente en `master.roles`, error de INPUT),
 * esto es un GAP DE CONFIGURACIÓN del código: alguien sembró un rol nuevo por
 * migración sin agregar su preset. Nunca debe resolverse en silencio con un
 * preset vacío — eso borraría en silencio la matriz de cualquiera al que se
 * le aplique.
 * → HTTP 422 en la capa de presentación.
 */
export class PresetRolNoDefinidoError extends DomainError {
  readonly code = 'AUTH_PRESET_ROL_NO_DEFINIDO';

  constructor(rolCodigo: string) {
    super(
      `No hay preset de permisos definido para el rol "${rolCodigo}". ` +
        `Agréguelo a PRESETS_ROL antes de aplicarlo.`,
    );
  }
}

/**
 * PermisosPorTipoNoAplicadosError — no se pudieron escribir los permisos por tipo de ticket de la
 * plantilla del rol en la base del tenant (odd/tasks/permisos-por-tipo-ticket.md, T4c, W1). Son
 * dos bases sin transacción común y el tenant se escribe primero (las filas por tipo deciden el
 * acceso a tickets), así que la matriz de master tampoco se modificó: no cambió nada, y se repara
 * volviendo a aplicar la plantilla (`POST /usuarios/:id/permisos/aplicar-preset`).
 * → HTTP 500 en la capa de presentación, con este mensaje: el fallo es de infraestructura, pero
 * el administrador tiene que saber qué quedó guardado y cómo completarlo.
 */
export class PermisosPorTipoNoAplicadosError extends DomainError {
  readonly code = 'AUTH_PERMISOS_POR_TIPO_NO_APLICADOS';

  /** @param causa Error original de la escritura en el tenant, para el log. */
  constructor(readonly causa: unknown) {
    super(
      'No se pudieron guardar los permisos por tipo de ticket y la matriz de permisos no se ' +
        'modificó. Vuelva a aplicar la plantilla del rol.',
    );
  }
}

/**
 * MatrizPermisosNoAplicadaError — los permisos por tipo de ticket de la plantilla del rol ya se
 * guardaron en el tenant, pero falló la escritura de la matriz de master
 * (odd/tasks/permisos-por-tipo-ticket.md, W1). El estado que queda es "filas por tipo al día,
 * matriz vieja": el acceso a tickets ya es el del rol nuevo y los módulos que no son tickets
 * siguen con el anterior. Se repara volviendo a aplicar la plantilla, que reescribe las dos.
 * → HTTP 500 en la capa de presentación, con este mensaje.
 */
export class MatrizPermisosNoAplicadaError extends DomainError {
  readonly code = 'AUTH_MATRIZ_PERMISOS_NO_APLICADA';

  /** @param causa Error original de la escritura en master, para el log. */
  constructor(readonly causa: unknown) {
    super(
      'Se guardaron los permisos por tipo de ticket, pero no la matriz de permisos. ' +
        'Vuelva a aplicar la plantilla del rol para completarla.',
    );
  }
}

/**
 * PermisosPorTipoInvalidosError — el reemplazo de los permisos por tipo de ticket de un usuario
 * (`PUT /usuarios/:id/permisos-por-tipo`, odd/tasks/permisos-por-tipo-ticket.md, T7) trae algo que
 * no se puede guardar: una acción fuera del vocabulario, una acción que todavía no se concede, un
 * tipo que no existe en el tenant, un tipo repetido, o acciones sin Ver (S3). El mensaje nombra el
 * tipo y las acciones.
 * → HTTP 422 en la capa de presentación.
 */
export class PermisosPorTipoInvalidosError extends DomainError {
  readonly code = 'AUTH_PERMISOS_POR_TIPO_INVALIDOS';

  /** @param mensaje Qué fila o valor no se puede guardar y por qué. */
  constructor(mensaje: string) {
    super(mensaje);
  }
}

/**
 * PermisosPorTipoSinRestriccionError — el usuario es ROOT o ADMINISTRADOR: opera todos los tipos
 * sin filas, así que sus permisos por tipo no se editan ni sirven de origen para copiar
 * (odd/tasks/permisos-por-tipo-ticket.md, T7).
 * → HTTP 422 en la capa de presentación.
 */
export class PermisosPorTipoSinRestriccionError extends DomainError {
  readonly code = 'AUTH_PERMISOS_POR_TIPO_SIN_RESTRICCION';

  /** @param papel Si el administrador es el usuario editado o el usuario del que se copia. */
  constructor(papel: 'destino' | 'origen') {
    super(
      papel === 'destino'
        ? 'El usuario es administrador: opera todos los tipos de ticket y sus permisos por tipo no se editan.'
        : 'El usuario de origen es administrador: no tiene permisos por tipo para copiar.',
    );
  }
}

/**
 * UsuarioNoDisponibleError — el usuario del token (`actor.sub`) no existe, está
 * inactivo o fue soft-deleted (`CambiarPasswordUseCase`, sdd/cambio-de-contrasena
 * D3). `JwtAuthGuard` nunca consulta la DB: una cuenta suspendida sigue llegando
 * al handler hasta que expira su access token, así que este es un caso real, no
 * teórico. NO se reusa `CredencialesInvalidasError`: acá el usuario YA está
 * autenticado, así que el anti-enumeración de login no aplica, y un 401 en esta
 * ruta dispararía el refresh single-flight del cliente por error.
 * → HTTP 403 en la capa de presentación (reconciliación #2409, punto 2).
 */
export class UsuarioNoDisponibleError extends DomainError {
  readonly code = 'AUTH_USUARIO_NO_DISPONIBLE';

  constructor() {
    super('El usuario no está disponible.');
  }
}

/**
 * PasswordActualIncorrectaError — la `passwordActual` recibida no coincide con
 * el hash almacenado (`CambiarPasswordUseCase`). `password_hash` queda sin
 * cambios.
 * → HTTP 422 en la capa de presentación (reconciliación #2409, punto 1).
 */
export class PasswordActualIncorrectaError extends DomainError {
  readonly code = 'AUTH_PASSWORD_ACTUAL_INCORRECTA';

  constructor() {
    super('La contraseña actual no es correcta.');
  }
}

/**
 * PasswordNuevaIgualAActualError — `passwordNueva` coincide con
 * `passwordActual` en texto plano (`CambiarPasswordUseCase`). Se detecta
 * ANTES de hashear, comparando plaintext: en ese punto `passwordActual` ya
 * está probada como vigente, así que la comparación es equivalente a un
 * segundo `verifyPassword` pero sin pagar otro KDF de ~100ms.
 * → HTTP 422 en la capa de presentación (reconciliación #2409, punto 1).
 */
export class PasswordNuevaIgualAActualError extends DomainError {
  readonly code = 'AUTH_PASSWORD_NUEVA_IGUAL';

  constructor() {
    super('La contraseña nueva tiene que ser distinta de la actual.');
  }
}
