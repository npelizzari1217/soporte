import { DomainError, Result } from '../../../shared/domain/result';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { RespuestaPredefinidaNoEncontradaError } from '../../domain/errors/respuestas-predefinidas.errors';
import { IRespuestaPredefinidaRepository } from '../../domain/ports/i-respuesta-predefinida.repository';

/** DTO de entrada de `CambiarEstadoActivoRespuestaPredefinidaUseCase`. */
export interface CambiarEstadoActivoRespuestaPredefinidaDto {
  id: string;
  /** `false` = desactivar. `true` = reactivar. */
  activo: boolean;
}

/** CambiarEstadoActivoRespuestaPredefinidaUseCase — activa o desactiva una respuesta. */
export class CambiarEstadoActivoRespuestaPredefinidaUseCase {
  constructor(private readonly repo: Pick<IRespuestaPredefinidaRepository, 'findById' | 'save'>) {}

  async execute(
    dto: CambiarEstadoActivoRespuestaPredefinidaDto,
  ): Promise<Result<RespuestaPredefinidaEntity, DomainError>> {
    const respuesta = await this.repo.findById(dto.id);
    if (!respuesta) {
      return Result.fail(new RespuestaPredefinidaNoEncontradaError(dto.id));
    }

    if (dto.activo) {
      respuesta.activar();
    } else {
      respuesta.desactivar();
    }
    await this.repo.save(respuesta);

    return Result.ok(respuesta);
  }
}
