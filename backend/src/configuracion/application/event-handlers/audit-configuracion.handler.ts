/**
 * AuditConfiguracionHandler — handler PURO de aplicación (sin decorators
 * NestJS) que reacciona a `ConfiguracionCambiada` construyendo un
 * `AuditEntry` y persistiéndolo vía `AuditLogPort.record()`. NUNCA lanza —
 * todo camino de fallo se modela como un `AuditConfiguracionOutcome`
 * tipado; el framework (logging) vive en el listener de infra que lo invoca
 * (`audit-configuracion.listener.ts`, mismo split D2/D3 que
 * `notificar-cambio-estado.handler.ts`/`.listener.ts`).
 *
 * Los valores `valorAnterior`/`valorNuevo` del evento YA vienen enmascarados
 * si `esSecreto` (Dz7 — garantía del write use case, PR4). DEFENSE-IN-DEPTH
 * (Judgment Day PR3 Ronda 1, issue 1 — MEDIUM): este handler NO confía
 * ciegamente en esa garantía aguas arriba — vuelve a aplicar `maskIfSecret()`
 * (el guard central, pure e idempotente, `mask-secret.ts`) al construir el
 * `AuditEntry`. Si PR4 alguna vez olvidara enmascarar en el origen, este
 * handler es la última red antes de que el plaintext toque `audit_entries`.
 * Re-enmascarar un valor ya enmascarado (`SECRET_MASK`) es un no-op — el
 * guard es idempotente por contrato (`mask-secret.spec.ts`).
 *
 * Fallo de audit NUNCA bloquea ni revierte el cambio de config ya
 * comiteado (Dz10, R5 "fallo de audit no revierte"): `record()` fallido se
 * retorna como outcome `failed`, sin reintento ni compensación acá.
 *
 * Ref spec: Requirement 5. Ref design: §5 (firma), §8, Dz10. Tarea: 3.6-3.8
 * (PR3).
 */
import { AuditEntry } from '../../domain/entities/audit-entry.entity';
import { ConfiguracionCambiada } from '../../domain/events/configuracion-cambiada.event';
import { AuditLogPort } from '../../domain/ports/i-audit-log.port';
import { maskIfSecret } from '../../domain/mask-secret';

/** `accion` persistida en `AuditEntry` para todo cambio vía `ActualizarConfigUseCase`. */
export const ACCION_CONFIG_ACTUALIZADA = 'config.actualizada';

export type AuditConfiguracionOutcome =
  | { status: 'recorded' }
  | { status: 'failed'; motivo: string; codigo: string; categoria: string; clave: string };

export class AuditConfiguracionHandler {
  constructor(private readonly auditLog: AuditLogPort) {}

  /**
   * NUNCA lanza. Cualquier fallo de `AuditLogPort.record()` se retorna como
   * outcome tipado — el llamador (listener `@OnEvent`) decide qué y cómo
   * loguear.
   */
  async handle(event: ConfiguracionCambiada): Promise<AuditConfiguracionOutcome> {
    const entry = AuditEntry.create({
      actorId: event.actorId,
      accion: ACCION_CONFIG_ACTUALIZADA,
      categoria: event.categoria,
      clave: event.clave,
      // Defense-in-depth (Judgment Day PR3 Ronda 1, issue 1): re-aplicar el
      // guard central acá, aunque el evento YA debería venir enmascarado
      // desde PR4. Idempotente — no-op si ya viene enmascarado.
      valorAnterior: maskIfSecret(event.valorAnterior, event.esSecreto),
      valorNuevo: maskIfSecret(event.valorNuevo, event.esSecreto),
      esSecreto: event.esSecreto,
    });

    const result = await this.auditLog.record(entry, event.scope);
    if (result.isFail()) {
      const error = result.getError();
      return {
        status: 'failed',
        motivo: error.message,
        codigo: error.code,
        categoria: event.categoria,
        clave: event.clave,
      };
    }

    return { status: 'recorded' };
  }
}
