import { TotpNativoService } from './totp-nativo.service';

// Secreto del RFC 6238 apendice B ("12345678901234567890") en base32.
const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const en = (segundos: number) => new Date(segundos * 1000);

describe('TotpNativoService', () => {
  const totp = new TotpNativoService();

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('vector SHA-1 del RFC 6238 T=%i -> %s', (t, codigo) => {
    expect(totp.verificar(SECRETO_RFC, codigo, en(t))).toBe(Math.floor(t / 30));
  });

  it('ventana +-1 acepta el paso anterior y el siguiente y devuelve el paso aceptado', () => {
    const t = 1111111109;
    const paso = Math.floor(t / 30);
    expect(totp.verificar(SECRETO_RFC, '081804', en(t + 30))).toBe(paso);
    expect(totp.verificar(SECRETO_RFC, '081804', en(t - 30))).toBe(paso);
  });

  it('ventana +-2 rechaza', () => {
    const t = 1111111109;
    expect(totp.verificar(SECRETO_RFC, '081804', en(t + 60))).toBeNull();
    expect(totp.verificar(SECRETO_RFC, '081804', en(t - 60))).toBeNull();
  });

  it.each(['', '12345', '1234567', 'abcdef', '08180 ', '０８１８０４'])(
    'codigo mal formado %j -> null',
    (codigo) => {
      expect(totp.verificar(SECRETO_RFC, codigo, en(1111111109))).toBeNull();
    },
  );

  it('secreto invalido -> null', () => {
    expect(totp.verificar('no-es-base32!', '081804', en(1111111109))).toBeNull();
  });

  it('generarSecreto: 20 bytes en base32 sin padding, distinto cada vez', () => {
    const a = totp.generarSecreto();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(totp.generarSecreto()).not.toBe(a);
  });

  it('uri lleva issuer, algoritmo, digitos y periodo', () => {
    expect(totp.uri('ABC234', 'ana@example.com')).toBe(
      'otpauth://totp/Soporte:ana%40example.com?secret=ABC234&issuer=Soporte&algorithm=SHA1&digits=6&period=30',
    );
  });
});
