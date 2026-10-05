import { describe, expect, it } from 'vitest';
import {
  RespuestaPredefinidaEntity,
  RESPUESTA_TEXTO_MAX_LENGTH,
  RESPUESTA_TITULO_MAX_LENGTH,
} from './respuesta-predefinida.entity';

/**
 * Se recorren create() Y actualizar(): el guard está invocado en los dos y, sin el par,
 * borrar uno solo no pone nada en rojo.
 */
describe.each([
  [
    'create()',
    (titulo: string, texto: string) => (): unknown =>
      RespuestaPredefinidaEntity.create({ titulo, texto, activo: true }),
  ],
  [
    'actualizar()',
    (titulo: string, texto: string) => (): unknown =>
      RespuestaPredefinidaEntity.create({ titulo: 'T', texto: 'X', activo: true }).actualizar({
        titulo,
        texto,
      }),
  ],
])('RespuestaPredefinidaEntity %s — precondición de largo', (_caso, construir) => {
  it('lanza si titulo está vacío', () => {
    expect(construir('', 'x')).toThrow(/titulo/);
  });

  it('lanza si titulo excede el tope', () => {
    expect(construir('T'.repeat(RESPUESTA_TITULO_MAX_LENGTH + 1), 'x')).toThrow(/titulo/);
  });

  it('acepta titulo en el tope exacto', () => {
    expect(construir('T'.repeat(RESPUESTA_TITULO_MAX_LENGTH), 'x')).not.toThrow();
  });

  it('lanza si texto está vacío', () => {
    expect(construir('T', '')).toThrow(/texto/);
  });

  it('lanza si texto excede el tope', () => {
    expect(construir('T', 'x'.repeat(RESPUESTA_TEXTO_MAX_LENGTH + 1))).toThrow(/texto/);
  });

  it('acepta texto en el tope exacto', () => {
    expect(construir('T', 'x'.repeat(RESPUESTA_TEXTO_MAX_LENGTH))).not.toThrow();
  });
});

describe('RespuestaPredefinidaEntity', () => {
  it('create() nace con los datos dados y sin baja lógica', () => {
    const r = RespuestaPredefinidaEntity.create({ titulo: 'Saludo', texto: 'Hola', activo: true });
    expect(r.titulo).toBe('Saludo');
    expect(r.texto).toBe('Hola');
    expect(r.activo).toBe(true);
    expect(r.deletedAt).toBeNull();
  });

  it('actualizar() es PATCH semántico: undefined no toca el campo', () => {
    const r = RespuestaPredefinidaEntity.create({ titulo: 'Saludo', texto: 'Hola', activo: true });
    r.actualizar({ texto: 'Buen día' });
    expect(r.titulo).toBe('Saludo');
    expect(r.texto).toBe('Buen día');
  });

  it('desactivar() baja el flag sin soft delete y activar() lo restituye', () => {
    const r = RespuestaPredefinidaEntity.create({ titulo: 'Saludo', texto: 'Hola', activo: true });
    r.desactivar();
    expect(r.activo).toBe(false);
    expect(r.deletedAt).toBeNull();
    r.activar();
    expect(r.activo).toBe(true);
  });

  it('reconstitute() NO valida largos (dato histórico no rompe la lectura)', () => {
    const fecha = new Date('2026-01-01');
    const r = RespuestaPredefinidaEntity.reconstitute(
      { titulo: 'T'.repeat(500), texto: 'x', activo: true },
      'id-1',
      fecha,
      fecha,
    );
    expect(r.id).toBe('id-1');
    expect(r.createdAt).toEqual(fecha);
  });
});
