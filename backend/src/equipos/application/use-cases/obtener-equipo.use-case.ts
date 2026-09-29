import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para obtener un equipo por id (F3-Q1). */
export interface ObtenerEquipoDto {
  equipoId: string;
}

/**
 * ComponenteEquipoConTipo — un componente + su nombre/estado de tipo, resueltos
 * SOLO por la familia del repuesto vinculado en el catálogo del TENANT
 * (sdd/catalogo-unico-componentes, ADR-6). MASTER no se consulta.
 *
 * `tipoNombre: null` y `tipoActivo: false` cuando la familia no se resuelve
 * (best-effort); el display del frontend cae a "—".
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
 * (F3-Q1), embebiendo TODOS sus componentes (activos + soft-deleted, el
 * detalle muestra el historial completo).
 *
 * sdd/catalogo-unico-componentes (ADR-6): `{tipoNombre, tipoActivo}` de cada
 * componente sale de la familia de su insumo, resuelta en UNA sola consulta al
 * TENANT (`IInsumoRepository.findFamiliasDeInsumos`, sin N+1). `tipoActivo` es
 * `familia.activo && familia.deletedAt === null`. Sin componentes no se
 * consulta nada.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
export class ObtenerEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findAllByEquipoId'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findFamiliasDeInsumos'>,
  ) {}

  async execute(dto: ObtenerEquipoDto): Promise<Result<EquipoDetalle, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    const componentes = await this.componenteRepo.findAllByEquipoId(equipo.id);

    const insumoIds = componentes.map((c) => c.insumoId);
    const familiasPorInsumo =
      insumoIds.length > 0 ? await this.insumoRepo.findFamiliasDeInsumos(insumoIds) : new Map();

    const componentesConTipo: ComponenteEquipoConTipo[] = componentes.map((componente) => {
      const familia =
        componente.insumoId != null ? familiasPorInsumo.get(componente.insumoId) : undefined;
      return {
        componente,
        tipoNombre: familia?.nombre ?? null,
        tipoActivo: familia != null ? familia.activo && familia.deletedAt === null : false,
      };
    });

    return Result.ok({ equipo, componentes: componentesConTipo });
  }
}
