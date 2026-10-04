import { DomainError } from '../../../shared/domain/result';

/**
 * PedidoPendienteInvalidoError — los datos del pedido público pendiente no cumplen las reglas del
 * dominio (límites de largo). Última línea de defensa: el DTO del borde ya filtra.
 * (sdd/formulario-publico-qr, WU-11)
 */
export class PedidoPendienteInvalidoError extends DomainError {
  readonly code = 'PEDIDO_PENDIENTE_INVALIDO';

  constructor(motivo: string) {
    super(`Pedido público inválido: ${motivo}`);
  }
}

/**
 * FormularioPublicoNoDisponibleError — el formulario público del slug no está disponible. Un solo
 * error para todos los motivos (slug mal formado o inexistente, formulario deshabilitado, cliente
 * inactivo o borrado): un endpoint anónimo no puede distinguirlos sin servir de oráculo.
 * (sdd/formulario-publico-qr, WU-12; ADR-1)
 */
export class FormularioPublicoNoDisponibleError extends DomainError {
  readonly code = 'FORMULARIO_PUBLICO_NO_DISPONIBLE';

  constructor() {
    super('El formulario no está disponible.');
  }
}
