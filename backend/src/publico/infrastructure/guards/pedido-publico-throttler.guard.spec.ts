/**
 * pedido-publico-throttler.guard.spec.ts — trackers de los throttlers con nombre (ADR-8).
 *
 * Cubre `trackerEmail`, `trackerCliente` y `trackerConfirmacion` como funciones puras: el punto
 * exacto donde una clave mal construida daría un cupo nuevo con solo rotar `x-forwarded-for`, o
 * dejaría el token crudo en el storage en memoria. El tracker de `contexto` (el `getTracker` de
 * la clase) lo cubren los e2e.
 *
 * Ref design: ADR-8 (Testing Strategy: trackers como unit). Sugerencia S2 del verify-report.
 */
import { createHash } from 'node:crypto';
import {
  trackerCliente,
  trackerConfirmacion,
  trackerEmail,
} from './pedido-publico-throttler.guard';

describe('trackerEmail()', () => {
  it('la clave es `${slug}:${email}` con el email recortado y en minúsculas', () => {
    const clave = trackerEmail({
      params: { slug: 'acme' },
      body: { email: '  Ana.Perez@Example.COM ' },
    });

    expect(clave).toBe('acme:ana.perez@example.com');
  });

  it('[CRITICAL] rotar x-forwarded-for no cambia la clave: el mismo buzón comparte cupo', () => {
    const base = { params: { slug: 'acme' }, body: { email: 'ana@example.com' } };

    const desdeIp1 = trackerEmail({ ...base, headers: { 'x-forwarded-for': '203.0.113.1' } });
    const desdeIp2 = trackerEmail({ ...base, headers: { 'x-forwarded-for': '203.0.113.2' } });

    expect(desdeIp1).toBe(desdeIp2);
  });

  it('es por cliente: el mismo email en dos slugs tiene cupos distintos', () => {
    const body = { email: 'ana@example.com' };

    expect(trackerEmail({ params: { slug: 'a' }, body })).not.toBe(
      trackerEmail({ params: { slug: 'b' }, body }),
    );
  });

  it('un email gigante se trunca a 320 caracteres en la clave', () => {
    const clave = trackerEmail({ params: { slug: 'acme' }, body: { email: 'x'.repeat(10_000) } });

    expect(clave).toBe(`acme:${'x'.repeat(320)}`);
  });

  it('sin email o sin slug no explota: usa contadores fijos', () => {
    expect(trackerEmail({ params: { slug: 'acme' }, body: {} })).toBe('acme:sin-email');
    expect(trackerEmail({ params: { slug: 'acme' }, body: { email: 42 } })).toBe('acme:sin-email');
    expect(trackerEmail({ body: { email: 'ana@example.com' } })).toBe('sin-slug:ana@example.com');
  });
});

describe('trackerCliente()', () => {
  it('la clave es solo el slug: ni el XFF ni el body la cambian', () => {
    const clave1 = trackerCliente({
      params: { slug: 'acme' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
      body: { email: 'ana@example.com' },
    });
    const clave2 = trackerCliente({
      params: { slug: 'acme' },
      headers: { 'x-forwarded-for': '203.0.113.2' },
      body: { email: 'otro@example.com' },
    });

    expect(clave1).toBe('acme');
    expect(clave2).toBe('acme');
  });

  it('sin slug usa un contador fijo', () => {
    expect(trackerCliente({})).toBe('sin-slug');
  });
});

describe('trackerConfirmacion()', () => {
  const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

  it('[CRITICAL] la clave es el sha256 del token: el token crudo no queda en el storage', () => {
    const clave = trackerConfirmacion({ body: { token: 'token-crudo-secreto' } });

    expect(clave).toBe(sha256('token-crudo-secreto'));
    expect(clave).not.toContain('token-crudo-secreto');
  });

  it('rotar x-forwarded-for o cambiar de slug no cambia la clave: el mismo token comparte cupo', () => {
    const body = { token: 'tok' };

    const clave1 = trackerConfirmacion({
      params: { slug: 'a' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
      body,
    });
    const clave2 = trackerConfirmacion({
      params: { slug: 'b' },
      headers: { 'x-forwarded-for': '203.0.113.2' },
      body,
    });

    expect(clave1).toBe(clave2);
  });

  it('un token gigante se trunca a 256 caracteres antes del hash', () => {
    const largo = 'a'.repeat(10_000);

    expect(trackerConfirmacion({ body: { token: largo } })).toBe(sha256('a'.repeat(256)));
  });

  it('sin token, token vacío o no string: comparten un contador fijo', () => {
    expect(trackerConfirmacion({ body: {} })).toBe('sin-token');
    expect(trackerConfirmacion({ body: { token: '' } })).toBe('sin-token');
    expect(trackerConfirmacion({ body: { token: 123 } })).toBe('sin-token');
    expect(trackerConfirmacion({})).toBe('sin-token');
  });
});
