import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  EquipoNoEncontradoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para agregar un componente a un equipo (F3-Q2). */
export interface AgregarComponenteDto {
  equipoId: string;
  tipoComponenteCodigo: string;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/**
 * AgregarComponenteUseCase — agrega un componente físico a un equipo
 * existente (F3-Q2).
 *
 * Flujo:
 * 1. Verifica que el equipo exista y no esté soft-deleted.
 * 2. Verifica que el tipo de componente exista y esté `activo` en el
 *    catálogo MASTER (`ITipoComponenteMasterChecker.estaActivo`, PR4b) — un
 *    código inexistente o inactivo bloquea la creación de NUEVOS componentes
 *    (`TipoComponenteInactivoError`; los componentes ya existentes de un
 *    tipo que luego se desactiva no se ven afectados).
 * 3. Crea `ComponenteEquipoEntity` (permite N componentes del mismo tipo
 *    por equipo — sin restricción de unicidad) y persiste.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref: sdd/tipos-componente-master
 * (PR4b — migra de `ITipoComponenteRepository` tenant a
 * `ITipoComponenteMasterChecker` cross-DB). Tarea: T12.4, T12.5.
 */
export class AgregarComponenteUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'estaActivo'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'save'>,
  ) {}

  async execute(dto: AgregarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    const activo = await this.tipoComponenteMasterChecker.estaActivo(dto.tipoComponenteCodigo);
    if (!activo) {
      return Result.fail(new TipoComponenteInactivoError(dto.tipoComponenteCodigo));
    }

    const componenteResult = ComponenteEquipoEntity.create({
      equipoId: dto.equipoId,
      tipoComponenteCodigo: dto.tipoComponenteCodigo,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    });
    if (componenteResult.isFail()) {
      return Result.fail(componenteResult.getError());
    }
    const componente = componenteResult.getValue();

    await this.componenteRepo.save(componente);
    return Result.ok(componente);
  }
}
