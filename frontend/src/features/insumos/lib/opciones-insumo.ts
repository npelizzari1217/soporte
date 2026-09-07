/**
 * opciones-insumo — arma las opciones de un `<select>` de insumos a partir del
 * catálogo, y nombra la etiqueta del insumo que ya no está en él.
 *
 * Vive acá y no dentro de cada formulario porque los dos diálogos del ítem de
 * compra la necesitan igual, y una regla de presentación duplicada se corrige en
 * una copia y queda atrás en la otra EN SILENCIO — las fallas de esta clase no
 * tiran error ni log: la pantalla muestra una cosa y se guarda otra.
 */
import type { OpcionCatalogo } from "@/shared/lib/opciones-catalogo";
import type { Insumo } from "../types";

/**
 * Etiqueta de la opción sintética del insumo que el catálogo YA NO trae.
 *
 * Es un caso distinto del deshabilitado, y por eso el texto es distinto: el
 * deshabilitado sigue viniendo en `GET /insumos` y se puede volver a elegir;
 * este tiene baja lógica, no vuelve nunca y el backend lo rechaza con un 422 si
 * se lo intenta asignar a otro ítem.
 */
export const ETIQUETA_INSUMO_FUERA_DE_CATALOGO = "Insumo eliminado del catálogo";

/**
 * Convierte el catálogo en opciones de `<select>`, conservando el orden en que
 * vino (el backend lo ordena por código).
 *
 * El insumo DESHABILITADO no se filtra: el backend acepta que un ítem lo
 * declare, así que sacarlo dejaría al `<select>` sin la opción de un valor
 * guardado y el navegador caería en otra. Se lo marca en la etiqueta para que
 * quien elige sepa que ese insumo ya no se compra más.
 *
 * @param insumos Catálogo tal como lo devuelve `GET /insumos`.
 * @returns Una opción por insumo, etiquetada "código — nombre".
 */
export function opcionesDeInsumo(insumos: Insumo[]): OpcionCatalogo[] {
  return insumos.map((insumo) => ({
    id: insumo.id,
    nombre: `${insumo.codigo} — ${insumo.nombre}${insumo.activo ? "" : " (deshabilitado)"}`,
  }));
}
