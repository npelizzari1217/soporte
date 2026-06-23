import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import {
  AsignadoEquipoInvalidoError,
  EquipoInformaticoNoEncontradoError,
} from '../../domain/errors/equipos.errors';

/**
 * DTO para asignar un equipo a un usuario.
 */
export interface AsignarEquipoDto {
  /** UUID del equipo a asignar. */
  equipoId: string;
  /**
   * UUID del usuario de master.usuarios al que se asigna el equipo.
   * Es un soft ref cross-DB: la validación de existencia y pertenencia al tenant
   * ocurre acá via IUsuarioMasterChecker, no en la DB.
   */
  asignadoAId: string;
  /** UUID del cliente (tenant), extraído del JWT. Necesario para la validación cross-DB. */
  clienteId: string;
}

/**
 * AsignarEquipoUseCase — caso de uso para asignar un equipo informático a un usuario.
 *
 * LO MÁS DELICADO DE 6.B: validación cross-DB.
 *
 * Flujo:
 * 1. Carga el equipo por id → 404 si no existe o fue soft-deleted.
 * 2. Valida que asignado_a_id existe en master.usuarios con activo=TRUE y
 *    pertenece al tenant del JWT (cross-DB validation via IUsuarioMasterChecker).
 *    Si no → fail loud (422 semántico) con AsignadoEquipoInvalidoError.
 * 3. Aplica la asignación en la entidad (asignarA).
 * 4. Persiste en transacción.
 * 5. Retorna Result.ok(equipo).
 *
 * REUTILIZA el mismo puerto IUsuarioMasterChecker que AsignarTicketUseCase
 * (definido en tickets/domain/ports/ e implementado en tickets/infrastructure/).
 * El método estaActivoEnTenant requiere activo=TRUE — más estricto que existeEnTenant
 * (que solo requiere deleted_at IS NULL). Se usa estaActivoEnTenant porque el asignado
 * debe poder operar el equipo (no solo haber existido en el sistema).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:equipos/asignado_a_id validado como usuario activo del tenant]
 * Tarea: 6.B.5 / 6.B.6
 */
export class AsignarEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AsignarEquipoDto): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    // 1. Cargar el equipo
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(dto.equipoId));
    }

    // 2. Validación cross-DB: el asignado debe existir en master.usuarios con activo=TRUE
    //    y pertenecer al mismo tenant del JWT.
    //    DECISIÓN: se usa estaActivoEnTenant (activo=TRUE), no existeEnTenant (deleted_at IS NULL).
    //    Razón: el usuario debe estar activo para recibir nuevas asignaciones de equipo.
    //    Patrón reutilizado de AsignarTicketUseCase (tickets/application/use-cases/).
    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoAId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoEquipoInvalidoError(dto.asignadoAId));
    }

    // 3. Aplicar la asignación en la entidad
    equipo.asignarA(dto.asignadoAId);

    // 4. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.equipoRepo.save(equipo);
    });

    return Result.ok(equipo);
  }
}
