/**
 * validar-logo-cliente.spec.ts — TDD RED phase (sdd/logo-por-cliente, WU2, 2.1).
 *
 * Unit puro: sin mocks de puertos, sin DB. Whitelist EXACTA de 3 mimes
 * (design.md D7) — HERMANO de `validar-archivo-adjunto.ts` (T10.1), nunca
 * reuso: ese pipe acepta cualquier `image/*` por prefijo
 * (`validar-archivo-adjunto.ts:36`), lo que aceptaría `image/svg+xml` (riesgo
 * XSS). Este test se pone en rojo si `validarLogoCliente` alguna vez muta a
 * un chequeo por prefijo en vez de la whitelist exacta.
 *
 * Ref spec: clientes-logo/spec.md, Requirement "Validación de formato y
 * tamaño antes de guardar". Ref design: design.md D7. Tarea: 2.1.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_LOGO_BYTES, MIMES_LOGO, validarLogoCliente } from './validar-logo-cliente';

function archivo(overrides: Partial<{ size: number; mimetype: string }> = {}) {
  return { size: 1024, mimetype: 'image/png', ...overrides };
}

describe('validarLogoCliente (2.1)', () => {
  it('rechaza si no se envió ningún archivo', () => {
    expect(() => validarLogoCliente(undefined)).toThrow(UnprocessableEntityException);
  });

  it('acepta image/png, image/jpeg e image/webp hasta 512 KB', () => {
    for (const mimetype of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validarLogoCliente(archivo({ mimetype, size: MAX_LOGO_BYTES }))).not.toThrow();
    }
  });

  it('rechaza image/svg+xml con 422 AUNQUE empiece con "image/" (D7, anti-XSS)', () => {
    expect(() => validarLogoCliente(archivo({ mimetype: 'image/svg+xml' }))).toThrow(
      UnprocessableEntityException,
    );
  });

  it('la whitelist es un Set EXACTO de 3 valores, no un prefijo — se pone en rojo si eso muta', () => {
    // Ancla estructural: si alguien reemplaza MIMES_LOGO por un chequeo
    // `startsWith('image/')`, este assert (y el test de SVG de arriba) fallan.
    expect(MIMES_LOGO.size).toBe(3);
    expect(MIMES_LOGO.has('image/svg+xml')).toBe(false);
  });

  it('rechaza cualquier otro mime fuera de la whitelist', () => {
    expect(() => validarLogoCliente(archivo({ mimetype: 'application/pdf' }))).toThrow(
      UnprocessableEntityException,
    );
    expect(() => validarLogoCliente(archivo({ mimetype: 'image/gif' }))).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rechaza 0 bytes con 422, antes de escribir en disco', () => {
    expect(() => validarLogoCliente(archivo({ size: 0 }))).toThrow(UnprocessableEntityException);
  });

  it('rechaza más de 512 KB con 422, antes de escribir en disco', () => {
    expect(() => validarLogoCliente(archivo({ size: MAX_LOGO_BYTES + 1 }))).toThrow(
      UnprocessableEntityException,
    );
  });

  it('acepta exactamente 512 KB (el límite mismo no se rechaza, solo > 512 KB)', () => {
    expect(() => validarLogoCliente(archivo({ size: MAX_LOGO_BYTES }))).not.toThrow();
  });
});
