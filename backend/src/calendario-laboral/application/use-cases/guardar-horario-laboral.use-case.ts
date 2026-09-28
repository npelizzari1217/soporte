import { Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ICalendarioLaboralSemanalRepository } from '../../domain/ports/i-calendario-laboral-semanal.repository';
import { IHorarioLaboralEscrituraRepository } from '../../domain/ports/i-horario-laboral-escritura.repository';
import { CalendarioLaboralSemanal } from '../../domain/services/calcular-sla-habil-vence.service';
import {
  DiaHorarioEntrada,
  HorarioLaboralSemanal,
} from '../../domain/value-objects/horario-laboral-semanal';
import { HorarioLaboralInvalidoError } from '../../domain/errors/horario-laboral.errors';

/** DTO de entrada: los 7 días crudos, tal como llegan del DTO HTTP (WU-6a). */
export interface GuardarHorarioLaboralDto {
  readonly dias: readonly DiaHorarioEntrada[];
}

/**
 * GuardarHorarioLaboralUseCase — reemplaza el horario laboral completo del
 * tenant activo (sdd/horario-laboral-por-cliente, WU-5, D6 de `design.md`).
 *
 * Flujo:
 * 1. `HorarioLaboralSemanal.crear(dto.dias)` — si el agregado es inválido,
 *    `Result.fail` SIN tocar la base: `txRunner.run` no se llama.
 * 2. Si es válido, `txRunner.run(() => repo.reemplazar(horario))` —
 *    transacción real de inquilino, 7 `upsert` secuenciales en orden
 *    `diaSemana` 0→6 (ver `PrismaCalendarioLaboralSemanalRepository.reemplazar`).
 * 3. Devuelve el horario leído DESPUÉS del commit (no el que se envió), vía
 *    una lectura aparte, fuera de la transacción.
 *
 * Sin control de versión optimista: gana el último `PUT` que commitea (D6).
 *
 * Ref design: D6, D7. Ref spec: "Al menos un día abierto", "Reemplazo
 * atómico de las 7 filas". Ref tasks: 5.5.
 */
export class GuardarHorarioLaboralUseCase {
  constructor(
    private readonly lecturaRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly escrituraRepo: Pick<IHorarioLaboralEscrituraRepository, 'reemplazar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(
    dto: GuardarHorarioLaboralDto,
  ): Promise<Result<CalendarioLaboralSemanal, HorarioLaboralInvalidoError>> {
    const horarioResult = HorarioLaboralSemanal.crear(dto.dias);
    if (horarioResult.isFail()) {
      return Result.fail(horarioResult.getError());
    }
    const horario = horarioResult.getValue();

    await this.txRunner.run(() => this.escrituraRepo.reemplazar(horario));

    const leidoDespuesDelCommit = await this.lecturaRepo.obtener();
    return Result.ok(leidoDespuesDelCommit);
  }
}
