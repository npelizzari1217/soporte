import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain/result';
import {
  CodigoAlternativoDuplicadoError,
  FamiliaInsumoDeshabilitadaError,
  FamiliaInsumoInexistenteError,
  InsumoCodigoDuplicadoError,
  InsumoNoEncontradoError,
  UnidadMedidaDeshabilitadaError,
  UnidadMedidaInexistenteError,
} from './insumos.errors';

describe('Errores de dominio de insumos', () => {
  it('InsumoNoEncontradoError expone code INSUMO_NO_ENCONTRADO y nombra el id', () => {
    const error = new InsumoNoEncontradoError('id-x');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INSUMO_NO_ENCONTRADO');
    expect(error.message).toContain('id-x');
  });

  /**
   * El índice `insumos_codigo_key` NO es parcial: no filtra por `activo` ni
   * por `deleted_at`. Un código ocupado sigue tomado aunque el insumo esté
   * deshabilitado o dado de baja, y el mensaje tiene que decirlo — si no, el
   * administrador busca el código en el listado, no lo ve (porque el insumo
   * está deshabilitado) y concluye que el sistema miente.
   */
  it('InsumoCodigoDuplicadoError expone code INSUMO_CODIGO_DUPLICADO y nombra el código', () => {
    const error = new InsumoCodigoDuplicadoError('TON-001');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INSUMO_CODIGO_DUPLICADO');
    expect(error.message).toContain('TON-001');
  });

  it('InsumoCodigoDuplicadoError avisa que el código sigue tomado aunque el insumo no esté vigente', () => {
    const error = new InsumoCodigoDuplicadoError('TON-001');
    expect(error.message).toContain('activo o inactivo');
    expect(error.message).toContain('baja');
  });

  it('FamiliaInsumoInexistenteError expone code FAMILIA_INSUMO_INEXISTENTE y nombra el id', () => {
    const error = new FamiliaInsumoInexistenteError('id-familia');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(error.message).toContain('id-familia');
  });

  /**
   * Existir y ser elegible son dos cosas distintas: la FK no atrapa a la
   * familia deshabilitada —la fila existe— así que el error tiene que ser
   * otro, o el administrador recibe "no existe" sobre algo que ve en el
   * listado.
   */
  it('FamiliaInsumoDeshabilitadaError expone un code distinto del de la familia inexistente', () => {
    const deshabilitada = new FamiliaInsumoDeshabilitadaError('id-familia');
    const inexistente = new FamiliaInsumoInexistenteError('id-familia');

    expect(deshabilitada).toBeInstanceOf(DomainError);
    expect(deshabilitada.code).toBe('FAMILIA_INSUMO_DESHABILITADA');
    expect(deshabilitada.code).not.toBe(inexistente.code);
    expect(deshabilitada.message).toContain('id-familia');
  });

  it('UnidadMedidaInexistenteError expone code UNIDAD_MEDIDA_INEXISTENTE y nombra el id', () => {
    const error = new UnidadMedidaInexistenteError('id-unidad');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
    expect(error.message).toContain('id-unidad');
  });

  it('UnidadMedidaDeshabilitadaError expone un code distinto del de la unidad inexistente', () => {
    const deshabilitada = new UnidadMedidaDeshabilitadaError('id-unidad');
    const inexistente = new UnidadMedidaInexistenteError('id-unidad');

    expect(deshabilitada).toBeInstanceOf(DomainError);
    expect(deshabilitada.code).toBe('UNIDAD_MEDIDA_DESHABILITADA');
    expect(deshabilitada.code).not.toBe(inexistente.code);
    expect(deshabilitada.message).toContain('id-unidad');
  });

  describe('CodigoAlternativoDuplicadoError', () => {
    it('expone code CODIGO_ALTERNATIVO_DUPLICADO y nombra el par completo', () => {
      const error = new CodigoAlternativoDuplicadoError('CE285A', 'HP');

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
      expect(error.message).toContain('CE285A');
      expect(error.message).toContain('HP');
    });

    /**
     * Con `fabricante` en `null` el par es el código GENÉRICO. Interpolar el
     * `null` produciría `del fabricante "null"`, que manda al administrador a
     * buscar un fabricante llamado "null" que no existe.
     */
    it('describe el código sin fabricante como genérico, sin imprimir "null"', () => {
      const error = new CodigoAlternativoDuplicadoError('CE285A', null);

      expect(error.code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
      expect(error.message).toContain('CE285A');
      expect(error.message).toContain('sin fabricante');
      expect(error.message).not.toContain('null');
    });
  });
});
