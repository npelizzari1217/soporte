import { DomainError } from '../../shared/domain/result';

/** Solo ROOT habilita o deshabilita la API publica de un cliente. */
export class OnlyRootCanConfigurarApiError extends DomainError {
  readonly code = 'API_SOLO_ROOT';

  constructor() {
    super('Solo ROOT puede habilitar o deshabilitar la API de un cliente.');
  }
}

export class ClienteApiNoEncontradoError extends DomainError {
  readonly code = 'API_CLIENTE_NO_ENCONTRADO';

  constructor(clienteId: string) {
    super(`Cliente no encontrado: ${clienteId}`);
  }
}

/** El rol de la membresia del usuario de integracion no existe en el catalogo. */
export class RolIntegracionNoEncontradoError extends DomainError {
  readonly code = 'API_ROL_INTEGRACION_NO_ENCONTRADO';

  constructor(codigo: string) {
    super(`No existe el rol ${codigo} para la membresía del usuario de integración.`);
  }
}

/** El email tecnico del cliente lo usa un usuario que no es de integracion. */
export class EmailIntegracionOcupadoError extends DomainError {
  readonly code = 'API_EMAIL_INTEGRACION_OCUPADO';

  constructor() {
    super('El email técnico de integración ya lo usa otro usuario.');
  }
}

/** El cliente no tiene la API habilitada: no se pueden emitir claves. */
export class ApiNoHabilitadaError extends DomainError {
  readonly code = 'API_NO_HABILITADA';

  constructor() {
    super('La API del cliente no está habilitada.');
  }
}

/** El cliente tiene la API habilitada pero falta su usuario de integracion. */
export class UsuarioIntegracionNoEncontradoError extends DomainError {
  readonly code = 'API_USUARIO_INTEGRACION_NO_ENCONTRADO';

  constructor() {
    super('No existe el usuario de integración del cliente.');
  }
}

/** Los permisos de la clave estan vacios o incluyen alguno fuera de `PERMISOS_API`. */
export class PermisosApiInvalidosError extends DomainError {
  readonly code = 'API_PERMISOS_INVALIDOS';

  constructor() {
    super('La clave necesita al menos un permiso, y todos deben ser de la API pública.');
  }
}

/** El nombre de la clave esta vacio o es demasiado largo. */
export class NombreClaveInvalidoError extends DomainError {
  readonly code = 'API_NOMBRE_CLAVE_INVALIDO';

  constructor(maximo: number) {
    super(`El nombre de la clave es obligatorio y admite hasta ${maximo} caracteres.`);
  }
}

/** La clave no existe en el cliente del actor (o es de otro cliente: no se distingue). */
export class ApiClaveNoEncontradaError extends DomainError {
  readonly code = 'API_CLAVE_NO_ENCONTRADA';

  constructor() {
    super('Clave de API no encontrada.');
  }
}

/**
 * El tipo del alta `v1` no es un tipo activo del modulo TICKETS (T5e). El mismo mensaje para un id
 * inexistente, dado de baja o de otro modulo: no revela cual de los tres es.
 */
export class TipoTicketV1NoDisponibleError extends DomainError {
  readonly code = 'API_TIPO_TICKET_NO_DISPONIBLE';

  constructor() {
    super('El tipo de ticket no existe o no está disponible en la API.');
  }
}

/** El secreto del webhook no descifra: clave equivocada, payload roto o movido de cliente. */
export class SecretoWebhookIndescifrableError extends DomainError {
  readonly code = 'WEBHOOK_SECRETO_INDESCIFRABLE';

  constructor() {
    super('No se pudo descifrar el secreto del webhook.');
  }
}

/**
 * La URL del destino de webhooks no pasa la validación sintáctica (odd/webhooks, CA8): no es HTTPS,
 * lleva credenciales, es demasiado larga o apunta a una IP literal que no es pública.
 */
export class UrlWebhookInvalidaError extends DomainError {
  readonly code = 'WEBHOOK_URL_INVALIDA';

  constructor(motivo: string) {
    super(`La URL del webhook no es válida: ${motivo}`);
  }
}

/** El host del destino resuelve, en al menos una de sus respuestas, a una IP que no es pública. */
export class DestinoWebhookNoPublicoError extends DomainError {
  readonly code = 'WEBHOOK_DESTINO_NO_PUBLICO';

  constructor() {
    super('El destino del webhook resuelve a una dirección que no es pública.');
  }
}

/** El host del destino no resuelve a ninguna dirección. */
export class DestinoWebhookIrresolubleError extends DomainError {
  readonly code = 'WEBHOOK_DESTINO_IRRESOLUBLE';

  constructor() {
    super('No se pudo resolver el host del destino del webhook.');
  }
}
