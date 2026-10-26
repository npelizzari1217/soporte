import { DomainError, Result } from '../../shared/domain/result';
import { DestinoIa } from './config-ia';

/** Un mensaje de la conversación con el modelo, en el formato de chat completions. */
export interface MensajeIa {
  rol: 'system' | 'user';
  contenido: string;
}

/** Pedido de una respuesta al modelo. */
export interface PedidoIa {
  mensajes: MensajeIa[];
  temperatura: number;
  maxTokens: number;
}

/**
 * Falla del proveedor con un motivo SANEADO, apto para mostrar a ROOT y para guardar: nunca incluye
 * la respuesta cruda del proveedor, que puede reflejar la clave o datos del pedido.
 */
export class FallaModeloIaError extends DomainError {
  readonly code = 'IA_FALLA_PROVEEDOR';

  constructor(motivo: string) {
    super(motivo);
  }
}

/** Cliente de un modelo de lenguaje por chat completions compatible con OpenAI. */
export interface IModeloIa {
  /** Pide una respuesta. El texto devuelto viene recortado y nunca vacío. */
  completar(destino: DestinoIa, pedido: PedidoIa): Promise<Result<string, FallaModeloIaError>>;
}

export const MODELO_IA = Symbol('IModeloIa');
