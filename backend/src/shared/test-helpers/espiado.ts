/**
 * espiado — doble de un caso de uso concreto para specs de controllers.
 *
 * Devuelve una instancia real del prototipo de la clase con su método de
 * ejecución reemplazado por un `vi.fn` tipado contra la firma del caso de uso.
 * Al controller solo le interesa ese método, y al ser una instancia del
 * prototipo real sigue pasando los chequeos `instanceof` y la inyección de
 * Nest sin castear.
 *
 * Por qué existe: hasta el 2026-10-16 esta función vivía copiada en catorce
 * specs de controllers. Una copia por archivo no se desactualiza sola, pero sí
 * diverge: dos de ellas ya exportaban su propio alias `Espiado`.
 */
import { vi, type Mock } from 'vitest';

/** Caso de uso con `execute`, la convención de casi todo el repo. */
export type UseCaseConExecute = { execute: (...args: never[]) => unknown };

/** Caso de uso con `ejecutar`, la convención de recuperación de contraseña. */
export type UseCaseConEjecutar = { ejecutar: (...args: never[]) => unknown };

/** Lo que devuelve `espiado`: la instancia y el espía de su `execute`. */
export type Espiado<T extends UseCaseConExecute> = { caso: T; execute: Mock<T['execute']> };

/** Lo que devuelve `espiadoEjecutar`: la instancia y el espía de su `ejecutar`. */
export type EspiadoEjecutar<T extends UseCaseConEjecutar> = {
  caso: T;
  ejecutar: Mock<T['ejecutar']>;
};

/**
 * Instancia real del prototipo de `Clase` con `execute` espiado.
 * @param Clase clase del caso de uso (se usa solo su prototipo; no se construye)
 * @returns la instancia (`caso`) y el espía (`execute`)
 */
export function espiado<T extends UseCaseConExecute>(Clase: { prototype: T }): Espiado<T> {
  const execute = vi.fn<T['execute']>();
  const caso: T = Object.create(Clase.prototype, { execute: { value: execute } });
  return { caso, execute };
}

/**
 * Variante para casos de uso cuyo método se llama `ejecutar`.
 * @param Clase clase del caso de uso (se usa solo su prototipo; no se construye)
 * @returns la instancia (`caso`) y el espía (`ejecutar`)
 */
export function espiadoEjecutar<T extends UseCaseConEjecutar>(Clase: {
  prototype: T;
}): EspiadoEjecutar<T> {
  const ejecutar = vi.fn<T['ejecutar']>();
  const caso: T = Object.create(Clase.prototype, { ejecutar: { value: ejecutar } });
  return { caso, ejecutar };
}
