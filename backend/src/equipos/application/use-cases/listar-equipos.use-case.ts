import { DomainError, Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

export interface ListarEquiposDto {
  /** Incluye los equipos dados de baja (R11). Por defecto `false`: solo los vigentes. */
  incluirDadosDeBaja?: boolean;
}

/**
 * ListarEquiposUseCase — lista los equipos del inventario del tenant (F3-Q1).
 *
 * Por defecto devuelve solo los vigentes, que es lo que esperan los selectores de otras
 * pantallas (tickets, preventivo, movimientos). Con `incluirDadosDeBaja` suma los dados de baja
 * (R11); los borrados lógicos nunca aparecen.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.2.
 */
export class ListarEquiposUseCase {
  constructor(
    private readonly equipoRepo: Pick<
      IEquipoInformaticoRepository,
      'findAllActive' | 'findAllIncluyendoDadosDeBaja'
    >,
  ) {}

  async execute(
    dto: ListarEquiposDto = {},
  ): Promise<Result<EquipoInformaticoEntity[], DomainError>> {
    const equipos = dto.incluirDadosDeBaja
      ? await this.equipoRepo.findAllIncluyendoDadosDeBaja()
      : await this.equipoRepo.findAllActive();
    return Result.ok(equipos);
  }
}
