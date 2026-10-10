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
    super(`No existe el rol ${codigo} para la membresia del usuario de integracion.`);
  }
}

/** El email tecnico del cliente lo usa un usuario que no es de integracion. */
export class EmailIntegracionOcupadoError extends DomainError {
  readonly code = 'API_EMAIL_INTEGRACION_OCUPADO';

  constructor() {
    super('El email tecnico de integracion ya lo usa otro usuario.');
  }
}
