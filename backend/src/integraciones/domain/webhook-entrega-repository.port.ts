import {
  DatosEncolarEntrega,
  FalloEntrega,
  PaginaEntregas,
  WebhookEntrega,
} from './webhook-entrega';

/**
 * Cola y registro de entregas de webhook en la base del INQUILINO bindeado (odd/webhooks, T2). Toda
 * operación corre contra el tenant del contexto: nunca ve ni toca entregas de otro cliente.
 */
export interface IWebhookEntregaRepository {
  /** Encola un aviso PENDIENTE con cero intentos. */
  encolar(datos: DatosEncolarEntrega): Promise<WebhookEntrega>;
  /**
   * Hasta `limite` entregas PENDIENTES con `proximoIntentoAt <= ahora`, la más atrasada primero.
   * No las reserva: el barrido por inquilino no corre en paralelo consigo mismo.
   */
  tomarVencidas(ahora: Date, limite: number): Promise<WebhookEntrega[]>;
  /**
   * Marca ENTREGADA una entrega PENDIENTE y suma el intento. Devuelve `false` si no existe o ya
   * no estaba PENDIENTE (no reabre una entrega terminada).
   */
  marcarEntregada(id: string, codigo: number, ahora: Date): Promise<boolean>;
  /**
   * Registra un intento fallido de una entrega PENDIENTE: suma el intento y guarda el código y el
   * error. Con `proximoIntentoAt` la reprograma; con `null` la deja FALLIDA. Devuelve `false` si no
   * existe o ya no estaba PENDIENTE.
   */
  registrarFallo(id: string, fallo: FalloEntrega): Promise<boolean>;
  /** Página `pagina` (desde 1) de `porPagina` entregas, la más nueva primero, con el total. */
  listar(opciones: { pagina: number; porPagina: number }): Promise<PaginaEntregas>;
  /** Borra las entregas creadas antes de `fecha` (estricto), en cualquier estado. Devuelve cuántas. */
  purgarAnterioresA(fecha: Date): Promise<number>;
}

export const WEBHOOK_ENTREGA_REPOSITORY = Symbol('IWebhookEntregaRepository');
