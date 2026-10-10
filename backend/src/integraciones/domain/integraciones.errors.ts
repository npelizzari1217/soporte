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

/** El cliente no tiene la API habilitada: no se pueden emitir claves. */
export class ApiNoHabilitadaError extends DomainError {
  readonly code = 'API_NO_HABILITADA';

  constructor() {
    super('La API del cliente no esta habilitada.');
  }
}

/** El cliente tiene la API habilitada pero falta su usuario de integracion. */
export class UsuarioIntegracionNoEncontradoError extends DomainError {
  readonly code = 'API_USUARIO_INTEGRACION_NO_ENCONTRADO';

  constructor() {
    super('No existe el usuario de integracion del cliente.');
  }
}

/** Los permisos de la clave estan vacios o incluyen alguno fuera de `PERMISOS_API`. */
export class PermisosApiInvalidosError extends DomainError {
  readonly code = 'API_PERMISOS_INVALIDOS';

  constructor() {
    super('La clave necesita al menos un permiso, y todos deben ser de la API publica.');
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
