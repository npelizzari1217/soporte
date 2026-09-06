import { describe, expect, it } from 'vitest';
import { enCentesimas } from './centesimas';

/**
 * Los dos casos que justifican que esta función exista son los de la trampa
 * del float, y van con su comparación directa al lado: sin ese contraste, el
 * test parece verificar una multiplicación por cien.
 *
 * Vive acá y no en `compras` porque la función está por tener un segundo
 * dueño —compras decide plata, insumos va a decidir si una salida de stock se
 * autoriza— y una regla compartida necesita su prueba en el lugar compartido,
 * no dentro de uno de los consumidores. El spec se MUEVE con la función: si
 * quedara una copia en `estado-compra.spec.ts`, el día que cambie el caso del
 * undershoot una de las dos suites se actualiza y la otra consagra en silencio
 * la conducta vieja.
 */
describe('enCentesimas — ADR-C3', () => {
  it.each([
    [0, 0],
    [0.3, 30],
    [1, 100],
    [150000.5, 15000050],
  ])('convierte %s a %s centésimas', (valor, esperado) => {
    expect(enCentesimas(valor)).toBe(esperado);
  });

  /**
   * OVERSHOOT: `0.1 + 0.2` da `0.30000000000000004`. La comparación directa
   * contra `0.3` falla, la escala entera no.
   */
  it('la trampa del float: 0.1 + 0.2 iguala a 0.3 en centésimas, no en directo', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(enCentesimas(0.1 + 0.2)).toBe(enCentesimas(0.3));
  });

  /**
   * UNDERSHOOT: `0.7 - 0.6` da `0.09999999999999998`, que es MENOR que `0.1`.
   * Es el caso que produce el falso negativo en un `>=` y el que decide, en
   * insumos, si una salida en el límite exacto se rechaza por nada.
   */
  it('la trampa inversa: 0.7 - 0.6 iguala a 0.1 en centésimas pese a ser menor en directo', () => {
    expect(0.7 - 0.6).toBeLessThan(0.1);
    expect(enCentesimas(0.7 - 0.6)).toBe(enCentesimas(0.1));
  });

  /**
   * `Math.round` y no `Math.floor`: es el mismo caso de undershoot de arriba,
   * mirado desde el otro lado. `(0.7 - 0.6) * 100` da `9.999999999999998`, así
   * que truncar devolvería 9 —una centésima menos, de la nada— y el sesgo
   * sería sistemático hacia abajo en cada operación.
   *
   * El valor de prueba NO se elige a mano: un `0.145` cualquiera parece obvio
   * y no lo es —`0.145 * 100` es `14.499999999999998`, así que redondea a 14 y
   * el test afirmaría lo contrario de lo que pasa—. Se usa una expresión cuyo
   * artefacto de punto flotante es justamente el que la función existe para
   * absorber.
   */
  it('redondea y no trunca: truncar perdería una centésima en el undershoot', () => {
    const conArtefacto = (0.7 - 0.6) * 100;

    expect(Math.floor(conArtefacto)).toBe(9);
    expect(enCentesimas(0.7 - 0.6)).toBe(10);
  });
});
