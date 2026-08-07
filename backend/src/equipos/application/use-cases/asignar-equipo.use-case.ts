import { DomainError, Result } from '../../../shared/domain/result';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { AsignadoInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para asignar (o desasignar con `null`) un equipo a un usuario (F3-Q1). */
export interface AsignarEquipoDto {
  equipoId: string;
  /** UUID del usuario a asignar. `null` = desasignar. */
  asignadoAId: string | null;
  /** `cliente_id` del JWT — usado SOLO para la validación cross-DB del asignado. */
  clienteId: string;
}

/**
 * AsignarEquipoUseCase — asigna (o desasigna) un equipo a un usuario del
 * tenant (F3-Q1).
 *
 * Flujo:
 * 1. Carga el equipo → `EquipoNoEncontradoError` si no existe/eliminado.
 * 2. Si `asignadoAId` NO es `null`: valida que el usuario esté ACTIVO en
 *    master y tenga membresía activa en el tenant (cross-DB,
 *    `IUsuarioMasterChecker.estaActivoEnTenant` — mismo puerto y criterio
 *    que `AsignarTicketUseCase`, Fase 2) → `AsignadoInvalidoError` (reusado
 *    de `tickets.errors.ts`, NO se duplica) si no.
 * 3. Desasignar (`asignadoAId=null`) NO requiere validación cross-DB.
 * 4. Persiste el cambio.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.3.
 */
export class AsignarEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById' | 'save'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'estaActivoEnTenant'>,
  ) {}

  async execute(dto: AsignarEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    if (dto.asignadoAId !== null) {
      const activo = await this.usuarioMasterChecker.estaActivoEnTenant(
        dto.asignadoAId,
        dto.clienteId,
      );
      if (!activo) {
        return Result.fail(new AsignadoInvalidoError(dto.asignadoAId));
      }
    }

    equipo.asignarA(dto.asignadoAId);
    await this.equipoRepo.save(equipo);

    return Result.ok(equipo);
  }
}
