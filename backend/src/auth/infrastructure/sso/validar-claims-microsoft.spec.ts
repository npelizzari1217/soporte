import { SsoRechazadoError } from '../../domain/errors/sso.errors';
import { validarClaimsMicrosoft } from './validar-claims-microsoft';

const PLANTILLA = 'https://login.microsoftonline.com/{tid}/v2.0';
const NONCE = 'nonce-guardado';
const TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const OID = '00000000-0000-0000-66f3-3332eca7ea81';

function claims(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `https://login.microsoftonline.com/${TID}/v2.0`,
    tid: TID,
    oid: OID,
    ver: '2.0',
    nonce: NONCE,
    email: 'ana@empresa.com',
    xms_edov: true,
    ...sobrescribir,
  };
}

function motivoDe(datos: Record<string, unknown>): string | undefined {
  try {
    validarClaimsMicrosoft(datos, NONCE, PLANTILLA);
  } catch (error) {
    if (error instanceof SsoRechazadoError) return error.motivo;
    throw error;
  }
  return undefined;
}

describe('validarClaimsMicrosoft', () => {
  it('devuelve <tid>:<oid> y el email cuando todo es valido', () => {
    expect(validarClaimsMicrosoft(claims(), NONCE, PLANTILLA)).toEqual({
      subject: `${TID}:${OID}`,
      email: 'ana@empresa.com',
    });
  });

  it('rechaza un iss distinto de la plantilla armada con el tid del token', () => {
    expect(motivoDe(claims({ iss: 'https://login.microsoftonline.com/otro-tenant/v2.0' }))).toBe(
      'TOKEN_INVALIDO',
    );
    expect(motivoDe(claims({ iss: 'https://login.microsoftonline.com/common/v2.0' }))).toBe(
      'TOKEN_INVALIDO',
    );
    expect(motivoDe(claims({ iss: undefined }))).toBe('TOKEN_INVALIDO');
  });

  it.each([
    ['ausente', undefined],
    ['numerico', 123],
    ['vacio', ''],
  ])('rechaza un tid %s', (_caso, valor) => {
    expect(motivoDe(claims({ tid: valor }))).toBe('TOKEN_INVALIDO');
  });

  it.each([
    ['ausente', undefined],
    ['vacio', ''],
    ['no string', 5],
  ])('rechaza un oid %s', (_caso, valor) => {
    expect(motivoDe(claims({ oid: valor }))).toBe('TOKEN_INVALIDO');
  });

  it.each([['1.0'], [undefined], [2]])('rechaza ver %s', (valor) => {
    expect(motivoDe(claims({ ver: valor }))).toBe('TOKEN_INVALIDO');
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
  ])('rechaza xms_edov %s', (_caso, valor) => {
    expect(motivoDe(claims({ xms_edov: valor }))).toBe('EMAIL_NO_VERIFICADO');
  });

  it('sin email rechaza aunque haya preferred_username, upn o unique_name', () => {
    const sinEmail = claims({
      email: undefined,
      preferred_username: 'ana@empresa.com',
      upn: 'ana@empresa.com',
      unique_name: 'ana@empresa.com',
    });
    expect(motivoDe(sinEmail)).toBe('EMAIL_NO_VERIFICADO');
  });

  it('un email que no es string se rechaza', () => {
    expect(motivoDe(claims({ email: ['ana@empresa.com'] }))).toBe('EMAIL_NO_VERIFICADO');
  });
});
