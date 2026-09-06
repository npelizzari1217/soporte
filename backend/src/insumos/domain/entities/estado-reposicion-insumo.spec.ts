import { describe, expect, it } from 'vitest';
import { ESTADOS_REPOSICION_INSUMO, evaluarReposicion } from './estado-reposicion-insumo';

describe('evaluarReposicion', () => {
  /**
   * El catálogo tiene TRES estados y no dos. El assert lo fija acá porque el
   * tipo se borra al compilar: si alguien colapsara el indicador a un booleano
   * —o sacara `SIN_PUNTO_DEFINIDO`—, el resto de los casos de este archivo
   * seguirían pasando sobre los dos que quedan.
   */
  it('declara exactamente los tres estados del catálogo', () => {
    expect([...ESTADOS_REPOSICION_INSUMO].sort()).toEqual([
      'BAJO_MINIMO',
      'SIN_PUNTO_DEFINIDO',
      'SUFICIENTE',
    ]);
  });

  describe('sin punto de reposición definido', () => {
    /**
     * `stockMinimo` en `null` significa "este insumo no tiene punto de
     * reposición definido", que NO es lo mismo que cero — lo dice el JSDoc de
     * `InsumoProps.stockMinimo`. El estado tiene nombre propio y no se resuelve
     * como "suficiente": si se resolviera así, la ficha de un insumo que nadie
     * configuró se vería igual que la de uno que está bien abastecido, y el
     * administrador nunca se enteraría de cuáles le falta configurar.
     */
    it('devuelve SIN_PUNTO_DEFINIDO con el depósito vacío', () => {
      expect(evaluarReposicion(0, null)).toBe('SIN_PUNTO_DEFINIDO');
    });

    it('devuelve SIN_PUNTO_DEFINIDO también con existencia de sobra', () => {
      expect(evaluarReposicion(500, null)).toBe('SIN_PUNTO_DEFINIDO');
    });

    /**
     * El caso que hace visible la trampa: sin un tercer estado, los dos
     * escenarios de arriba —el depósito vacío y el depósito lleno, los dos sin
     * punto definido— serían indistinguibles entre sí y de un insumo con punto
     * y por encima de él. Este assert prueba que los tres son tres valores
     * distintos.
     */
    it('no se confunde con ninguno de los dos estados que sí evalúan un punto', () => {
      const sinPunto = evaluarReposicion(0, null);

      expect(sinPunto).not.toBe(evaluarReposicion(0, 10));
      expect(sinPunto).not.toBe(evaluarReposicion(50, 10));
    });
  });

  describe('con punto de reposición definido', () => {
    /**
     * EL límite exacto, y la decisión de esta unidad: `stockMinimo` es el
     * PUNTO DE REPOSICIÓN, o sea el nivel al que hay que reponer. Se avisa AL
     * LLEGAR (`stock <= stockMinimo`), no después de perforarlo: con `<`, el
     * aviso llega cuando el stock ya está por debajo del piso que el usuario
     * pidió no perforar, o sea siempre tarde.
     */
    it('avisa AL LLEGAR al punto: el stock exactamente igual al mínimo ya es BAJO_MINIMO', () => {
      expect(evaluarReposicion(10, 10)).toBe('BAJO_MINIMO');
    });

    /** Hermano invertido del límite: una centésima por encima todavía alcanza. */
    it('una centésima por encima del punto todavía es SUFICIENTE', () => {
      expect(evaluarReposicion(10.01, 10)).toBe('SUFICIENTE');
    });

    it('por debajo del punto es BAJO_MINIMO', () => {
      expect(evaluarReposicion(9.99, 10)).toBe('BAJO_MINIMO');
    });

    /**
     * El caso que decide entre `<` y `<=` sin margen de opinión. Cero es un
     * punto de reposición legal —`INSUMO_STOCK_MINIMO_MINIMO` es 0 y el CHECK
     * de la columna lo admite— y significa "avisar cuando se acabe". Con `<`,
     * `0 < 0` es falso y el aviso NUNCA llegaría: el registro de salidas
     * impide que el saldo baje de cero, así que `stock < 0` es inalcanzable
     * por el camino normal y ese punto de reposición quedaría muerto.
     */
    it('con punto en cero, el depósito vacío es BAJO_MINIMO', () => {
      expect(evaluarReposicion(0, 0)).toBe('BAJO_MINIMO');
    });

    /** Hermano invertido del anterior: con punto en cero, algo en el depósito alcanza. */
    it('con punto en cero, una centésima en el depósito es SUFICIENTE', () => {
      expect(evaluarReposicion(0.01, 0)).toBe('SUFICIENTE');
    });

    /**
     * La comparación va en centésimas ENTERAS y no en punto flotante directo.
     * `0.1 + 0.2` da `0.30000000000000004` en IEEE-754, así que un saldo que
     * vale exactamente lo mismo que el punto de reposición daría `SUFICIENTE`
     * al compararse crudo — el aviso se perdería por un error de
     * representación, no por una regla. Mismo motivo por el que `calcularStock`
     * usa `enCentesimas`.
     */
    it('trata como iguales dos valores que solo difieren por el error del punto flotante', () => {
      const stockConRuido = 0.1 + 0.2;

      expect(stockConRuido).not.toBe(0.3);
      expect(evaluarReposicion(stockConRuido, 0.3)).toBe('BAJO_MINIMO');
    });

    /**
     * Un saldo negativo solo puede venir de una escritura que no pasó por la
     * sección crítica (decisión 1 del diseño, límite dicho y no escondido).
     * Cuando aparece, el indicador tiene que gritarlo, no esconderlo.
     */
    it('un saldo negativo es BAJO_MINIMO', () => {
      expect(evaluarReposicion(-5, 10)).toBe('BAJO_MINIMO');
    });
  });
});
