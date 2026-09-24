import { FeriadoEntity } from '../entities/feriado.entity';

/**
 * IFeriadoGlobalRepository — puerto de persistencia del feriado GLOBAL
 * (master `feriados`). CRUD completo: a diferencia de
 * `IFeriadosLaboralesRepository` (solo lectura, consumido por el cálculo de
 * SLA), este puerto respalda el ABM de WU2 (`FeriadosController`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IFeriadoGlobalRepository {
  /** Feriados globales ordenados por `fecha` ascendente. */
  listar(): Promise<FeriadoEntity[]>;

  buscarPorId(id: string): Promise<FeriadoEntity | null>;

  crear(feriado: FeriadoEntity): Promise<void>;

  editar(feriado: FeriadoEntity): Promise<void>;

  /** Baja física — el feriado global no tiene soft delete (D1). */
  eliminar(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IFeriadoGlobalRepository en NestJS. */
export const FERIADO_GLOBAL_REPOSITORY = Symbol('FERIADO_GLOBAL_REPOSITORY');
