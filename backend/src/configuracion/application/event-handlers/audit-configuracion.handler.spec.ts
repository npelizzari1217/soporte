/**
 * 3.6 — RED: `AuditConfiguracionHandler` persiste `AuditEntry` vía
 * `AuditLogPort.record()` a partir del evento `ConfiguracionCambiada`.
 * 3.7 — RED: `AuditLogPort.record()` falla ⇒ el handler retorna un outcome
 * tipado de fallo, NUNCA lanza (R5 escenario "fallo de audit no revierte" —
 * el log ERROR real lo hace el listener de infra, ver
 * `audit-configuracion.listener.spec.ts`, D2/D3 mismo patrón que
 * `notificar-cambio-estado.handler.ts`/`.listener.ts`).
 *
 * Handler puro de `application/` (sin decorators NestJS) — un solo
 * colaborador mockeado (`AuditLogPort`), sin over-mocking.
 *
 * Ref design: §5, §8, Dz10. Ref spec: R5 (los 2 primeros escenarios + "fallo
 * de audit no revierte"). Ref tasks: PR3 3.6/3.7.
 */
import { AuditConfiguracionHandler } from './audit-configuracion.handler';
import { AuditLogPort, AuditError } from '../../domain/ports/i-audit-log.port';
import { ConfiguracionCambiada } from '../../domain/events/configuracion-cambiada.event';
import { Result } from '../../../shared/domain/result';

function makeEventoNoSecreto(): ConfiguracionCambiada {
  return new ConfiguracionCambiada(
    { kind: 'tenant', dbName: 'tenant_a_db' },
    'actor-uuid',
    'smtp',
    'host',
    'old.smtp.com',
    'new.smtp.com',
    false,
    new Date('2026-07-30T12:00:00.000Z'),
  );
}

function makeEventoSecreto(): ConfiguracionCambiada {
  return new ConfiguracionCambiada(
    { kind: 'global' },
    'actor-uuid',
    'smtp',
    'pass',
    '********',
    '********',
    true,
    new Date('2026-07-30T12:00:00.000Z'),
  );
}

describe('AuditConfiguracionHandler', () => {
  describe('handle()', () => {
    it('construye un AuditEntry con los datos del evento y lo persiste vía AuditLogPort.record()', async () => {
      const recordSpy = vi.fn().mockResolvedValue(Result.ok(undefined));
      const auditLog: AuditLogPort = { record: recordSpy };
      const handler = new AuditConfiguracionHandler(auditLog);
      const event = makeEventoNoSecreto();

      const outcome = await handler.handle(event);

      expect(outcome.status).toBe('recorded');
      expect(recordSpy).toHaveBeenCalledTimes(1);
      const [entryArg, scopeArg] = recordSpy.mock.calls[0];
      expect(entryArg.props.actorId).toBe('actor-uuid');
      expect(entryArg.props.categoria).toBe('smtp');
      expect(entryArg.props.clave).toBe('host');
      expect(entryArg.props.valorAnterior).toBe('old.smtp.com');
      expect(entryArg.props.valorNuevo).toBe('new.smtp.com');
      expect(entryArg.props.esSecreto).toBe(false);
      expect(scopeArg).toEqual({ kind: 'tenant', dbName: 'tenant_a_db' });
    });

    it('persiste el AuditEntry con los valores YA enmascarados tal cual llegan del evento cuando esSecreto=true', async () => {
      const recordSpy = vi.fn().mockResolvedValue(Result.ok(undefined));
      const auditLog: AuditLogPort = { record: recordSpy };
      const handler = new AuditConfiguracionHandler(auditLog);
      const event = makeEventoSecreto();

      await handler.handle(event);

      const [entryArg] = recordSpy.mock.calls[0];
      expect(entryArg.props.esSecreto).toBe(true);
      expect(entryArg.props.valorAnterior).toBe('********');
      expect(entryArg.props.valorNuevo).toBe('********');
    });

    it('AuditLogPort.record() falla ⇒ retorna outcome "failed" tipado, NUNCA lanza', async () => {
      const fallo = new AuditError('No se pudo escribir el audit — timeout de infra.');
      const recordSpy = vi.fn().mockResolvedValue(Result.fail(fallo));
      const auditLog: AuditLogPort = { record: recordSpy };
      const handler = new AuditConfiguracionHandler(auditLog);
      const event = makeEventoNoSecreto();

      const outcome = await handler.handle(event);

      expect(outcome.status).toBe('failed');
      if (outcome.status === 'failed') {
        expect(outcome.codigo).toBe('AUDIT_WRITE_FAILED');
        expect(outcome.categoria).toBe('smtp');
        expect(outcome.clave).toBe('host');
      }
    });

    it('el handler no revierte nada — solo retorna el outcome, sin llamar a ningún otro colaborador', async () => {
      const recordSpy = vi.fn().mockResolvedValue(Result.fail(new AuditError('fallo de infra')));
      const auditLog: AuditLogPort = { record: recordSpy };
      const handler = new AuditConfiguracionHandler(auditLog);

      const outcome = await handler.handle(makeEventoNoSecreto());

      expect(outcome).toEqual({
        status: 'failed',
        motivo: 'fallo de infra',
        codigo: 'AUDIT_WRITE_FAILED',
        categoria: 'smtp',
        clave: 'host',
      });
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });
  });
});
