import { DomainError, Result } from '../../../shared/domain/result';
import { SectorEntity } from '../../domain/entities/sector.entity';
import { SectorCodigoDuplicadoError } from '../../domain/errors/sectores.errors';
import { ISectorRepository } from '../../domain/ports/i-sector.repository';

/** DTO de entrada de `CrearSectorUseCase` (WU-06). */
export interface CrearSectorDto {
  codigo: string;
  nombre: string;
}

/**
 * CrearSectorUseCase — alta de un sector en el catálogo del tenant (R10).
 * Valida que `codigo` no esté en uso (activo o soft-deleted, mismo criterio
 * que `CrearTipoTicketUseCase`) y crea la entidad activa.
 */
export class CrearSectorUseCase {
  constructor(private readonly sectorRepo: Pick<ISectorRepository, 'findByCodigo' | 'save'>) {}

  async execute(dto: CrearSectorDto): Promise<Result<SectorEntity, DomainError>> {
    const existente = await this.sectorRepo.findByCodigo(dto.codigo);
    if (existente) {
      return Result.fail(new SectorCodigoDuplicadoError(dto.codigo));
    }

    const sector = SectorEntity.create({ codigo: dto.codigo, nombre: dto.nombre, activo: true });
    await this.sectorRepo.save(sector);

    return Result.ok(sector);
  }
}
