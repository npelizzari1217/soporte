/**
 * csat-throttler.guard.spec.ts — TDD RED→GREEN (Tarea 7.3, ADR-C6).
 *
 * Cubre únicamente `getTracker()`: el punto exacto donde una clave mal
 * construida colapsaría el cupo de todos los usuarios detrás del mismo BFF
 * en uno solo. Sin bootstrap de Nest — se instancia la clase directamente
 * (el constructor heredado de `ThrottlerGuard` no valida sus args en
 * runtime).
 *
 * Ref design: ADR-C6. Tarea: 7.3.
 */
import { CsatThrottlerGuard } from './csat-throttler.guard';

function buildGuard(): CsatThrottlerGuard {
  return new CsatThrottlerGuard({} as never, {} as never, {} as never);
}

/** Acceso al método `protected` desde el test — mismo criterio que otros specs de guards del repo. */
function getTracker(guard: CsatThrottlerGuard, req: Record<string, unknown>): Promise<string> {
  return (
    guard as unknown as { getTracker: (req: Record<string, unknown>) => Promise<string> }
  ).getTracker(req);
}

describe('CsatThrottlerGuard.getTracker()', () => {
  it('[CRITICAL] el TOKEN es el componente primario — dos usuarios detrás del MISMO BFF (misma IP) con tokens distintos NO comparten clave', async () => {
    const guard = buildGuard();

    const trackerA = await getTracker(guard, {
      params: { token: 'token-usuario-a' },
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    const trackerB = await getTracker(guard, {
      params: { token: 'token-usuario-b' },
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });

    expect(trackerA).not.toBe(trackerB);
  });

  it('el MISMO token detrás de IPs distintas (BFF cambia de origen) produce claves distintas — la IP sigue siendo un discriminador', async () => {
    const guard = buildGuard();

    const trackerIp1 = await getTracker(guard, {
      params: { token: 'token-compartido' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    const trackerIp2 = await getTracker(guard, {
      params: { token: 'token-compartido' },
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(trackerIp1).not.toBe(trackerIp2);
  });

  it('sin header x-forwarded-for: no explota, usa un fallback fijo', async () => {
    const guard = buildGuard();

    const tracker = await getTracker(guard, {
      params: { token: 'token-sin-proxy' },
      headers: {},
    });

    expect(tracker).toContain('token-sin-proxy');
  });

  it('el tracker es determinístico: la MISMA combinación produce SIEMPRE la MISMA clave', async () => {
    const guard = buildGuard();
    const req = { params: { token: 't1' }, headers: { 'x-forwarded-for': '1.2.3.4' } };

    const primera = await getTracker(guard, req);
    const segunda = await getTracker(guard, req);

    expect(primera).toBe(segunda);
  });
});
