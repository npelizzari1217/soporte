import { DomainError, Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/**
 * ListarEquiposUseCase — caso de uso de consulta para el inventario de equipos del tenant.
 *
 * Delega a IEquipoInformaticoRepository.findAllActive(), que retorna únicamente
 * equipos con activo=TRUE y deleted_at IS NULL (sin soft-deleted).
 * El filtrado activo+no-deleted es responsabilidad del repositorio.
 *
 * No recibe filtros adicionales. Si en el futuro se requiere paginación o
 * filtro por asignadoAId, se extiende este use case o se crea uno especializado.
 *
 * Patrón: sigue el estilo de ListarOperacionesUseCase (tickets-core) adaptado
 * para listar raíces de agregado (no hijos de un ticket/equipo parent).
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos]
 * Tarea: 6.B-lectura / ListarEquiposUseCase
 */
export class ListarEquiposUseCase {
  constructor(private readonly equipoRepo: IEquipoInformaticoRepository) {}

  async execute(): Promise<Result<EquipoInformaticoEntity[], DomainError>> {
    const equipos = await this.equipoRepo.findAllActive();
    return Result.ok(equipos);
  }
}
