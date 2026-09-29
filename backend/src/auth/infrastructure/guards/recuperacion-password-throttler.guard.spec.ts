import { RecuperacionPasswordThrottlerGuard } from './recuperacion-password-throttler.guard';

function buildGuard(): RecuperacionPasswordThrottlerGuard {
  return new RecuperacionPasswordThrottlerGuard({} as never, {} as never, {} as never);
}

/** Acceso al método `protected` desde el test — mismo criterio que `csat-throttler.guard.spec.ts`. */
function getTracker(
  guard: RecuperacionPasswordThrottlerGuard,
  req: Record<string, unknown>,
): Promise<string> {
  return (
    guard as unknown as { getTracker: (req: Record<string, unknown>) => Promise<string> }
  ).getTracker(req);
}

describe('RecuperacionPasswordThrottlerGuard.getTracker() (ADR-3)', () => {
  it('[abuso] el mismo email con xff distintos comparte cupo — el xff NUNCA entra en la clave', async () => {
    const guard = buildGuard();

    const trackerXff1 = await getTracker(guard, {
      body: { email: 'Usuario@Ejemplo.com' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    const trackerXff2 = await getTracker(guard, {
      body: { email: 'Usuario@Ejemplo.com' },
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(trackerXff1).toBe(trackerXff2);
  });

  it('normaliza el email: trim + lowercase', async () => {
    const guard = buildGuard();

    const tracker = await getTracker(guard, { body: { email: '  Usuario@Ejemplo.com  ' } });

    expect(tracker).toBe('usuario@ejemplo.com');
  });

  it('usa el token cuando no hay email en el body', async () => {
    const guard = buildGuard();

    const tracker = await getTracker(guard, { body: { token: 'token-crudo' } });

    expect(tracker).toBe('token-crudo');
  });

  it('sin email ni token: no explota, usa un fallback fijo', async () => {
    const guard = buildGuard();

    const tracker = await getTracker(guard, { body: {} });

    expect(tracker).toBe('sin-identificador');
  });

  it('emails distintos producen claves distintas', async () => {
    const guard = buildGuard();

    const trackerA = await getTracker(guard, { body: { email: 'a@ejemplo.com' } });
    const trackerB = await getTracker(guard, { body: { email: 'b@ejemplo.com' } });

    expect(trackerA).not.toBe(trackerB);
  });
});
