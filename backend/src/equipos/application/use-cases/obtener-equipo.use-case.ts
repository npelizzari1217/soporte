import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para obtener un equipo por id (F3-Q1). */
export interface ObtenerEquipoDto {
  equipoId: string;
}

/** Detalle de un equipo + sus componentes activos (sdd/beta-frontend item 1 — G7, embebido). */
export interface EquipoDetalle {
  equipo: EquipoInformaticoEntity;
  componentes: ComponenteEquipoEntity[];
}

/**
 * ObtenerEquipoUseCase — obtiene el detalle de un equipo del inventario
 * (F3-Q1), embebiendo sus componentes ACTIVOS (item 1 — cierra G7: antes
 * `GET /equipos/:id` no traía `componentes`, el frontend dependía solo del
 * cache de sesión poblado por las mutaciones de agregar/eliminar).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.2.
 */
export class ObtenerEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findActiveByEquipoId'>,
  ) {}

  async execute(dto: ObtenerEquipoDto): Promise<Result<EquipoDetalle, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    const componentes = await this.componenteRepo.findActiveByEquipoId(equipo.id);
    return Result.ok({ equipo, componentes });
  }
}
