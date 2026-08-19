/**
 * tope-filas-export.ts — tope ÚNICO de filas para las exportaciones a CSV.
 *
 * Vive en `shared/domain` (no en un módulo funcional) porque las cuatro
 * exportaciones (compras, tickets, equipos, reparaciones) comparten el mismo
 * criterio de "cuándo un archivo es demasiado grande": no es un límite
 * técnico de Postgres ni de Node, es el punto donde construir el archivo
 * entero en memoria deja de ser gratis. Copiar el número en cada módulo es
 * exactamente el tipo de duplicación que sobrevive a un cambio de criterio y
 * deja la mitad del sistema con un tope distinto de la otra mitad.
 */

/**
 * Máximo de filas que una exportación puede contener antes de que el
 * sistema la rechace con un error explícito en vez de devolver un archivo
 * truncado en silencio.
 */
export const TOPE_FILAS_EXPORT = 5000;
