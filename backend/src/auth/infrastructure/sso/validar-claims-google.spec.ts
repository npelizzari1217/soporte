import { SsoRechazadoError } from '../../domain/errors/sso.errors';
import { validarClaimsGoogle } from './validar-claims-google';

const EMISORES = ['https://accounts.google.com', 'accounts.google.com'];
const NONCE = 'nonce-guardado';

function claims(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    sub: '1234567890',
    nonce: NONCE,
    email: 'ana@empresa.com',
    email_verified: true,
    ...sobrescribir,
  };
}

function motivoDe(datos: Record<string, unknown>): string | undefined {
  try {
    validarClaimsGoogle(datos, NONCE, EMISORES);
  } catch (error) {
    if (error instanceof SsoRechazadoError) return error.motivo;
    throw error;
  }
  return undefined;
}

describe('validarClaimsGoogle', () => {
  it('devuelve sub y email cuando todo es valido', () => {
    expect(validarClaimsGoogle(claims(), NONCE, EMISORES)).toEqual({
      subject: '1234567890',
      email: 'ana@empresa.com',
    });
  });

  it('acepta los dos emisores y rechaza cualquier otro', () => {
    expect(motivoDe(claims({ iss: 'accounts.google.com' }))).toBeUndefined();
    expect(motivoDe(claims({ iss: 'https://evil.example' }))).toBe('TOKEN_INVALIDO');
    expect(motivoDe(claims({ iss: undefined }))).toBe('TOKEN_INVALIDO');
  });

  it('rechaza un nonce distinto o ausente', () => {
    expect(motivoDe(claims({ nonce: 'otro' }))).toBe('TOKEN_INVALIDO');
    expect(motivoDe(claims({ nonce: undefined }))).toBe('TOKEN_INVALIDO');
  });

  it.each([
    ['ausente', undefined],
    ['false', false],
    ['la cadena "true"', 'true'],
    ['1', 1],
  ])('rechaza email_verified %s', (_caso, valor) => {
    expect(motivoDe(claims({ email_verified: valor }))).toBe('EMAIL_NO_VERIFICADO');
  });

  it.each([
    ['ausente', undefined],
    ['no string', 42],
    ['vacio', ''],
  ])('rechaza un email %s', (_caso, valor) => {
    expect(motivoDe(claims({ email: valor }))).toBe('EMAIL_NO_VERIFICADO');
  });

  it.each([
    ['vacio', ''],
    ['solo espacios', '  '],
    ['ausente', undefined],
    ['no string', 7],
  ])('rechaza un sub %s', (_caso, valor) => {
    expect(motivoDe(claims({ sub: valor }))).toBe('TOKEN_INVALIDO');
  });

  it('acepta un token con hd y no lo filtra', () => {
    expect(validarClaimsGoogle(claims({ hd: 'empresa.com' }), NONCE, EMISORES).email).toBe(
      'ana@empresa.com',
    );
  });
});
