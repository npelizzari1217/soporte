import { z } from "zod";
import type { CodigoAccion } from "./acciones";

/**
 * Permisos por tipo de ticket de la sesión (odd/permisos-por-tipo-ticket, S6, T6).
 *
 * El backend decide cada operación sobre un ticket por la acción sobre el tipo de ESE ticket; las
 * celdas `TICKETS:*` y `EDILICIA:*` del JWT ya no deciden nada. Este módulo es el espejo de
 * `GET /tickets/permisos-por-tipo`, sin dependencias de React ni de Next: lo usan el hook del
 * cliente (`usePermisosPorTipo`) y los gates del servidor (layouts e inicio). Ocultar un botón es
 * comodidad, no control: el backend vuelve a decidir cada operación.
 */

/** Espejo de `ACCIONES_TIPO_TICKET` (`backend/src/tickets/domain/permisos-tipo-ticket.ts`). */
export const ACCIONES_TIPO_TICKET = [
  "LECTURA",
  "VER_TODOS",
  "ALTAS",
  "MODIFICACION",
  "TRANSICIONAR",
  "ASIGNAR",
  "COMENTAR",
  "OBSERVAR",
  "IMPRESION",
  "BORRADO",
] as const;

/** Código de una acción concedible sobre un tipo de ticket. */
export type AccionTipoTicket = (typeof ACCIONES_TIPO_TICKET)[number];

/**
 * Schema de la respuesta. Una acción desconocida invalida la respuesta entera: el frontend no
 * adivina qué habilita un código que no conoce.
 */
export const permisosPorTipoSchema = z.object({
  sinRestriccion: z.boolean(),
  porTipo: z.record(z.array(z.enum(ACCIONES_TIPO_TICKET))),
  porModulo: z.record(z.array(z.enum(ACCIONES_TIPO_TICKET))),
});

/**
 * Acciones de la sesión. `sinRestriccion` es ROOT o ADMINISTRADOR; `porModulo` es la unión de las
 * acciones de los tipos de cada módulo (dados de baja incluidos, como el backend).
 */
export type PermisosPorTipo = z.infer<typeof permisosPorTipoSchema>;

/** ROOT y ADMINISTRADOR: el backend no los restringe por tipo (`permisosPorTipo: null`). */
export const PERMISOS_SIN_RESTRICCION: PermisosPorTipo = {
  sinRestriccion: true,
  porTipo: {},
  porModulo: {},
};

/**
 * ¿La sesión tiene `accion` sobre el tipo? `null` (todavía sin datos, o sin poder leerlos) da
 * `false`: mientras no se sabe, no se ofrece la acción.
 *
 * @param permisos Permisos de la sesión, o `null` si no se conocen.
 * @param tipoId Id del tipo de ticket.
 * @param accion Acción buscada.
 * @returns `true` si la acción está concedida sobre ese tipo.
 */
export function puedeEnTipo(
  permisos: PermisosPorTipo | null,
  tipoId: string,
  accion: AccionTipoTicket,
): boolean {
  if (!permisos) return false;
  return permisos.sinRestriccion || (permisos.porTipo[tipoId] ?? []).includes(accion);
}

/**
 * ¿La sesión tiene `accion` sobre algún tipo del módulo? Decide el menú, el gate de ruta y los
 * botones de alta de cada módulo.
 *
 * @param permisos Permisos de la sesión, o `null` si no se conocen.
 * @param modulo Módulo del tipo (`TICKETS`, `EDILICIA`, …).
 * @param accion Acción buscada.
 * @returns `true` si algún tipo del módulo tiene la acción.
 */
export function puedeEnModulo(
  permisos: PermisosPorTipo | null,
  modulo: string,
  accion: AccionTipoTicket,
): boolean {
  if (!permisos) return false;
  return permisos.sinRestriccion || (permisos.porModulo[modulo] ?? []).includes(accion);
}

/**
 * ¿La sesión tiene `accion` sobre algún tipo, de cualquier módulo?
 *
 * @param permisos Permisos de la sesión, o `null` si no se conocen.
 * @param accion Acción buscada.
 * @returns `true` si algún tipo tiene la acción.
 */
export function puedeEnAlgunTipo(
  permisos: PermisosPorTipo | null,
  accion: AccionTipoTicket,
): boolean {
  if (!permisos) return false;
  return (
    permisos.sinRestriccion ||
    Object.values(permisos.porTipo).some((acciones) => acciones.includes(accion))
  );
}

/**
 * Módulos cuyos tipos abren la lista de usuarios con `VER_TODOS`; Edilicia queda afuera (S7). Espejo
 * de `MODULOS_CON_VER_TODOS_QUE_ABRE_USUARIOS`
 * (`backend/src/tickets/application/services/visibilidad-ticket.ts`).
 */
export const MODULOS_CON_VER_TODOS_QUE_ABRE_USUARIOS: readonly string[] = [
  "TICKETS",
  "COMPRAS",
  "EQUIPOS",
];

/**
 * ¿La sesión puede leer la lista de usuarios (`GET /usuarios`), para asignar o filtrar por
 * responsable? Espejo de `puedeVerListaDeUsuarios` del backend (S7): `ASIGNAR` sobre algún tipo, o
 * `VER_TODOS` sobre un tipo de `MODULOS_CON_VER_TODOS_QUE_ABRE_USUARIOS`.
 *
 * @param permisos Permisos de la sesión, o `null` si no se conocen.
 * @returns `true` si el backend le devuelve la lista.
 */
export function puedeVerListaDeUsuarios(permisos: PermisosPorTipo | null): boolean {
  return (
    puedeEnAlgunTipo(permisos, "ASIGNAR") ||
    MODULOS_CON_VER_TODOS_QUE_ABRE_USUARIOS.some((modulo) =>
      puedeEnModulo(permisos, modulo, "VER_TODOS"),
    )
  );
}

/**
 * Los tipos del catálogo sobre los que la sesión tiene `accion`, en el orden recibido.
 *
 * @param permisos Permisos de la sesión, o `null` si no se conocen.
 * @param tipos Catálogo a filtrar.
 * @param accion Acción buscada.
 * @returns El subconjunto de `tipos` con la acción concedida.
 */
export function tiposCon<T extends { id: string }>(
  permisos: PermisosPorTipo | null,
  tipos: readonly T[],
  accion: AccionTipoTicket,
): T[] {
  return tipos.filter((tipo) => puedeEnTipo(permisos, tipo.id, accion));
}

/**
 * Celdas de la matriz por módulo que pasaron a los permisos por tipo y ya no deciden nada (T7,
 * D5 d): todas las de TICKETS y `EDILICIA:LECTURA`, `ALTAS` y `MODIFICACION`. `EDILICIA:BORRADO`
 * (desvincular compra) sigue siendo del módulo. Espejo de `celdaReemplazadaPorTipo`
 * (`backend/src/tickets/domain/permisos-tipo-ticket.ts`): la grilla de módulos no las muestra, y
 * el backend las conserva como estaban al guardar esa grilla.
 */
export const CELDAS_REEMPLAZADAS_POR_TIPO: readonly CodigoAccion[] = [
  "TICKETS:LECTURA",
  "TICKETS:ALTAS",
  "TICKETS:MODIFICACION",
  "TICKETS:VER_TODOS",
  "TICKETS:ASIGNAR",
  "TICKETS:TRANSICIONAR",
  "TICKETS:OBSERVAR",
  "TICKETS:COMENTAR",
  "EDILICIA:LECTURA",
  "EDILICIA:ALTAS",
  "EDILICIA:MODIFICACION",
];
