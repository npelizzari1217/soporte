import { NuevaValoracionEquipo, ValoracionEquipo } from '../entities/valoracion-equipo';

/**
 * IValoracionEquipoRepository — puerto de persistencia del historial del valor de un equipo
 * (odd/tasks/historial-valor-residual.md). Sin imports de Prisma ni NestJS.
 */
export interface IValoracionEquipoRepository {
  /**
   * Registra la valoración de un guardado manual (S2, S3): upsert por equipo y día. Si el equipo
   * ya tiene una fila ese día, la reemplaza con este importe y este usuario, y la marca `MANUAL`
   * (el último guardado del día manda, también sobre una fila de migración).
   *
   * Corre en la transacción del guardado del equipo, cuando la hay: si falla, el equipo no queda
   * guardado.
   *
   * @param valoracion Equipo, día, importe y usuario que guardó.
   */
  registrar(valoracion: NuevaValoracionEquipo): Promise<void>;

  /**
   * Historial completo del equipo, ordenado por fecha ascendente.
   *
   * @param equipoId Id del equipo.
   * @returns Las valoraciones del equipo; un arreglo vacío si no tiene.
   */
  listarPorEquipo(equipoId: string): Promise<ValoracionEquipo[]>;
}

/** Token de inyección de dependencias para IValoracionEquipoRepository en NestJS. */
export const VALORACION_EQUIPO_REPOSITORY = Symbol('VALORACION_EQUIPO_REPOSITORY');
