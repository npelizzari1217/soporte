/**
 * Tope de largo del título del artículo de Ayuda, espejando la autoridad del
 * backend.
 *
 * Autoridad: `KB_TITULO_MAX_LENGTH` en `KbArticuloEntity`, que espeja
 * `kbArticulos.titulo VarChar(255)`, y `kb-articulo.dto.ts` importa esa misma
 * constante.
 *
 * OJO con el alcance: entidad y DTO están unidas por un `import`, así que ESAS
 * dos no pueden divergir. Este número es una copia a mano, fijada por el
 * centinela del test — que atrapa una edición accidental, no un cambio de la
 * columna.
 *
 * `contenido` no lleva tope acá ni en el DTO: su columna es `@db.Text`, sin
 * límite. No hay nada que espejar.
 */
export const KB_TITULO_MAX_LENGTH = 255;
