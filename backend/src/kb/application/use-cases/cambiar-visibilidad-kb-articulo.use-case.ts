import { DomainError, Result } from '../../../shared/domain/result';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

/** DTO de entrada de `CambiarVisibilidadKbArticuloUseCase` (K2). */
export interface CambiarVisibilidadKbArticuloDto {
  id: string;
  /** `true` = publicar (visible al solicitante); `false` = despublicar. */
  visible: boolean;
}

/**
 * CambiarVisibilidadKbArticuloUseCase — publica/despublica un artículo (K2).
 *
 * Ref spec: sdd/premium/spec K2. Tarea: K3/K4.
 */
export class CambiarVisibilidadKbArticuloUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'findById' | 'save'>) {}

  async execute(
    dto: CambiarVisibilidadKbArticuloDto,
  ): Promise<Result<KbArticuloEntity, DomainError>> {
    const articulo = await this.repo.findById(dto.id);
    if (!articulo) {
      return Result.fail(new KbArticuloNoEncontradoError(dto.id));
    }

    articulo.publicar(dto.visible);
    await this.repo.save(articulo);
    return Result.ok(articulo);
  }
}
