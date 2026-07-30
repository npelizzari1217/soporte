/**
 * AuditConfiguracionListener — adapter de entrada `@OnEvent` (infra) que
 * delega TODO el trabajo en `AuditConfiguracionHandler` (application, puro)
 * y decide el nivel de log según el outcome retornado (D2/D3 — mismo patrón
 * que `notificar-cambio-estado.listener.ts`).
 *
 * Suscripción fire-and-forget (Dz10): `EventEmitterPublisher.publish()` usa
 * `emitter.emit()` (no `emitAsync`), así que este handler async corre
 * desacoplado del ciclo request/response sin bloquear la respuesta HTTP del
 * `PUT /configuracion` que ya comiteó el cambio.
 *
 * Última red de seguridad (mismo criterio que `notificar-cambio-estado.listener.ts`):
 * `handler.handle()` documenta "NUNCA lanza", pero si un bug futuro rompiera
 * ese contrato, una promesa rechazada sin `try/catch` acá sería un unhandled
 * rejection — sin handler global de proceso, Node 24 lo trata como fatal y
 * mata el proceso.
 *
 * NUNCA loguea `valorAnterior`/`valorNuevo` — ni siquiera en el mensaje de
 * ERROR de fallo de audit. El REQUISITO DURO de masking (STATE.md "Judgment
 * Day — PR1 — fixes Ronda 2" fix #6) es responsabilidad del write use case
 * (PR4) y del adapter de persistencia; este listener no agrega una segunda
 * superficie de fuga logueando esos campos.
 *
 * Ref spec: Requirement 5 (fallo de audit logueado, NO revierte). Ref
 * design: §5, §8, Dz10. Tarea: 3.9/3.10 (PR3).
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CONFIGURACION_CAMBIADA,
  ConfiguracionCambiada,
} from '../../domain/events/configuracion-cambiada.event';
import {
  AuditConfiguracionHandler,
  AuditConfiguracionOutcome,
} from '../../application/event-handlers/audit-configuracion.handler';

@Injectable()
export class AuditConfiguracionListener {
  private readonly logger = new Logger(AuditConfiguracionListener.name);

  constructor(private readonly handler: AuditConfiguracionHandler) {}

  @OnEvent(CONFIGURACION_CAMBIADA)
  async handleConfiguracionCambiada(event: ConfiguracionCambiada): Promise<void> {
    let outcome: AuditConfiguracionOutcome;
    try {
      outcome = await this.handler.handle(event);
    } catch (err) {
      // Última red de seguridad: el handler documenta "NUNCA lanza", pero si
      // ese contrato se rompiera (bug futuro en un adapter), NO propagamos —
      // un unhandled rejection acá tira abajo el proceso (Node 24, sin
      // handler global). Nunca se interpola valorAnterior/valorNuevo del
      // evento en este log.
      const motivo = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(
        `AuditConfiguracionHandler.handle() rechazó la promesa para "${event.categoria}.${event.clave}" ` +
          `— esto NO debería pasar (contrato "nunca throw"). Motivo: ${motivo}.`,
      );
      return;
    }

    switch (outcome.status) {
      case 'recorded':
        // Camino feliz: no amerita log (evita ruido, mismo criterio que el
        // outcome "skipped" de NotificarCambioEstadoListener).
        return;

      case 'failed':
        this.logger.error(
          `Fallo al escribir el AuditEntry de "${outcome.categoria}.${outcome.clave}" ` +
            `(código ${outcome.codigo}): ${outcome.motivo}. El cambio de config ya comiteado ` +
            `NO se ve afectado (Requirement 5 — fallo de audit no revierte).`,
        );
        return;

      default: {
        // Exhaustividad: si se agrega un status nuevo a
        // AuditConfiguracionOutcome sin manejarlo acá, esto rompe la
        // compilación (tsc --noEmit) en vez de fallar en silencio en
        // runtime.
        const _exhaustive: never = outcome;
        this.logger.error(`AuditConfiguracionOutcome no manejado: ${JSON.stringify(_exhaustive)}`);
        return;
      }
    }
  }
}
