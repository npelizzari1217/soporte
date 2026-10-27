import {
  ConfigIa,
  ESTADO_IA_SIN_CONFIGURAR,
  estadoConfigIa,
  LARGO_MAXIMO_URL_IA,
  MODELO_IA_POR_DEFECTO,
  URL_IA_POR_DEFECTO,
  validarUrlIa,
} from './config-ia';
import {
  ClaveIaInvalidaError,
  ModeloIaInvalidoError,
  UrlIaInvalidaError,
} from './asistente.errors';
import {
  LARGO_MAXIMO_CLAVE_IA,
  LARGO_MAXIMO_MODELO_IA,
  validarClaveIa,
  validarModeloIa,
} from './config-ia';

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

describe('validarModeloIa', () => {
  it('recorta y acepta hasta el largo de la columna', () => {
    expect(validarModeloIa('  gemini-2.5-flash  ').getValue()).toBe('gemini-2.5-flash');
    expect(validarModeloIa('m'.repeat(LARGO_MAXIMO_MODELO_IA)).isOk()).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['más largo que la columna', 'm'.repeat(LARGO_MAXIMO_MODELO_IA + 1)],
  ])('rechaza un modelo %s', (_caso, modelo) => {
    expect(validarModeloIa(modelo).getError()).toBeInstanceOf(ModeloIaInvalidoError);
  });
});

describe('validarClaveIa', () => {
  it('recorta y acepta hasta el tope', () => {
    expect(validarClaveIa(' AIzaClave ').getValue()).toBe('AIzaClave');
    expect(validarClaveIa('k'.repeat(LARGO_MAXIMO_CLAVE_IA)).isOk()).toBe(true);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['más larga que el tope', 'k'.repeat(LARGO_MAXIMO_CLAVE_IA + 1)],
  ])('rechaza una clave %s', (_caso, clave) => {
    expect(validarClaveIa(clave).getError()).toBeInstanceOf(ClaveIaInvalidaError);
  });
});

describe('MODELO_IA_POR_DEFECTO', () => {
  // Google retiró `gemini-2.5-flash-lite` para cuentas nuevas (404, 2026-10-27); se propone la
  // generación vigente para no ofrecer un modelo en vías de retiro.
  it('propone la generación vigente de Gemini', () => {
    expect(MODELO_IA_POR_DEFECTO).toBe('gemini-3.5-flash');
  });
});
