/**
 * Validador de borde para el número de serie de una unidad (`seriales[]` de
 * entrada y ajuste, y todo DTO que acepte un serial).
 *
 * Mide el largo sobre AMBAS formas, igual que `UnidadInsumoEntity`: la recortada
 * (1 a `UNIDAD_SERIAL_MAX_LENGTH`) y la NORMALIZADA (`normalizarSerial`, que
 * puede ser más larga: `ß` pasa a `SS`). La entidad LANZA ante el desborde, y
 * sin este espejo el usuario vería un 500 en vez de un 400 que nombra el campo.
 *
 * Nunca lanza: lo que no es un string se reporta como error de validación.
 */
import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';
import {
  UNIDAD_SERIAL_MAX_LENGTH,
  normalizarSerial,
} from '../../domain/entities/unidad-insumo.entity';

/** Nombre de la restricción en `ValidationError.constraints`. */
export const ES_SERIAL_DE_UNIDAD = 'esSerialDeUnidad';

/**
 * Indica si el valor es un serial válido: un string ya recortado, no vacío, cuya
 * forma recortada y cuya forma normalizada caben en `UNIDAD_SERIAL_MAX_LENGTH`.
 *
 * @param valor Valor a medir, tal como llega después del `@Transform`.
 * @returns `true` si la entidad lo aceptaría sin lanzar.
 */
export function esSerialDeUnidad(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  const recortado = valor.trim();
  return (
    recortado.length >= 1 &&
    recortado.length <= UNIDAD_SERIAL_MAX_LENGTH &&
    normalizarSerial(recortado).length >= 1 &&
    normalizarSerial(recortado).length <= UNIDAD_SERIAL_MAX_LENGTH
  );
}

/**
 * Decorador de propiedad. Usalo con `{ each: true }` sobre un `string[]`.
 *
 * @param validationOptions Opciones estándar de `class-validator`.
 * @returns El decorador listo para aplicar sobre el campo del DTO.
 */
export function EsSerialDeUnidad(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: ES_SERIAL_DE_UNIDAD,
      constraints: [UNIDAD_SERIAL_MAX_LENGTH],
      validator: {
        validate: (valor: unknown): boolean => esSerialDeUnidad(valor),
        defaultMessage: buildMessage(
          (each) =>
            `${each}cada número de serie debe tener entre 1 y ${UNIDAD_SERIAL_MAX_LENGTH} caracteres, también una vez normalizado`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
