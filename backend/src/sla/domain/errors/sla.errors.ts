import { DomainError } from '../../../shared/domain/result';

/**
 * SlaConfigNoEncontradaError — no existe una fila `sla_config` para el
 * `prioridadId`/`id` indicado. Dado que `sla_config` se siembra 1:1 con el
 * catálogo FIJO de prioridades en provisioning (S1), su ausencia normalmente
 * indica una prioridad inexistente o un tenant no sembrado correctamente.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA4/SA5.
 */
export class SlaConfigNoEncontradaError extends DomainError {
  readonly code = 'SLA_CONFIG_NO_ENCONTRADA';

  constructor(referencia: string) {
    super(`Configuración de SLA "${referencia}" no encontrada en el tenant activo.`);
  }
}

/**
 * HorasInvalidasError — `horas` no es un entero positivo (`> 0`) al crear o
 * editar una fila de `sla_config` (S1).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA2/SA4.
 */
export class HorasInvalidasError extends DomainError {
  readonly code = 'HORAS_INVALIDAS';

  constructor(horas: number) {
    super(`horas debe ser un entero mayor a 0, se recibió: ${horas}.`);
  }
}
