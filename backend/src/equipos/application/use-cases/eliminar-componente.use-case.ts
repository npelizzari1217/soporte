import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ComponenteEquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * DTO para eliminar (soft delete) un componente de equipo.
 */
export interface EliminarComponenteDto {
  /** UUID del componente a eliminar lógicamente. */
  componenteId: string;
}

/**
 * EliminarComponenteUseCase — elimina lógicamente un componente de un equipo.
 *
 * Flujo:
 * 1. Carga el componente por id → 404 si no existe o ya fue soft-deleted.
 * 2. Soft delete vía repositorio dentro de la transacción.
 * 3. El equipo y los demás componentes NO se ven afectados.
 * 4. El tipo de componente permanece sin cambios.
 * 5. Retorna Result.ok(void).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Soft delete de componente no afecta el equipo]
 * Tarea: 6.B.5 / 6.B.6
 */
export class EliminarComponenteUseCase {
  constructor(
    private readonly componenteRepo: IComponenteEquipoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarComponenteDto): Promise<Result<void, DomainError>> {
    // 1. Cargar el componente — guard: excluir ya eliminados
    const componente = await this.componenteRepo.findById(dto.componenteId);
    if (!componente || componente.isDeleted()) {
      return Result.fail(new ComponenteEquipoNoEncontradoError(dto.componenteId));
    }

    // 2. Soft delete vía repositorio dentro de la transacción
    //    El equipo y los demás componentes no se tocan.
    await this.txRunner.run(async () => {
      await this.componenteRepo.delete(dto.componenteId);
    });

    return Result.ok(undefined);
  }
}
