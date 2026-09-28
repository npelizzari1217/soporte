import { DomainError, Result } from '../../../shared/domain/result';
import { ICalendarioLaboralSemanalRepository } from '../../domain/ports/i-calendario-laboral-semanal.repository';
import { CalendarioLaboralSemanal } from '../../domain/services/calcular-sla-habil-vence.service';

/**
 * ObtenerHorarioLaboralUseCase — lee el horario laboral semanal del tenant
 * activo (sdd/horario-laboral-por-cliente, WU-5). Pass-through de lectura:
 * el fail-closed sin `TenantContext` ya lo garantiza el repositorio
 * (`CalendarioLaboralSinTenantContextError`, D4).
 *
 * Sin fallos esperados — mantiene `Result` por consistencia con el resto del
 * módulo (mismo criterio que `ListarFeriadosGlobalesUseCase`).
 *
 * Ref design: mapa de capas (`application/use-cases`). Ref tasks: 5.4.
 */
export class ObtenerHorarioLaboralUseCase {
  constructor(private readonly repo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>) {}

  async execute(): Promise<Result<CalendarioLaboralSemanal, DomainError>> {
    const horario = await this.repo.obtener();
    return Result.ok(horario);
  }
}
