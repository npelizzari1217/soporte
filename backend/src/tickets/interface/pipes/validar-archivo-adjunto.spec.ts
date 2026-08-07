/**
 * validar-archivo-adjunto.spec.ts — TDD RED phase (T10.1, PR10).
 *
 * Unit puro: sin mocks de puertos, sin DB. Valida tamaño/mime en la capa
 * interface (T21) ANTES de que la request llegue al use case.
 *
 * Ref spec: sdd/tickets-core/spec T21. Ref design: ADR-7 ("Validación
 * tamaño/mime en la capa interface (pipe)"). Tarea: T10.1.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { MAX_ADJUNTO_BYTES, validarAdjunto } from './validar-archivo-adjunto';

function archivo(overrides: Partial<{ size: number; mimetype: string }> = {}) {
  return { size: 1024, mimetype: 'application/pdf', ...overrides };
}

describe('validarAdjunto (T10.1, T21)', () => {
  it('rechaza si no se envió ningún archivo', () => {
    expect(() => validarAdjunto(undefined)).toThrow(UnprocessableEntityException);
  });

  it('rechaza tamano_bytes = 0', () => {
    expect(() => validarAdjunto(archivo({ size: 0 }))).toThrow(UnprocessableEntityException);
  });

  it('rechaza tamano_bytes > 10MB', () => {
    expect(() => validarAdjunto(archivo({ size: MAX_ADJUNTO_BYTES + 1 }))).toThrow(
      UnprocessableEntityException,
    );
  });

  it('acepta tamano_bytes exactamente 10MB (el límite MISMO no se rechaza, solo > 10MB)', () => {
    expect(() => validarAdjunto(archivo({ size: MAX_ADJUNTO_BYTES }))).not.toThrow();
  });

  it('acepta cualquier mime "image/*"', () => {
    expect(() => validarAdjunto(archivo({ mimetype: 'image/png' }))).not.toThrow();
    expect(() => validarAdjunto(archivo({ mimetype: 'image/jpeg' }))).not.toThrow();
  });

  it('acepta PDF, Office y ZIP', () => {
    const permitidos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'application/x-zip-compressed',
    ];
    for (const mimetype of permitidos) {
      expect(() => validarAdjunto(archivo({ mimetype }))).not.toThrow();
    }
  });

  it('rechaza un mime fuera de la whitelist (ej. video/mp4, text/plain, executable)', () => {
    expect(() => validarAdjunto(archivo({ mimetype: 'video/mp4' }))).toThrow(
      UnprocessableEntityException,
    );
    expect(() => validarAdjunto(archivo({ mimetype: 'text/plain' }))).toThrow(
      UnprocessableEntityException,
    );
    expect(() => validarAdjunto(archivo({ mimetype: 'application/x-msdownload' }))).toThrow(
      UnprocessableEntityException,
    );
  });
});
