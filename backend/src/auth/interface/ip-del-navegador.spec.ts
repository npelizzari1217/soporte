import { ipDelNavegador } from './ip-del-navegador';

const req = (par: string | undefined, cabecera?: string | string[]) => ({
  headers: cabecera === undefined ? {} : { 'x-soporte-ip-navegador': cabecera },
  socket: { remoteAddress: par },
});

describe('ipDelNavegador (I4)', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'honra la cabecera desde el par loopback %s',
    (par) => {
      expect(ipDelNavegador(req(par, '198.51.100.7'))).toBe('198.51.100.7');
      expect(ipDelNavegador(req(par, '2001:db8::1'))).toBe('2001:db8::1');
    },
  );

  it('desde un par no loopback ignora la cabecera y usa el socket', () => {
    expect(ipDelNavegador(req('203.0.113.9', '198.51.100.7'))).toBe('203.0.113.9');
    expect(ipDelNavegador(req('::ffff:203.0.113.9', '198.51.100.7'))).toBe('203.0.113.9');
    expect(ipDelNavegador(req('2001:db8::5', '198.51.100.7'))).toBe('2001:db8::5');
  });

  it('desde loopback sin cabecera valida devuelve sin-ip', () => {
    expect(ipDelNavegador(req('127.0.0.1'))).toBe('sin-ip');
    expect(ipDelNavegador(req('127.0.0.1', 'no-es-ip'))).toBe('sin-ip');
    expect(ipDelNavegador(req('127.0.0.1', ['1.2.3.4']))).toBe('sin-ip');
  });

  it('la forma con puerto no es una IP valida', () => {
    expect(ipDelNavegador(req('127.0.0.1', '1.2.3.4:56789'))).toBe('sin-ip');
    expect(ipDelNavegador(req('::1', '[2001:db8::1]:56789'))).toBe('sin-ip');
  });

  it('sin direccion de socket devuelve sin-ip', () => {
    expect(ipDelNavegador(req(undefined, '1.2.3.4'))).toBe('sin-ip');
  });
});
