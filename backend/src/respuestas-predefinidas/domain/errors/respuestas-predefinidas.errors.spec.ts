import { describe, expect, it } from 'vitest';
import {
  RespuestaPredefinidaNoEncontradaError,
  RespuestaPredefinidaTituloDuplicadoError,
} from './respuestas-predefinidas.errors';

describe('errores de respuestas predefinidas', () => {
  it('NoEncontrada expone code estable y el id', () => {
    const error = new RespuestaPredefinidaNoEncontradaError('id-1');
    expect(error.code).toBe('RESPUESTA_PREDEFINIDA_NO_ENCONTRADA');
    expect(error.message).toContain('id-1');
  });

  it('TituloDuplicado expone code estable y el título', () => {
    const error = new RespuestaPredefinidaTituloDuplicadoError('Saludo');
    expect(error.code).toBe('RESPUESTA_PREDEFINIDA_TITULO_DUPLICADO');
    expect(error.message).toContain('Saludo');
  });
});
