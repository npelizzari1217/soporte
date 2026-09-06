import { describe, expect, it } from 'vitest';
import {
  FamiliaInsumoNoEncontradaError,
  FamiliaInsumoCodigoDuplicadoError,
} from './familias-insumo.errors';

describe('Errores de dominio de familias de insumo', () => {
  it('FamiliaInsumoNoEncontradaError expone code FAMILIA_INSUMO_NO_ENCONTRADA', () => {
    const error = new FamiliaInsumoNoEncontradaError('id-x');
    expect(error.code).toBe('FAMILIA_INSUMO_NO_ENCONTRADA');
    expect(error.message).toContain('id-x');
  });

  it('FamiliaInsumoCodigoDuplicadoError expone code FAMILIA_INSUMO_CODIGO_DUPLICADO', () => {
    const error = new FamiliaInsumoCodigoDuplicadoError('TONER');
    expect(error.code).toBe('FAMILIA_INSUMO_CODIGO_DUPLICADO');
    expect(error.message).toContain('TONER');
  });

  /**
   * El código queda tomado por la fila existente esté habilitada o no, y en
   * este catálogo nada se elimina. Un mensaje que hable de "dada de baja"
   * manda al administrador a buscar una eliminación que nunca ocurrió.
   */
  it('FamiliaInsumoCodigoDuplicadoError describe el duplicado como activo o inactivo, sin hablar de baja', () => {
    const error = new FamiliaInsumoCodigoDuplicadoError('TONER');
    expect(error.message).toContain('(activa o inactiva)');
    expect(error.message).not.toContain('dada de baja');
  });
});
