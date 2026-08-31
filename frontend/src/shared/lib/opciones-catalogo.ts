/**
 * opciones-catalogo — armado de las opciones de un `<select>` cuyo catálogo
 * excluye lo dado de baja.
 *
 * Cierra una de las clases de defecto documentadas del proyecto: "select con
 * valor fuera de catálogo". Vivía duplicada en `ticket-edit-form.tsx` y en
 * `plan-preventivo-edit-dialog.tsx`; se unifica acá por el mismo criterio que
 * `mensaje-tope.ts` — con dos copias, la próxima corrección del criterio se
 * aplica en una sola y la otra queda atrás EN SILENCIO, porque las fallas de
 * esta clase no tiran error ni log: la pantalla muestra una cosa y se guarda
 * otra.
 */

/** Opción de un `<select>`: lo mínimo que necesita para renderizarse. */
export interface OpcionCatalogo {
  id: string;
  nombre: string;
}

/**
 * Agrega la `<option>` del valor vigente cuando el catálogo ya resolvió y no lo
 * trae — el caso "dado de baja después de que se guardó el registro".
 *
 * Sin esa opción el `<select>` NATIVO no encuentra ningún valor que matchee, el
 * navegador muestra la primera opción de la lista y el usuario termina guardando
 * algo distinto de lo que había, sin ninguna señal.
 *
 * @param opciones Catálogo tal como vino (solo lo activo).
 * @param resuelto Si la lista YA resolvió. NO tiene default a propósito: la
 *   AUSENCIA solo prueba una baja cuando la lista resolvió. Un `?? []` colapsa
 *   "cargando", "error" y "vacío" en el mismo array vacío, y etiquetar ahí sería
 *   mentirle al usuario sobre un valor que en realidad sigue activo.
 * @param idVigente El valor guardado que el `<select>` tiene que poder mostrar.
 * @param etiquetaDeBaja Texto de la opción sintética (ej. "Prioridad dada de baja").
 * @returns El catálogo, con la opción del valor vigente agregada solo si hace falta.
 */
export function conValorFueraDeCatalogo(
  opciones: OpcionCatalogo[],
  resuelto: boolean,
  idVigente: string,
  etiquetaDeBaja: string,
): OpcionCatalogo[] {
  if (!resuelto || !idVigente || opciones.some((opcion) => opcion.id === idVigente)) return opciones;
  return [...opciones, { id: idVigente, nombre: etiquetaDeBaja }];
}
