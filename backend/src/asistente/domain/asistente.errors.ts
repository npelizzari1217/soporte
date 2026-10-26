import { DomainError } from '../../shared/domain/result';

/** La URL del proveedor de IA no es una URL HTTPS válida. */
export class UrlIaInvalidaError extends DomainError {
  readonly code = 'IA_URL_INVALIDA';

  constructor() {
    super(
      'La URL del proveedor de IA debe ser una dirección https válida, sin usuario ni ' +
        'contraseña y de hasta 2048 caracteres.',
    );
  }
}

/** El modelo está vacío (o solo tiene espacios) o supera el largo de la columna. */
export class ModeloIaInvalidoError extends DomainError {
  readonly code = 'IA_MODELO_INVALIDO';

  constructor() {
    super('Indique el modelo de IA (hasta 100 caracteres).');
  }
}

/** La clave está vacía (o solo tiene espacios) o supera el tope. */
export class ClaveIaInvalidaError extends DomainError {
  readonly code = 'IA_CLAVE_INVALIDA';

  constructor() {
    super('La clave de IA no puede estar vacía ni superar los 500 caracteres.');
  }
}

/** Se pidió conservar la clave, pero el cliente todavía no tiene IA configurada. */
export class ClaveIaFaltanteError extends DomainError {
  readonly code = 'IA_CLAVE_FALTANTE';

  constructor() {
    super('Falta la clave: el cliente todavía no tiene una configuración de IA guardada.');
  }
}

/** "Probar" sobre un cliente sin IA configurada. */
export class IaNoConfiguradaError extends DomainError {
  readonly code = 'IA_NO_CONFIGURADA';

  constructor() {
    super('El cliente no tiene una configuración de IA guardada para probar.');
  }
}

/** Falta `EMAIL_CRYPTO_KEY` (o es inválida): no se puede cifrar la clave. No se guardó nada. */
export class ClaveCifradoIaAusenteError extends DomainError {
  readonly code = 'IA_CLAVE_CIFRADO_AUSENTE';

  constructor() {
    super(
      'No se puede guardar la configuración de IA: falta o es inválida la clave de cifrado del ' +
        'servidor (EMAIL_CRYPTO_KEY). No se guardó ningún dato.',
    );
  }
}

/** La clave guardada no descifra (se rotó `EMAIL_CRYPTO_KEY` sin re-cifrarla, o se manipuló). */
export class ClaveIaIndescifrableError extends DomainError {
  readonly code = 'IA_CLAVE_INDESCIFRABLE';

  constructor() {
    super('No se pudo descifrar la clave de IA guardada. Vuelva a cargarla.');
  }
}

/** El cliente no existe. */
export class ClienteIaNoEncontradoError extends DomainError {
  readonly code = 'IA_CLIENTE_NO_ENCONTRADO';

  constructor(clienteId: string) {
    super(`No se encontró el cliente ${clienteId}.`);
  }
}
