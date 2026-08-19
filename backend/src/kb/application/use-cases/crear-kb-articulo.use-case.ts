import { DomainError, Result } from '../../../shared/domain/result';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';
import { TituloVacioError, ContenidoVacioError } from '../../domain/errors/kb.errors';

/** DTO de entrada de `CrearKbArticuloUseCase` (K1). `autorId` = `actor.sub`. */
export interface CrearKbArticuloDto {
  titulo: string;
  contenido: string;
  autorId: string;
}

/**
 * CrearKbArticuloUseCase — crea un artículo de KB (K1). Nace SIEMPRE con
 * `visibleParaSolicitante=false` (interno) — se publica explícitamente con
 * `CambiarVisibilidadKbArticuloUseCase` (K2).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
export class CrearKbArticuloUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'save'>) {}

  async execute(dto: CrearKbArticuloDto): Promise<Result<KbArticuloEntity, DomainError>> {
    let articulo: KbArticuloEntity;
    try {
      articulo = KbArticuloEntity.create({
        titulo: dto.titulo,
        contenido: dto.contenido,
        autorId: dto.autorId,
        visibleParaSolicitante: false,
        activo: true,
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
