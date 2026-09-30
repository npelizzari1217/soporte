import { TenantContext } from '../../tenancy/tenant-context';

/**
 * Hace cumplir la precondición de toda lectura con lock: que corra dentro de
 * una transacción abierta por `ITenantTransactionRunner.run()`.
 *
 * Fuera de una transacción explícita Postgres abre una implícita de una sola
 * sentencia, toma el lock (advisory o de fila) y lo libera al terminar esa
 * sentencia: la lectura devolvería datos que no protegen nada y dos escritores
 * verían lo mismo. Una advertencia en el JSDoc del puerto no alcanza, así que
 * se verifica contra el flag `enTransaccion` que pone `run()`.
 *
 * Es un `throw` y no un `Result`: llamar sin transacción es una violación de
 * contrato del llamador (un bug de armado del caso de uso), no una desviación
 * de negocio que el usuario deba ver.
 *
 * @param tenantContext Contexto del tenant activo.
 * @param operacion Nombre de la operación que lo exige, para el mensaje.
 * @throws Error si no hay una transacción activa del tenant.
 */
export function exigirTransaccionActiva(tenantContext: TenantContext, operacion: string): void {
  if (tenantContext.get()?.enTransaccion !== true) {
    throw new Error(
      `${operacion} requiere una transacción activa (ITenantTransactionRunner.run): fuera de ` +
        'ella Postgres libera el lock al terminar la sentencia y dos escritores verían lo mismo.',
    );
  }
}
