import { ConsultaAsistenteInvalidaError } from './asistente.errors';
import { LARGO_MAXIMO_CONSULTA, validarConsulta } from './consulta-asistente';

describe('validarConsulta', () => {
  it('recorta y acepta hasta el tope', () => {
    expect(validarConsulta('  ¿Cómo creo un ticket?  ').getValue()).toBe('¿Cómo creo un ticket?');
    expect(validarConsulta('a'.repeat(LARGO_MAXIMO_CONSULTA)).isOk()).toBe(true);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['más larga que el tope', 'a'.repeat(LARGO_MAXIMO_CONSULTA + 1)],
  ])('rechaza una consulta %s', (_caso, consulta) => {
    expect(validarConsulta(consulta).getError()).toBeInstanceOf(ConsultaAsistenteInvalidaError);
  });
});
