/**
 * IRelojSlaMarcador — puerto del marcador del reloj de SLA (sdd/sla-primera-respuesta-y-pausa, ADR-3).
 *
 * Se llama DENTRO de la tx de la transicion, despues de guardar el ticket y la operacion: incrementa
 * `sla_reloj_version` bajo el lock de la fila y estampa esa secuencia en la operacion. No calcula nada.
 */
export interface IRelojSlaMarcador {
  marcar(ticketId: string, operacionId: string): Promise<void>;
}

export const RELOJ_SLA_MARCADOR = Symbol('RELOJ_SLA_MARCADOR');
