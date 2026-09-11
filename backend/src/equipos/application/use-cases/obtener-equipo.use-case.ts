import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para obtener un equipo por id (F3-Q1). */
export interface ObtenerEquipoDto {
  equipoId: string;
}

/**
 * ComponenteEquipoConTipo — un componente + su nombre/estado resueltos por el
 * CAMINO del componente (sdd/repuestos-autoridad-catalogo, ADR-2): un
 * vinculado (`insumoId != null`) resuelve contra el catálogo del TENANT vía
 * su familia; uno de texto libre (`insumoId === null`) sigue resolviendo
 * contra MASTER (PR4b, sdd/tipos-componente-master), sin cambios. Sin
 * fallback cruzado entre los dos: bajo una colisión de `codigo` entre tenant
 * y MASTER, gana siempre la fuente del camino del componente.
 *
 * `tipoNombre: null` y `tipoActivo: false` cuando no hay match en la fuente
 * que corresponde (best-effort, mismo criterio para las dos fuentes).
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
 * sdd/repuestos-autoridad-catalogo (ADR-2/ADR-3): el batch se PARTE en dos,
 * por el camino de cada componente — nunca por lo que devuelva la otra
 * fuente (sin fallback cruzado):
 * - **Vinculado** (`insumoId != null`): `IInsumoRepository.findFamiliasDeInsumos`
 *   resuelve, en UNA consulta al TENANT, la familia de cada insumo. `tipoNombre`
 *   sale de `familia.nombre`, y `tipoActivo` es `familia.activo &&
 *   familia.deletedAt === null` — la familia del tenant es la única autoridad
 *   de este camino, MASTER no se consulta.
 * - **Texto libre** (`insumoId === null`): sigue igual, contra MASTER vía
 *   `resolver()`.
 *
 * Cada lectura se SALTEA si su lista de entrada está vacía (sin componentes
 * vinculados no se consulta el tenant; sin componentes de texto libre no se
 * consulta MASTER): el peor caso queda en 2 lecturas fijas, nunca N+1.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref:
 * sdd/repuestos-autoridad-catalogo. Tarea: T12.2.
 */
export class ObtenerEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findAllByEquipoId'>,
    private readonly tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'resolver'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findFamiliasDeInsumos'>,
  ) {}

  async execute(dto: ObtenerEquipoDto): Promise<Result<EquipoDetalle, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    const componentes = await this.componenteRepo.findAllByEquipoId(equipo.id);

    // Partición por CAMINO, no por resultado: ADR-2 exige que cada componente
    // resuelva contra la fuente de su propio camino, sin fallback cruzado.
    const insumoIds = componentes
      .filter((c) => c.insumoId != null)
      .map((c) => c.insumoId as string);
    const codigosTextoLibre = componentes
      .filter((c) => c.insumoId == null)
      .map((c) => c.tipoComponenteCodigo);

    const familiasVacio: ReturnType<IInsumoRepository['findFamiliasDeInsumos']> = Promise.resolve(
      new Map(),
    );
    const tiposVacio: ReturnType<ITipoComponenteMasterChecker['resolver']> = Promise.resolve(
      new Map(),
    );

    const [familiasPorInsumo, tiposPorCodigo] = await Promise.all([
      insumoIds.length > 0 ? this.insumoRepo.findFamiliasDeInsumos(insumoIds) : familiasVacio,
      codigosTextoLibre.length > 0
        ? this.tipoComponenteMasterChecker.resolver(codigosTextoLibre)
        : tiposVacio,
    ]);

    const componentesConTipo: ComponenteEquipoConTipo[] = componentes.map((componente) => {
      if (componente.insumoId != null) {
        const familia = familiasPorInsumo.get(componente.insumoId);
        return {
          componente,
          tipoNombre: familia?.nombre ?? null,
          tipoActivo: familia != null ? familia.activo && familia.deletedAt === null : false,
        };
      }
      const tipo = tiposPorCodigo.get(componente.tipoComponenteCodigo);
      return {
        componente,
        tipoNombre: tipo?.nombre ?? null,
        tipoActivo: tipo?.activo ?? false,
      };
    });

    return Result.ok({ equipo, componentes: componentesConTipo });
  }
}
