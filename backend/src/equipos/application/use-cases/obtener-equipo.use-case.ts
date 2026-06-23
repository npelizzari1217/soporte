import { DomainError, Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoInformaticoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/**
 * ObtenerEquipoUseCase — caso de uso de consulta para un único equipo por ID.
 *
 * Thin wrapper sobre IEquipoInformaticoRepository.findById(). Su propósito es
 * mantener la separación de capas: la capa de presentación (controller) no
 * importa directamente puertos de dominio — solo use cases de aplicación.
 *
 * Retorna Result.fail(EquipoInformaticoNoEncontradoError) si el equipo no existe
 * o fue soft-deleted (deleted_at IS NOT NULL).
 *
 * Patrón: clona ObtenerTicketUseCase (tickets-core, tarea 3.E.2).
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos]
 * Tarea: 6.B-lectura / ObtenerEquipoUseCase
 */
export class ObtenerEquipoUseCase {
  constructor(private readonly equipoRepo: IEquipoInformaticoRepository) {}

  async execute(equipoId: string): Promise<Result<EquipoInformaticoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(equipoId);
    // findById incluye soft-deleted; el caller (este use case) los trata como no encontrados.
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(equipoId));
    }
    return Result.ok(equipo);
  }
}
