import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  contarDecimales,
  ES_NUMERO_CON_DECIMALES,
  EsNumeroConDecimales,
} from './es-numero-con-decimales';

/**
 * Clase de prueba con el tope en 2, que es el que usan las columnas
 * `DECIMAL(10,2)` de este repo. El decorador se ejerce a través de `validate()`
 * y no llamando a la función interna: lo que hay que probar es que el borde
 * REPORTA el error en vez de lanzarlo, y eso solo se ve atravesando el
 * ejecutor de `class-validator`.
 */
class ConDosDecimales {
  @EsNumeroConDecimales(2)
  cantidad!: number;
}

/**
 * Devuelve las restricciones que fallaron. Assertar la clave exacta y no un
 * `length > 0` es lo que distingue "lo rechazó esta regla" de "algo falló":
 * en los DTOs reales el mismo campo lleva además `@Min`, `@Max` e
 * `@IsPositive`.
 */
async function restriccionesDe(valor: unknown): Promise<string[]> {
  const dto = plainToInstance(ConDosDecimales, { cantidad: valor });
  const errores = await validate(dto);
  return errores.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('contarDecimales', () => {
  /**
   * La tabla completa de la notación exponencial. `1e-7` es el caso que
   * `class-validator@0.15.1` no cuenta sino que revienta: su `toString()` no
   * tiene punto, así que su `split('.')[1]` es `undefined`.
   */
  it.each([
    [1e-7, 7],
    [-1e-7, 7],
    [1.5e-8, 9],
    [0.01, 2],
    [1e21, 0],
    [1.5, 1],
    [0.001, 3],
    [2, 0],
    [0, 0],
  ])('cuenta los decimales de %p como %i', (valor, esperado) => {
    expect(contarDecimales(valor)).toBe(esperado);
  });
});

describe('EsNumeroConDecimales', () => {
  /**
   * El caso que motiva todo el validador. Con `@IsNumber({ maxDecimalPlaces })`
   * esta misma entrada lanzaba un `TypeError` desde adentro del
   * `ValidationPipe`, que sale como 500 en vez del 400 que el DTO promete.
   *
   * `1e-7` y `1E-7` son EL MISMO número en JavaScript: la mayúscula no
   * sobrevive al parseo del literal, así que probar las dos formas acá sería
   * probar dos veces lo mismo. Donde la mayúscula sí es una entrada distinta es
   * en el TEXTO del JSON que viaja por HTTP, y ahí se prueba:
   * `movimientos-insumo.e2e.spec.ts`.
   */
  it('rechaza 1e-7 sin lanzar: son 7 decimales escritos en exponencial', async () => {
    await expect(restriccionesDe(1e-7)).resolves.toContain(ES_NUMERO_CON_DECIMALES);
  });

  it('rechaza -1e-7 sin lanzar: el signo no cambia la cuenta', async () => {
    await expect(restriccionesDe(-1e-7)).resolves.toContain(ES_NUMERO_CON_DECIMALES);
  });

  it('rechaza 1.5e-8: la mantisa aporta su decimal además del exponente', async () => {
    await expect(restriccionesDe(1.5e-8)).resolves.toContain(ES_NUMERO_CON_DECIMALES);
  });

  it('rechaza 0.001, el caso normal sin exponente', async () => {
    await expect(restriccionesDe(0.001)).resolves.toContain(ES_NUMERO_CON_DECIMALES);
  });

  /**
   * Los hermanos invertidos: sin ellos, un validador que rechaza TODO pasaría
   * los casos de arriba.
   */
  it('acepta 0.01: son exactamente los decimales del tope', async () => {
    await expect(restriccionesDe(0.01)).resolves.toHaveLength(0);
  });

  it('acepta 1.5, por debajo del tope', async () => {
    await expect(restriccionesDe(1.5)).resolves.toHaveLength(0);
  });

  /**
   * La notación exponencial por sí sola NO invalida: `1e21` es un entero y
   * `toString()` lo escribe como `1e+21` solo porque JavaScript cambia de
   * formato a partir de 1e21.
   */
  it('acepta 1e21: es entero, aunque su toString sea exponencial', async () => {
    await expect(restriccionesDe(1e21)).resolves.toHaveLength(0);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['un string', '0.01'],
    ['null', null],
    ['undefined', undefined],
  ])('rechaza %s', async (_descripcion, valor) => {
    await expect(restriccionesDe(valor)).resolves.toContain(ES_NUMERO_CON_DECIMALES);
  });

  it('nombra el campo y el tope en el mensaje, en español', async () => {
    const dto = plainToInstance(ConDosDecimales, { cantidad: 1e-7 });

    const errores = await validate(dto);

    expect(errores[0].constraints?.[ES_NUMERO_CON_DECIMALES]).toBe(
      'cantidad debe ser un número con 2 decimales como máximo',
    );
  });
});
