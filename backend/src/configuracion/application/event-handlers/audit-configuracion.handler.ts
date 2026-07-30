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
 * si `esSecreto` (Dz7 — garantía del write use case, PR4): este handler NO
 * enmascara nada — transporta el evento a la entidad tal cual.
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
      valorAnterior: event.valorAnterior,
      valorNuevo: event.valorNuevo,
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
