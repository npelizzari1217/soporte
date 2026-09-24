import { FechaCalendario } from '../value-objects/fecha-calendario';

/**
 * IFeriadosGlobalesChecker — puerto de SOLO LECTURA para saber si una fecha
 * ya existe en el listado GLOBAL de feriados (master `feriados`), desde un
 * use case de tenant (D4, sdd/feriados-configurables).
 *
 * A diferencia de `IFeriadoGlobalRepository` (CRUD completo, ABM WU2), este
 * puerto expone un único método de lectura — el ABM de cliente (WU4) no
 * necesita, y no debe, poder escribir en master. Precedente:
 * `IUsuarioMasterChecker` (`tickets/domain/ports/i-usuario-master.checker.ts`),
 * mismo patrón de checker cross-DB de solo lectura consumido desde un tenant
 * use case.
 *
 * Read-only: se verifica en `crear()` y `editar()` del feriado de cliente
 * (D4). No constriñe la CARRERA cross-DB (ROOT agrega un feriado global
 * mientras un cliente agrega la misma fecha) — aceptado por diseño: el
 * `Set` de la unión en `PrismaFeriadosLaboralesRepository.obtener()` dedupea
 * igual, así que el SLA queda correcto y el único efecto es una fila de
 * cliente redundante.
 */
export interface IFeriadosGlobalesChecker {
  /**
   * @param fecha Fecha de calendario a verificar contra el listado global.
   * @returns `true` si esa fecha ya existe en `master.feriados`.
   */
  esGlobal(fecha: FechaCalendario): Promise<boolean>;
}

/** Token de inyección de dependencias para IFeriadosGlobalesChecker en NestJS. */
export const FERIADOS_GLOBALES_CHECKER = Symbol('FERIADOS_GLOBALES_CHECKER');
