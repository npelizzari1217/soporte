import { HorarioLaboralSemanal } from '../value-objects/horario-laboral-semanal';

/**
 * IHorarioLaboralEscrituraRepository — puerto de escritura del horario
 * laboral semanal del cliente (sdd/horario-laboral-por-cliente, WU-5, D6 de
 * `design.md`). Separado de `ICalendarioLaboralSemanalRepository` (ISP): el
 * SLA solo lee (mismo criterio que `IFeriadosLaboralesRepository`), y solo
 * `GuardarHorarioLaboralUseCase` necesita escribir.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IHorarioLaboralEscrituraRepository {
  /**
   * Reemplaza el horario completo del tenant activo con las 7 ventanas del
   * agregado ya validado, una por `diaSemana`.
   *
   * La implementación DEBE escribir las 7 filas de forma secuencial, en
   * orden `diaSemana` 0→6 ascendente — nunca en paralelo (`Promise.all`) —
   * para que dos escrituras concurrentes tomen los locks de fila en el mismo
   * orden y no puedan deadlockear entre sí (D6).
   */
  reemplazar(horario: HorarioLaboralSemanal): Promise<void>;
}

/** Token de inyección de dependencias para IHorarioLaboralEscrituraRepository en NestJS. */
export const HORARIO_LABORAL_ESCRITURA_REPOSITORY = Symbol('HORARIO_LABORAL_ESCRITURA_REPOSITORY');
