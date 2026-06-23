import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoInformaticoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';

/**
 * ObtenerComponentesPorEquipoUseCase — lista los componentes de hardware de un equipo.
 *
 * Flujo:
 * 1. Verifica que el equipo exista y no esté soft-deleted via IEquipoInformaticoRepository.findById().
 *    → Result.fail(EquipoInformaticoNoEncontradoError) si no existe o está borrado.
 * 2. Lista los componentes via IComponenteEquipoRepository.findByEquipoId().
 *    findByEquipoId retorna solo componentes con deleted_at IS NULL.
 *
 * Retorna lista vacía si el equipo existe pero no tiene componentes.
 *
 * Patrón: clona ListarOperacionesUseCase (tickets-core) — guard de parent + lista hijos.
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo]
 * Tarea: 6.B-lectura / ObtenerComponentesPorEquipoUseCase
 */
export class ObtenerComponentesPorEquipoUseCase {
  constructor(
    private readonly equipoRepo: IEquipoInformaticoRepository,
    private readonly componenteRepo: IComponenteEquipoRepository,
  ) {}

  async execute(equipoId: string): Promise<Result<ComponenteEquipoEntity[], DomainError>> {
    // 1. Verificar que el equipo existe y no está soft-deleted.
    //    findById retorna soft-deleted también — el caller (este use case) debe filtrarlos.
    const equipo = await this.equipoRepo.findById(equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoInformaticoNoEncontradoError(equipoId));
    }

    // 2. Listar componentes del equipo (solo deleted_at IS NULL — responsabilidad del repo)
    const componentes = await this.componenteRepo.findByEquipoId(equipoId);
    return Result.ok(componentes);
  }
}
