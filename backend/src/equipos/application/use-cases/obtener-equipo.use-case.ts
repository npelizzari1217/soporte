import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para obtener un equipo por id (F3-Q1). */
export interface ObtenerEquipoDto {
  equipoId: string;
}

/**
 * ComponenteEquipoConTipo — un componente + su nombre/estado resueltos desde
 * el catálogo MASTER (PR4b, sdd/tipos-componente-master). `tipoNombre: null`
 * y `tipoActivo: false` cuando el código no tiene match en MASTER
 * (best-effort, mismo criterio que `ITipoComponenteMasterChecker.resolver`).
 */
export interface ComponenteEquipoConTipo {
  componente: ComponenteEquipoEntity;
  tipoNombre: string | null;
  tipoActivo: boolean;
}

/**
 * Detalle de un equipo + TODOS sus componentes (activos + dados de baja —
 * el listado enriquecido muestra el historial completo, item "componentes
 * de equipo": antes solo traía los ACTIVOS).
 */
export interface EquipoDetalle {
  equipo: EquipoInformaticoEntity;
  componentes: ComponenteEquipoConTipo[];
}

/**
 * ObtenerEquipoUseCase — obtiene el detalle de un equipo del inventario
 * (F3-Q1), embebiendo TODOS sus componentes (activos + soft-deleted)
 * enriquecidos con nombre/estado del catálogo MASTER (item 1 — cierra G7:
 * antes `GET /equipos/:id` no traía `componentes`, el frontend dependía
 * solo del cache de sesión poblado por las mutaciones de agregar/eliminar).
 *
 * DECISIÓN (listado enriquecido de componentes): pasa de
 * `findActiveByEquipoId` a `findAllByEquipoId` — el detalle necesita
 * mostrar también los componentes dados de baja (tachados en la UI, con
 * acción "Reactivar"), no solo los activos.
 *
 * PR4b (sdd/tipos-componente-master): resuelve `{tipoNombre, tipoActivo}` en
 * UN solo batch vía `ITipoComponenteMasterChecker.resolver` (sin N+1) —
 * antes el dominio solo exponía el `tipoComponenteId` crudo.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.2.
 */
export class ObtenerEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findAllByEquipoId'>,
    private readonly tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'resolver'>,
  ) {}

  async execute(dto: ObtenerEquipoDto): Promise<Result<EquipoDetalle, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    const componentes = await this.componenteRepo.findAllByEquipoId(equipo.id);

    const codigos = componentes.map((c) => c.tipoComponenteCodigo);
    const tiposMap = await this.tipoComponenteMasterChecker.resolver(codigos);

    const componentesConTipo: ComponenteEquipoConTipo[] = componentes.map((componente) => {
      const tipo = tiposMap.get(componente.tipoComponenteCodigo);
      return {
        componente,
        tipoNombre: tipo?.nombre ?? null,
        tipoActivo: tipo?.activo ?? false,
      };
    });

    return Result.ok({ equipo, componentes: componentesConTipo });
  }
}
