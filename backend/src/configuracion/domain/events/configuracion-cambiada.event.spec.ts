/**
 * 3.4 — `ConfiguracionCambiada` — forma exacta del evento (design §5): scope
 * dual (`tenant`/`global`), valores YA enmascarados si `esSecreto` (Dz7 — la
 * entidad no enmascara, solo transporta lo que le pasan; la garantía de que
 * NUNCA llega cleartext acá vive en el write use case, PR4).
 *
 * Ref design: §5, §2 Dz7. Ref spec: R5. Ref tasks: PR3 3.4.
 */
import {
  ConfiguracionCambiada,
  CONFIGURACION_CAMBIADA,
  ConfigScope,
} from './configuracion-cambiada.event';

describe('ConfiguracionCambiada', () => {
  it('expone CONFIGURACION_CAMBIADA como eventName de la constante', () => {
    expect(CONFIGURACION_CAMBIADA).toBe('configuracion.cambiada');
  });

  it('construye el evento con scope tenant y valores no-secretos', () => {
    const occurredAt = new Date('2026-07-30T12:00:00.000Z');
    const scope: ConfigScope = { kind: 'tenant', clienteId: 'cliente-uuid-a' };

    const event = new ConfiguracionCambiada(
      scope,
      'actor-uuid',
      'smtp',
      'host',
      'old.smtp.com',
      'new.smtp.com',
      false,
      occurredAt,
    );

    expect(event.eventName).toBe(CONFIGURACION_CAMBIADA);
    expect(event.scope).toEqual({ kind: 'tenant', clienteId: 'cliente-uuid-a' });
    expect(event.actorId).toBe('actor-uuid');
    expect(event.categoria).toBe('smtp');
    expect(event.clave).toBe('host');
    expect(event.valorAnterior).toBe('old.smtp.com');
    expect(event.valorNuevo).toBe('new.smtp.com');
    expect(event.esSecreto).toBe(false);
    expect(event.occurredAt).toBe(occurredAt);
  });

  it('construye el evento con scope global y valores enmascarados (esSecreto=true)', () => {
    const scope: ConfigScope = { kind: 'global' };

    const event = new ConfiguracionCambiada(
      scope,
      'actor-uuid',
      'smtp',
      'pass',
      '********',
      '********',
      true,
      new Date(),
    );

    expect(event.scope).toEqual({ kind: 'global' });
    expect(event.esSecreto).toBe(true);
    expect(event.valorAnterior).toBe('********');
    expect(event.valorNuevo).toBe('********');
  });

  it('acepta valorAnterior null (primer set de una clave, sin fila previa)', () => {
    const event = new ConfiguracionCambiada(
      { kind: 'tenant', clienteId: 'cliente-uuid-a' },
      'actor-uuid',
      'smtp',
      'from',
      null,
      'no-reply@dominio.com',
      false,
      new Date(),
    );

    expect(event.valorAnterior).toBeNull();
  });
});
