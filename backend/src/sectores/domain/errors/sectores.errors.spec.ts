import { describe, expect, it } from 'vitest';
import { SectorNoEncontradoError, SectorCodigoDuplicadoError } from './sectores.errors';

describe('Errores de dominio de sectores (WU-04)', () => {
  it('SectorNoEncontradoError expone code SECTOR_NO_ENCONTRADO', () => {
    const error = new SectorNoEncontradoError('id-x');
    expect(error.code).toBe('SECTOR_NO_ENCONTRADO');
    expect(error.message).toContain('id-x');
  });

  it('SectorCodigoDuplicadoError expone code SECTOR_CODIGO_DUPLICADO', () => {
    const error = new SectorCodigoDuplicadoError('COMPUTACION');
    expect(error.code).toBe('SECTOR_CODIGO_DUPLICADO');
    expect(error.message).toContain('COMPUTACION');
  });
});
