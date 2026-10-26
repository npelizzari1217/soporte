import { ArticuloAyuda } from './busqueda-ayuda';

/**
 * Lectura de los artículos de la Ayuda que la persona puede ver (S3). Se lee en cada consulta: un
 * artículo que cambia queda al día sin ningún paso extra.
 */
export interface IFuenteAyuda {
  /**
   * Artículos activos. Con `soloPublicados`, solo los visibles para quien no tiene `KB:VER_TODOS`;
   * es la misma regla que el listado de la Ayuda.
   */
  listarArticulos(soloPublicados: boolean): Promise<ArticuloAyuda[]>;
}

export const FUENTE_AYUDA = Symbol('IFuenteAyuda');
