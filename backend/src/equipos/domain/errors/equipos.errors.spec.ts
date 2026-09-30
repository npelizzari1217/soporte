import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain/result';
import {
  SerialDeUnidadNoEditableError,
  UnidadDelComponenteNoDisponibleError,
} from './equipos.errors';

describe('Errores de dominio de equipos — unidades por número de serie', () => {
  it.each([
    [new SerialDeUnidadNoEditableError('comp-1'), 'SERIAL_DE_UNIDAD_NO_EDITABLE'],
    [new UnidadDelComponenteNoDisponibleError('comp-1'), 'UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE'],
  ])('%s expone su code estable y nombra el componente', (error, code) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
    expect(error.message).toContain('comp-1');
  });
});
