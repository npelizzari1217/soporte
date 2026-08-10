import { DomainError } from '../../../shared/domain/result';

/**
 * CodigoTipoComponenteInvalidoError — el `codigo` recibido queda vacío tras
 * normalizar (`trim().toUpperCase()`). Validado en `TipoComponente.create()`.
 * → HTTP 422 Unprocessable Entity en la capa de presentación.
 */
export class CodigoTipoComponenteInvalidoError extends DomainError {
  readonly code = 'TC_CODIGO_INVALIDO';

  constructor(codigo: string) {
    super(`Código de tipo de componente inválido: "${codigo}". No puede quedar vacío.`);
  }
}

/**
 * CodigoTipoComponenteDuplicadoError — el `codigo` normalizado ya existe en
 * el catálogo MASTER (`tipos_componente.codigo` UNIQUE). Validado en la capa
 * de aplicación (use case de alta), no en la entidad.
 * → HTTP 409 Conflict en la capa de presentación.
 */
export class CodigoTipoComponenteDuplicadoError extends DomainError {
  readonly code = 'TC_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(`Ya existe un tipo de componente con el código "${codigo}".`);
  }
}

/**
 * TipoComponenteNotFoundError — el `id` (o `codigo`) solicitado no existe en
 * el catálogo MASTER `tipos_componente`.
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class TipoComponenteNotFoundError extends DomainError {
  readonly code = 'TC_NOT_FOUND';

  constructor(identificador: string) {
    super(`Tipo de componente "${identificador}" no encontrado.`);
  }
}
