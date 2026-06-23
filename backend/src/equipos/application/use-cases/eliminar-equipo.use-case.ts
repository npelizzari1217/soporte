import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * DTO para eliminar un equipo (soft delete).
 */
export interface EliminarEquipoDto {
  /** UUID del equipo a eliminar lógicamente. */
  equipoId: string;
}

/**
 * EliminarEquipoUseCase — elimina lógicamente un equipo informático del inventario.
 *
 * Flujo:
 * 1. Carga el equipo por id → 404 si no existe o ya fue soft-deleted.
 * 2. Llama al repositorio para aplicar el soft delete (setea deleted_at).
 * 3. NO elimina ni afecta los tickets de soporte que referencian el equipo:
 *    los tickets permanecen intactos (sin cascade).
 * 4. Retorna Result.ok(void).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/Soft delete de equipo no borra historial de tickets]
 * Tarea: 6.B.3 / 6.B.4
 */
export class EliminarEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarEquipoDto): Promise<Result<void, DomainError>> {
    // 1. Cargar el equipo — guard: excluir ya eliminados
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(dto.equipoId));
    }

    // 2. Soft delete vía repositorio dentro de la transacción
    //    El repositorio setea deleted_at. Los tickets de soporte NO se tocan.
    await this.txRunner.run(async () => {
      await this.equipoRepo.delete(dto.equipoId);
    });

    return Result.ok(undefined);
  }
}
