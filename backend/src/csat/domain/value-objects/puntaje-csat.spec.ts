/**
 * 4.3 TEST — Unit tests de PuntajeCsat (RED → GREEN).
 *
 * `Result<PuntajeCsat, PuntajeInvalidoError>`. Bordes cubiertos: 0 y 6 (fuera
 * de rango), 2.5 (no entero), '3' string (tipo incorrecto, defensivo ante un
 * caller que no pasó por el DTO), 1..5 (válidos).
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)" — "puntaje fuera de rango → 400, sin escritura". Tarea: 4.3.
 */
import { PuntajeCsat } from './puntaje-csat';

describe('PuntajeCsat.create()', () => {
  it.each([1, 2, 3, 4, 5])('acepta %i como puntaje válido', (valor) => {
    const result = PuntajeCsat.create(valor);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().valor).toBe(valor);
  });

  it('rechaza 0 (fuera de rango)', () => {
    const result = PuntajeCsat.create(0);
    expect(result.isFail()).toBe(true);
  });

  it('rechaza 6 (fuera de rango)', () => {
    const result = PuntajeCsat.create(6);
    expect(result.isFail()).toBe(true);
  });

  it('rechaza 2.5 (no entero)', () => {
    const result = PuntajeCsat.create(2.5);
    expect(result.isFail()).toBe(true);
  });

  it('rechaza "3" como string (tipo incorrecto)', () => {
    const result = PuntajeCsat.create('3' as unknown as number);
    expect(result.isFail()).toBe(true);
  });
});
