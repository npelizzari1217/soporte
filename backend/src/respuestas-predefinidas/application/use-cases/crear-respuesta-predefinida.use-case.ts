import { DomainError, Result } from '../../../shared/domain/result';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { RespuestaPredefinidaTituloDuplicadoError } from '../../domain/errors/respuestas-predefinidas.errors';
import { IRespuestaPredefinidaRepository } from '../../domain/ports/i-respuesta-predefinida.repository';

/** DTO de entrada de `CrearRespuestaPredefinidaUseCase`. */
export interface CrearRespuestaPredefinidaDto {
  titulo: string;
  texto: string;
}

/**
 * CrearRespuestaPredefinidaUseCase — alta de una respuesta en el catálogo del tenant. Valida
 * que `titulo` no esté en uso (sin distinguir mayúsculas, activas o desactivadas).
 */
export class CrearRespuestaPredefinidaUseCase {
  constructor(
    private readonly repo: Pick<IRespuestaPredefinidaRepository, 'findByTitulo' | 'save'>,
  ) {}

  async execute(
    dto: CrearRespuestaPredefinidaDto,
  ): Promise<Result<RespuestaPredefinidaEntity, DomainError>> {
    const existente = await this.repo.findByTitulo(dto.titulo);
    if (existente) {
      return Result.fail(new RespuestaPredefinidaTituloDuplicadoError(dto.titulo));
    }

    const respuesta = RespuestaPredefinidaEntity.create({
      titulo: dto.titulo,
      texto: dto.texto,
      activo: true,
    });
    await this.repo.save(respuesta);

    return Result.ok(respuesta);
  }
}
