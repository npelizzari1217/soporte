import { DomainError, Result } from '../../../shared/domain/result';
import { SectorEntity } from '../../domain/entities/sector.entity';
import {
  SectorNoEncontradoError,
  SectorCodigoDuplicadoError,
} from '../../domain/errors/sectores.errors';
import { ISectorRepository } from '../../domain/ports/i-sector.repository';

/** DTO de entrada de `EditarSectorUseCase` (WU-06) — PATCH semántico. */
export interface EditarSectorDto {
  id: string;
  codigo?: string;
  nombre?: string;
}

/**
 * EditarSectorUseCase — edita `codigo`/`nombre` de un sector existente
 * (R10). Si `codigo` cambia, revalida unicidad contra el resto del tenant
 * (excluyendo la propia entidad). Re-enviar el codigo actual sin cambios NO
 * dispara revalidación.
 */
export class EditarSectorUseCase {
  constructor(
    private readonly sectorRepo: Pick<ISectorRepository, 'findById' | 'findByCodigo' | 'save'>,
  ) {}

  async execute(dto: EditarSectorDto): Promise<Result<SectorEntity, DomainError>> {
    const sector = await this.sectorRepo.findById(dto.id);
    if (!sector) {
      return Result.fail(new SectorNoEncontradoError(dto.id));
    }

    if (dto.codigo !== undefined && dto.codigo !== sector.codigo) {
      const existente = await this.sectorRepo.findByCodigo(dto.codigo);
      if (existente && existente.id !== sector.id) {
        return Result.fail(new SectorCodigoDuplicadoError(dto.codigo));
      }
    }

    sector.actualizar({ codigo: dto.codigo, nombre: dto.nombre });
    await this.sectorRepo.save(sector);

    return Result.ok(sector);
  }
}
