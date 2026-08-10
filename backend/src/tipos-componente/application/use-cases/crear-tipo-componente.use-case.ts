import { Result } from '../../../shared/domain/result';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import {
  CodigoTipoComponenteDuplicadoError,
  CodigoTipoComponenteInvalidoError,
} from '../../domain/errors/tipos-componente.errors';

/** DTO para dar de alta un tipo de componente en el catálogo MASTER. */
export interface CrearTipoComponenteDto {
  codigo: string;
  nombre: string;
}

/**
 * CrearTipoComponenteUseCase — crea un nuevo tipo de componente en el
 * catálogo MASTER (`master.tipos_componente`), exclusivo de ROOT
 * (autorización enforced por `GlobalAdminGuard` en el controller — el use
 * case no vuelve a resolver `is_global_admin`, mismo criterio que
 * `CrearCicloVigenteUseCase`).
 *
 * Valida duplicado por `codigo` normalizado (`trim().toUpperCase()`, UNIQUE
 * en DB) ANTES de invocar `TipoComponente.create()` — evita depender del
 * constraint de la base para un error que el dominio ya puede anticipar.
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
export class CrearTipoComponenteUseCase {
  constructor(
    private readonly repo: Pick<ITipoComponenteMasterRepository, 'findByCodigo' | 'save'>,
  ) {}

  async execute(
    dto: CrearTipoComponenteDto,
  ): Promise<
    Result<TipoComponente, CodigoTipoComponenteDuplicadoError | CodigoTipoComponenteInvalidoError>
  > {
    const codigoNormalizado = dto.codigo.trim().toUpperCase();

    const existente = await this.repo.findByCodigo(codigoNormalizado);
    if (existente) {
      return Result.fail(new CodigoTipoComponenteDuplicadoError(codigoNormalizado));
    }

    const created = TipoComponente.create({ codigo: dto.codigo, nombre: dto.nombre });
    if (created.isFail()) {
      return Result.fail(created.getError());
    }

    const tipo = created.getValue();
    await this.repo.save(tipo);
    return Result.ok(tipo);
  }
}
