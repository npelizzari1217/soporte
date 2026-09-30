import { describe, expect, it } from 'vitest';
import {
  UnidadMedidaCambiadaError,
  UnidadMedidaEnUsoPorSerieError,
  UnidadMedidaNoEnteraError,
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
} from './unidades-medida.errors';

describe('Errores de dominio de unidades de medida', () => {
  it('UnidadMedidaNoEncontradaError expone code UNIDAD_MEDIDA_NO_ENCONTRADA', () => {
    const error = new UnidadMedidaNoEncontradaError('id-x');
    expect(error.code).toBe('UNIDAD_MEDIDA_NO_ENCONTRADA');
    expect(error.message).toContain('id-x');
  });

  it('UnidadMedidaCodigoDuplicadoError expone code UNIDAD_MEDIDA_CODIGO_DUPLICADO', () => {
    const error = new UnidadMedidaCodigoDuplicadoError('UN');
    expect(error.code).toBe('UNIDAD_MEDIDA_CODIGO_DUPLICADO');
    expect(error.message).toContain('UN');
  });

  /**
   * El código queda tomado por la fila existente esté habilitada o no, y en
   * este catálogo nada se elimina. Un mensaje que hable de "dada de baja"
   * manda al administrador a buscar una eliminación que nunca ocurrió.
   */
  it('UnidadMedidaCodigoDuplicadoError describe el duplicado como activo o inactivo, sin hablar de baja', () => {
    const error = new UnidadMedidaCodigoDuplicadoError('UN');
    expect(error.message).toContain('(activa o inactiva)');
    expect(error.message).not.toContain('dada de baja');
  });

  it.each([
    [new UnidadMedidaNoEnteraError('um-1'), 'UNIDAD_MEDIDA_NO_ENTERA'],
    [new UnidadMedidaEnUsoPorSerieError('um-1'), 'UNIDAD_MEDIDA_EN_USO_POR_SERIE'],
    [new UnidadMedidaCambiadaError('um-1'), 'UNIDAD_MEDIDA_CAMBIADA'],
  ])('%s expone su code estable y nombra el id', (error, code) => {
    expect(error.code).toBe(code);
    expect(error.message).toContain('um-1');
  });

  it('UnidadMedidaCambiadaError indica que es reintentable', () => {
    expect(new UnidadMedidaCambiadaError('i-1').message).toContain('Reintent');
  });
});
