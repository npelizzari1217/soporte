import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain/result';
import {
  CantidadNoEnteraError,
  MotivoRecuperacionRequeridoError,
  SeguimientoNoModificableError,
  SerialDuplicadoError,
  SerialesNoCoincidenError,
  SerialRequeridoError,
  UnidadNoAdmitidaError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
  UnidadRequeridaError,
} from './unidades-insumo.errors';

describe('Errores de dominio de las unidades por número de serie', () => {
  it.each([
    [new SerialDuplicadoError('SN-1'), 'SERIAL_DUPLICADO', 'SN-1'],
    [new UnidadNoDisponibleError('u-1', 'está entregada'), 'UNIDAD_NO_DISPONIBLE', 'u-1'],
    [new UnidadRequeridaError('i-1'), 'UNIDAD_REQUERIDA', 'i-1'],
    [new UnidadNoAdmitidaError('i-2'), 'UNIDAD_NO_ADMITIDA', 'i-2'],
    [new SerialesNoCoincidenError(3, 2), 'SERIALES_NO_COINCIDEN', '3'],
    [new SerialRequeridoError('falta'), 'SERIAL_REQUERIDO', 'falta'],
    [new CantidadNoEnteraError(1.5), 'CANTIDAD_NO_ENTERA', '1.5'],
    [new SeguimientoNoModificableError('saldo 4'), 'SEGUIMIENTO_NO_MODIFICABLE', 'saldo 4'],
    [new MotivoRecuperacionRequeridoError('u-9'), 'MOTIVO_RECUPERACION_REQUERIDO', 'u-9'],
    [new UnidadNoEncontradaError('u-7'), 'UNIDAD_NO_ENCONTRADA', 'u-7'],
  ])('%s expone su code estable y nombra el dato', (error, code, dato) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
    expect(error.message).toContain(dato);
  });

  it('SerialesNoCoincidenError nombra esperados y recibidos', () => {
    const error = new SerialesNoCoincidenError(3, 2);

    expect(error.message).toContain('3');
    expect(error.message).toContain('2');
  });

  it('UnidadNoDisponibleError incluye el motivo', () => {
    expect(new UnidadNoDisponibleError('u-1', 'está entregada').message).toContain(
      'está entregada',
    );
  });

  it('SerialDuplicadoError aclara que abarca todos los estados, incluso descartado', () => {
    expect(new SerialDuplicadoError('X').message).toContain('descartado');
  });
});
