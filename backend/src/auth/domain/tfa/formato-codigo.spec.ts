import { clasificarCodigo, normalizarCodigoRecuperacion, normalizarEmail } from './formato-codigo';

describe('clasificarCodigo', () => {
  it.each([
    ['123456', 'totp'],
    [' 123456 ', 'totp'],
    ['ABCD-EFGH-JKMN', 'recuperacion'],
    ['abcd efgh jkmn', 'recuperacion'],
    ['12345', 'invalido'],
    ['1234567', 'invalido'],
    ['ABCD-EFGH', 'invalido'],
    ['', 'invalido'],
  ])('%j -> %s', (entrada, clase) => {
    expect(clasificarCodigo(entrada)).toBe(clase);
  });
});

describe('normalizarCodigoRecuperacion', () => {
  it('pasa a mayusculas y quita guiones y espacios', () => {
    expect(normalizarCodigoRecuperacion('abcd-efgh jkmn')).toBe('ABCDEFGHJKMN');
  });

  it('O -> 0 e I/L -> 1', () => {
    expect(normalizarCodigoRecuperacion('OOOO-iiii-llll')).toBe('000011111111');
  });

  it('rechaza largo erroneo y caracteres fuera del alfabeto', () => {
    expect(normalizarCodigoRecuperacion('ABCDEFGHJKM')).toBeNull();
    expect(normalizarCodigoRecuperacion('ABCDEFGHJKMNP')).toBeNull();
    expect(normalizarCodigoRecuperacion('ABCD-EFGH-JKM!')).toBeNull();
    expect(normalizarCodigoRecuperacion('ABCD-EFGH-JKMU')).toBeNull();
  });
});

describe('normalizarEmail', () => {
  it('recorta y pasa a minusculas', () => {
    expect(normalizarEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });
});
