import { FeriadoEntity } from '../entities/feriado.entity';

/**
 * IFeriadoClienteRepository — puerto de persistencia del feriado propio del
 * TENANT (tabla `feriados_cliente`, WU3a, sdd/feriados-configurables).
 * Reusa `FeriadoEntity` (D1, mismo shape `{ fecha, descripcion }`, mismo
 * hard delete que el feriado global) — misma forma que
 * `IFeriadoGlobalRepository`, distinta tabla y distinta DB (tenant en vez de
 * master).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IFeriadoClienteRepository {
  /** Feriados del cliente ordenados por `fecha` ascendente. */
  listar(): Promise<FeriadoEntity[]>;

  buscarPorId(id: string): Promise<FeriadoEntity | null>;

  crear(feriado: FeriadoEntity): Promise<void>;

  editar(feriado: FeriadoEntity): Promise<void>;

  /** Baja física — el feriado de cliente no tiene soft delete (D1). */
  eliminar(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IFeriadoClienteRepository en NestJS. */
export const FERIADO_CLIENTE_REPOSITORY = Symbol('FERIADO_CLIENTE_REPOSITORY');
