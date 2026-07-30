/**
 * 3.9 — RED: `AuditConfiguracionListener` (`@OnEvent(CONFIGURACION_CAMBIADA)`)
 * delega TODO el trabajo en `AuditConfiguracionHandler` (puro) y decide el
 * nivel de log según el outcome — try/catch de última red (mismo patrón que
 * `notificar-cambio-estado.listener.ts`, PR3 de `notif-email-estado-ticket`).
 *
 * Se instancia el handler REAL con un stub tipado de `AuditLogPort` (un solo
 * colaborador, sin over-mocking) y se espía `handle()` con `vi.spyOn` — cero
 * casts `as any`/`as unknown as` (DoD §9), el listener recibe el tipo exacto
 * que declara su constructor.
 *
 * Ningún assert de este archivo permite que un log contenga
 * `valorAnterior`/`valorNuevo` — el REQUISITO DURO de masking se verifica en
 * el write use case (PR4) y en el adapter de persistencia
 * (`audit-log.adapter.spec.ts`); acá se verifica la disciplina de logging:
 * el listener NUNCA interpola esos valores en ningún mensaje.
 *
 * Ref design: §5, §8. Ref spec: R5. Ref tasks: PR3 3.9/3.10.
 */
import { Logger } from '@nestjs/common';
import { AuditConfiguracionListener } from './audit-configuracion.listener';
import { AuditConfiguracionHandler } from '../../application/event-handlers/audit-configuracion.handler';
import { AuditLogPort } from '../../domain/ports/i-audit-log.port';
import { ConfiguracionCambiada } from '../../domain/events/configuracion-cambiada.event';

function makeEvent(): ConfiguracionCambiada {
  return new ConfiguracionCambiada(
    { kind: 'tenant', dbName: 'tenant_a_db' },
    'actor-uuid',
    'smtp',
    'pass',
    '********',
    '********',
    true,
    new Date('2026-07-30T12:00:00.000Z'),
  );
}

describe('AuditConfiguracionListener', () => {
  let auditLog: AuditLogPort;
  let handler: AuditConfiguracionHandler;
  let handleSpy: ReturnType<typeof vi.spyOn>;
  let listener: AuditConfiguracionListener;

  beforeEach(() => {
    auditLog = { record: vi.fn() };
    handler = new AuditConfiguracionHandler(auditLog);
    handleSpy = vi.spyOn(handler, 'handle');
    listener = new AuditConfiguracionListener(handler);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delega en el handler con el evento recibido', async () => {
    handleSpy.mockResolvedValue({ status: 'recorded' });
    const event = makeEvent();

    await listener.handleConfiguracionCambiada(event);

    expect(handleSpy).toHaveBeenCalledWith(event);
  });

  it('outcome "recorded" no loguea ERROR', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({ status: 'recorded' });

    await listener.handleConfiguracionCambiada(makeEvent());

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('outcome "failed" loguea ERROR con categoria/clave/codigo, sin exponer valores', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({
      status: 'failed',
      motivo: 'timeout de infra',
      codigo: 'AUDIT_WRITE_FAILED',
      categoria: 'smtp',
      clave: 'pass',
    });

    await listener.handleConfiguracionCambiada(makeEvent());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [mensaje] = errorSpy.mock.calls[0];
    expect(mensaje).toContain('smtp');
    expect(mensaje).toContain('pass');
    expect(mensaje).toContain('AUDIT_WRITE_FAILED');
    expect(mensaje).toContain('timeout de infra');
    expect(mensaje).not.toContain('********');
  });

  it('el cambio de config permanece intacto: un fallo de audit NUNCA propaga ni relanza', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({
      status: 'failed',
      motivo: 'timeout de infra',
      codigo: 'AUDIT_WRITE_FAILED',
      categoria: 'smtp',
      clave: 'pass',
    });

    await expect(listener.handleConfiguracionCambiada(makeEvent())).resolves.toBeUndefined();
  });

  it('última red: si el handler rechaza la promesa (contrato roto), se loguea ERROR y NO se propaga', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockRejectedValue(new Error('bug inesperado en un adapter'));

    await expect(listener.handleConfiguracionCambiada(makeEvent())).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
