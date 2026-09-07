/**
 * Validador de borde para los campos numéricos con escala acotada — los que se
 * persisten en una columna `DECIMAL(p, s)` y no pueden traer más decimales de
 * los que esa columna guarda.
 *
 * **Por qué existe en vez de usar `@IsNumber({ maxDecimalPlaces })`.** Ese
 * decorador cuenta los decimales partiendo el número por el punto:
 * `valor.toString().split('.')[1].length`. La cuenta supone que un número no
 * entero siempre se escribe con un punto, y esa suposición no es cierta.
 *
 * `Number.prototype.toString()` cambia a notación exponencial en dos zonas:
 * cuando el valor absoluto es menor que `1e-6` y cuando llega a `1e21`. Ahí el
 * texto puede no tener punto —`(1e-7).toString()` es `'1e-7'`—, así que
 * `split('.')[1]` queda `undefined` y leerle `.length` LANZA un `TypeError`.
 * Ese `throw` no es un error de validación: escapa del `ValidationPipe` y sale
 * al cliente como un 500, justo donde el DTO promete un 400 que nombra el
 * campo. Y es alcanzable desde cualquier cliente, porque `{"cantidad":1e-7}`
 * es JSON válido.
 *
 * **Por qué la cuenta correcta resta el exponente.** La notación exponencial
 * escribe el mismo número con la coma corrida: `1.5e-8` es `0.000000015`, o
 * sea los decimales que la mantisa ya trae MÁS los lugares que el exponente
 * negativo corre hacia la derecha. Un exponente positivo corre para el otro
 * lado y cancela decimales, hasta un piso de cero — de ahí el `Math.max`.
 *
 * El resto del contrato replica lo que `@IsNumber` ya hacía bien: rechaza lo
 * que no es `number`, y rechaza `NaN`, `Infinity` y `-Infinity`, que no caen en
 * ninguna comparación de rango y por lo tanto se colarían por `@Min`/`@Max`.
 * `@IsNumber` los admitía solo con `allowNaN`/`allowInfinity`, y ninguno de los
 * usos de este repo los pasaba.
 */
import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * Nombre de la restricción, tal como aparece en `ValidationError.constraints`.
 * Se exporta para que los tests puedan assertar CUÁL regla rechazó: en los DTOs
 * reales el mismo campo lleva además `@Min`, `@Max` o `@IsPositive`, y un
 * assert de "hubo algún error" queda verde por la regla equivocada.
 */
export const ES_NUMERO_CON_DECIMALES = 'esNumeroConDecimales';

/**
 * Cuenta los decimales de un número, incluidos los que `toString()` escribe en
 * notación exponencial.
 *
 * @param valor Número a medir. Se asume finito; `NaN` e `Infinity` los descarta
 *   el validador antes de llamar acá.
 * @returns La cantidad de decimales, nunca negativa.
 */
export function contarDecimales(valor: number): number {
  const [mantisa, exponente] = valor.toString().split('e');
  const decimalesDeMantisa = mantisa.split('.')[1]?.length ?? 0;

  if (exponente === undefined) {
    return decimalesDeMantisa;
  }

  return Math.max(0, decimalesDeMantisa - Number(exponente));
}

/**
 * Exige que el valor sea un número finito con, a lo sumo, `maxDecimales`
 * decimales. **Nunca lanza**: una entrada que no cumple se reporta como error
 * de validación, que es lo que el `ValidationPipe` traduce a un 400.
 *
 * @param maxDecimales Tope de decimales, normalmente la escala de la columna
 *   que va a guardar el valor. Se importa de la entidad de dominio donde el
 *   dominio ya lo declara, en vez de repetirlo como literal.
 * @param validationOptions Opciones estándar de `class-validator` (`each`,
 *   `groups`, `message`).
 * @returns El decorador de propiedad, listo para aplicar sobre el campo del DTO.
 */
export function EsNumeroConDecimales(
  maxDecimales: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: ES_NUMERO_CON_DECIMALES,
      // El tope viaja también acá, además de estar en el cierre, porque es lo
      // que `class-validator` interpola en `$constraint1` al armar el mensaje.
      constraints: [maxDecimales],
      validator: {
        validate: (value: unknown): boolean => {
          // `Number.isFinite` cubre las tres entradas que no caen en ninguna
          // comparación de rango y por lo tanto se colarían por `@Min`/`@Max`:
          // `NaN`, `Infinity` y `-Infinity`.
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
          }
          return contarDecimales(value) <= maxDecimales;
        },
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property debe ser un número con $constraint1 decimales como máximo`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
