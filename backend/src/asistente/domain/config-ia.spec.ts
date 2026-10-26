import {
  ConfigIa,
  ESTADO_IA_SIN_CONFIGURAR,
  estadoConfigIa,
  LARGO_MAXIMO_URL_IA,
  URL_IA_POR_DEFECTO,
  validarUrlIa,
} from './config-ia';
import { UrlIaInvalidaError } from './asistente.errors';

describe('validarUrlIa', () => {
  it('acepta la URL de Gemini por defecto y la devuelve normalizada', () => {
    expect(validarUrlIa(URL_IA_POR_DEFECTO).getValue()).toBe(URL_IA_POR_DEFECTO);
    expect(validarUrlIa('  https://API.deepseek.com  ').getValue()).toBe(
      'https://api.deepseek.com/',
    );
  });

  it.each([
    ['vacía', '   '],
    ['no es URL', 'gemini'],
    ['http sin TLS', 'http://generativelanguage.googleapis.com/v1beta/openai/'],
    ['otro protocolo', 'ftp://ejemplo.com/'],
    ['credenciales embebidas', 'https://usuario:clave@ejemplo.com/'],
    ['más larga que la columna', `https://ejemplo.com/${'a'.repeat(LARGO_MAXIMO_URL_IA)}`],
  ])('rechaza una URL %s', (_caso, url) => {
    const r = validarUrlIa(url);
    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(UrlIaInvalidaError);
  });
});

describe('estadoConfigIa', () => {
  it('sin configuración devuelve el estado "sin configurar"', () => {
    expect(estadoConfigIa(null)).toEqual(ESTADO_IA_SIN_CONFIGURAR);
  });

  it('expone URL, modelo y verificación, y nunca la clave cifrada', () => {
    const config: ConfigIa = {
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      claveCifrada: 'v1:iv:tag:SECRETO',
      verificadoAt: new Date('2026-10-26T12:00:00Z'),
      verificacionError: null,
    };
    const estado = estadoConfigIa(config);
    expect(estado).toEqual({
      configurado: true,
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      verificadoAt: new Date('2026-10-26T12:00:00Z'),
      verificacionError: null,
    });
    expect(JSON.stringify(estado)).not.toContain('SECRETO');
  });
});
