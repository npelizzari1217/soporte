import { describe, expect, it } from 'vitest';
import { normalizarSerial } from './unidad-insumo.entity';

describe('normalizarSerial', () => {
  it('pasa a mayúsculas', () => {
    expect(normalizarSerial('abc123')).toBe('ABC123');
  });

  it('quita los espacios de los bordes y los internos, de cualquier tipo', () => {
    expect(normalizarSerial('  ab c\t12\n3  ')).toBe('ABC123');
  });

  it('dos cargas que solo difieren en capitalización y espacios coinciden', () => {
    expect(normalizarSerial('sn 001')).toBe(normalizarSerial(' SN001 '));
  });

  it.each(['', '   ', '\t\n'])('un serial vacío o solo de espacios (%j) queda vacío', (serial) => {
    expect(normalizarSerial(serial)).toBe('');
  });

  it('ß pasa a SS, como toUpperCase de JS (la base no normaliza)', () => {
    expect(normalizarSerial('straße')).toBe('STRASSE');
  });

  it('conserva guiones y otros símbolos', () => {
    expect(normalizarSerial('ab-12/x')).toBe('AB-12/X');
  });
});
