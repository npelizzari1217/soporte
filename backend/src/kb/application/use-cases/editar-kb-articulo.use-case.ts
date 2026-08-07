import { DomainError, Result } from '../../../shared/domain/result';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';
import {
  KbArticuloNoEncontradoError,
  TituloVacioError,
  ContenidoVacioError,
} from '../../domain/errors/kb.errors';

/** DTO de entrada de `EditarKbArticuloUseCase` (K1) — PATCH semántico. */
export interface EditarKbArticuloDto {
  id: string;
  titulo?: string;
  contenido?: string;
  tipoTicketId?: string | null;
}

/**
 * EditarKbArticuloUseCase — edita `titulo`/`contenido`/`tipoTicketId` de un
 * artículo existente (K1). NO cambia visibilidad (ver
 * `CambiarVisibilidadKbArticuloUseCase`, K2).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
export class EditarKbArticuloUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'findById' | 'save'>) {}

  async execute(dto: EditarKbArticuloDto): Promise<Result<KbArticuloEntity, DomainError>> {
    const articulo = await this.repo.findById(dto.id);
    if (!articulo) {
      return Result.fail(new KbArticuloNoEncontradoError(dto.id));
    }

    try {
      articulo.editar({
        titulo: dto.titulo,
        contenido: dto.contenido,
        tipoTicketId: dto.tipoTicketId,
      });
    } catch (error) {
      if (error instanceof TituloVacioError || error instanceof ContenidoVacioError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.repo.save(articulo);
    return Result.ok(articulo);
  }
}
