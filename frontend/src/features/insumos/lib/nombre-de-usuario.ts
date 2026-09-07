/**
 * nombre-de-usuario — nombra al usuario que firmó un asiento de la bitácora,
 * SIN mostrar nunca su identificador.
 *
 * Es hermano de `nombre-de-catalogo.ts` y comparte su regla —la resuelve el
 * mismo `resolverDeCatalogo`—, pero no puede ser el mismo módulo por dos
 * diferencias reales:
 *
 * 1. **El shape.** Un usuario se nombra con `nombre` + `apellido`, no con un
 *    único campo `nombre` como una familia o una unidad de medida.
 * 2. **Lo que significa cada desenlace.** El catálogo de familias es lectura
 *    abierta: si no llegó, fue la red. `GET /usuarios` NO lo es —exige
 *    `TICKETS:ASIGNAR`, `TICKETS:VER_TODOS` o ser ADMINISTRADOR/ROOT—, así que
 *    para el técnico que entra a la ficha con solo `INSUMOS:LECTURA` el
 *    desenlace normal, y no el excepcional, es que la lista nunca llegue.
 *
 * **La regla dura: la celda NUNCA muestra el `usuarioId`.** Un UUID en pantalla
 * no le dice nada a nadie, y publicarlo como consuelo es exactamente lo que
 * esta entrega vino a corregir en las columnas de familia y unidad. El nombre
 * es un dato ACCESORIO de la bitácora: que falte degrada una celda, no la
 * lectura — por eso tampoco hay toast ni reintento colgando de esta consulta.
 */
import { resolverDeCatalogo, type EstadoCatalogo } from "./resolucion-de-catalogo";

/** Lo mínimo que hace falta para nombrar a quien firmó un asiento. */
export interface UsuarioConNombre {
  id: string;
  nombre: string;
  apellido: string;
}

/** La lista de usuarios tal como la entrega TanStack Query, sin aplanar. */
export type EstadoUsuarios = EstadoCatalogo<UsuarioConNombre>;

/** La consulta está en vuelo: todavía no se sabe nada. */
export const ETIQUETA_USUARIO_CARGANDO = "Cargando…";

/**
 * La lista no resolvió y ya no está cargando. Cubre el 403 del técnico sin
 * permisos de tickets tanto como una caída de red, y dice lo mismo en los dos
 * casos a propósito: la diferencia importaría si hubiera algo para reintentar,
 * y acá no lo hay. Lo que NO dice es nada sobre el asiento — el movimiento
 * está, lo que falta es el nombre.
 */
export const ETIQUETA_USUARIOS_NO_DISPONIBLES = "Sin datos de usuarios";

/**
 * La lista resolvió y el id no está: `GET /usuarios` devuelve los usuarios con
 * membresía ACTIVA en el inquilino, así que faltar de ella significa que quien
 * firmó el asiento ya no es miembro vigente. El asiento sigue siendo válido —
 * la bitácora es historia, y la historia no se borra cuando alguien se va.
 */
export const ETIQUETA_USUARIO_SIN_MEMBRESIA = "Usuario sin membresía vigente";

/**
 * Nombra a quien firmó un asiento contra la lista de usuarios del inquilino.
 *
 * @param usuarioId Identificador que guarda el asiento.
 * @param usuarios Estado crudo de la query de usuarios.
 * @returns `"Nombre Apellido"` si la lista resolvió y lo trae; si no, la
 *   etiqueta del desenlace — nunca el identificador crudo.
 */
export function nombreDeUsuario(usuarioId: string, usuarios: EstadoUsuarios): string {
  const resolucion = resolverDeCatalogo(usuarioId, usuarios);

  // Sin `default`: el `switch` exhaustivo sobre la unión es lo que hace que un
  // desenlace nuevo en `ResolucionDeCatalogo` rompa el typecheck acá en vez de
  // caer en silencio en una rama genérica que terminaría mostrando el id.
  switch (resolucion.estado) {
    case "CARGANDO":
      return ETIQUETA_USUARIO_CARGANDO;
    case "NO_DISPONIBLE":
      return ETIQUETA_USUARIOS_NO_DISPONIBLES;
    case "FUERA_DE_CATALOGO":
      return ETIQUETA_USUARIO_SIN_MEMBRESIA;
    case "ENCONTRADA":
      return `${resolucion.entrada.nombre} ${resolucion.entrada.apellido}`;
  }
}
