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
