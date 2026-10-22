import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ACCIONES_KEY } from '../../auth/infrastructure/guards/decorators';

/**
 * Las acciones de `@RequiereAcciones` de cada ruta de un controller, por nombre de método; `[]` si
 * la ruta no declara ninguna. Recorre TODOS los métodos con ruta del prototipo, así que una ruta
 * nueva entra sola al test que lo usa (odd/permisos-por-tipo-ticket, D5 d).
 *
 * @param controller Clase del controller.
 * @returns Mapa nombre del método → acciones declaradas.
 */
export function accionesPorRuta(controller: { prototype: object }): Map<string, string[]> {
  const rutas = new Map<string, string[]>();
  for (const nombre of Object.getOwnPropertyNames(controller.prototype)) {
    const handler: unknown = Object.getOwnPropertyDescriptor(controller.prototype, nombre)?.value;
    if (typeof handler !== 'function' || nombre === 'constructor') continue;
    if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
    const acciones: unknown = Reflect.getMetadata(ACCIONES_KEY, handler);
    rutas.set(
      nombre,
      Array.isArray(acciones) ? acciones.filter((a): a is string => typeof a === 'string') : [],
    );
  }
  return rutas;
}
