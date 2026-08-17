import { DomainError, Result } from '../../../shared/domain/result';
import { SectorEntity } from '../../domain/entities/sector.entity';
import { SectorNoEncontradoError } from '../../domain/errors/sectores.errors';
import { ISectorRepository } from '../../domain/ports/i-sector.repository';

/** DTO de entrada de `CambiarEstadoActivoSectorUseCase` (WU-06). */
export interface CambiarEstadoActivoSectorDto {
  id: string;
  /** `false` = dar de baja (soft delete). `true` = reactivar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoSectorUseCase — activa o desactiva un sector (R10).
 * Dar de baja NO rompe compras existentes que lo referencian (FK
 * `ON DELETE RESTRICT`, no hay borrado físico posible mientras esté en uso).
 */
export class CambiarEstadoActivoSectorUseCase {
  constructor(private readonly sectorRepo: Pick<ISectorRepository, 'findById' | 'save'>) {}

  async execute(dto: CambiarEstadoActivoSectorDto): Promise<Result<SectorEntity, DomainError>> {
    const sector = await this.sectorRepo.findById(dto.id);
    if (!sector) {
      return Result.fail(new SectorNoEncontradoError(dto.id));
    }

    if (dto.activo) {
      sector.activar();
    } else {
      sector.desactivar();
    }

    await this.sectorRepo.save(sector);

    return Result.ok(sector);
  }
}
