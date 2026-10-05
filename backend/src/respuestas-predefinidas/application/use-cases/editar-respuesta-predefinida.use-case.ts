import { DomainError, Result } from '../../../shared/domain/result';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import {
  RespuestaPredefinidaNoEncontradaError,
  RespuestaPredefinidaTituloDuplicadoError,
} from '../../domain/errors/respuestas-predefinidas.errors';
import { IRespuestaPredefinidaRepository } from '../../domain/ports/i-respuesta-predefinida.repository';

/** DTO de entrada de `EditarRespuestaPredefinidaUseCase` — PATCH semántico. */
export interface EditarRespuestaPredefinidaDto {
  id: string;
  titulo?: string;
  texto?: string;
}

/**
 * EditarRespuestaPredefinidaUseCase — edita `titulo`/`texto`. Si `titulo` cambia, revalida
 * unicidad contra el resto del tenant (excluyendo la propia). Cambiar solo las mayúsculas del
 * propio título es válido: la colisión es consigo misma.
 */
export class EditarRespuestaPredefinidaUseCase {
  constructor(
    private readonly repo: Pick<
      IRespuestaPredefinidaRepository,
      'findById' | 'findByTitulo' | 'save'
    >,
  ) {}

  async execute(
    dto: EditarRespuestaPredefinidaDto,
  ): Promise<Result<RespuestaPredefinidaEntity, DomainError>> {
    const respuesta = await this.repo.findById(dto.id);
    if (!respuesta) {
      return Result.fail(new RespuestaPredefinidaNoEncontradaError(dto.id));
    }

    if (dto.titulo !== undefined && dto.titulo !== respuesta.titulo) {
      const existente = await this.repo.findByTitulo(dto.titulo);
      if (existente && existente.id !== respuesta.id) {
        return Result.fail(new RespuestaPredefinidaTituloDuplicadoError(dto.titulo));
      }
    }

    respuesta.actualizar({ titulo: dto.titulo, texto: dto.texto });
    await this.repo.save(respuesta);

    return Result.ok(respuesta);
  }
}
