import { DomainError, Result } from '../../../shared/domain/result';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { UnidadNoEncontradaError } from '../../domain/errors/unidades-insumo.errors';
import { IEventoUnidadInsumoRepository } from '../../domain/ports/i-evento-unidad-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';

/**
 * Un asiento del historial con su destino ya resuelto. El destino y el motivo de
 * una entrega o una baja se LEEN del movimiento que el evento referencia; el
 * evento no los copia (ADR-9).
 */
export interface EventoDeHistorial {
  evento: EventoUnidadInsumoEntity;
  equipoId: string | null;
  equipoNombre: string | null;
  sectorId: string | null;
  sectorNombre: string | null;
  /** El motivo del evento; si no lo tiene, el del movimiento referenciado. */
  motivo: string | null;
}

/**
 * ConsultarHistorialUnidadUseCase — la historia de una unidad, en orden
 * cronológico, desde que existe este cambio (no reconstruye nada anterior).
 *
 * Lectura sin lock: una foto. La unidad tiene que pertenecer al insumo de la
 * URL; si no, es `UnidadNoEncontradaError` (no se distingue "no existe" de "es de
 * otro insumo" para no filtrar ids ajenos).
 */
export class ConsultarHistorialUnidadUseCase {
  constructor(
    private readonly unidadRepo: Pick<
      IUnidadInsumoRepository,
      'findById' | 'nombresDeEquipos' | 'nombresDeSectores'
    >,
    private readonly eventoRepo: Pick<IEventoUnidadInsumoRepository, 'listarPorUnidad'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'listarPorIds'>,
  ) {}

  /**
   * @param insumoId Insumo de la URL.
   * @param unidadId Unidad cuyo historial se pide.
   * @returns Los eventos del más antiguo al más reciente; vacío si la unidad no tiene historia.
   */
  async execute(
    insumoId: string,
    unidadId: string,
  ): Promise<Result<EventoDeHistorial[], DomainError>> {
    const unidad = await this.unidadRepo.findById(unidadId);
    if (unidad === null || unidad.insumoId !== insumoId) {
      return Result.fail(new UnidadNoEncontradaError(unidadId));
    }

    const eventos = await this.eventoRepo.listarPorUnidad(unidadId);
    const movimientos = new Map(
      (
        await this.movimientoRepo.listarPorIds(
          eventos.map((e) => e.movimientoId).filter((id): id is string => id !== null),
        )
      ).map((m) => [m.id, m]),
    );

    const destinos = eventos.map((evento) => {
      const movimiento =
        evento.movimientoId !== null ? movimientos.get(evento.movimientoId) : undefined;
      return {
        evento,
        equipoId: evento.equipoId ?? movimiento?.equipoId ?? null,
        sectorId: movimiento?.sectorId ?? null,
        motivo: evento.motivo ?? movimiento?.motivo ?? null,
      };
    });

    const [equipos, sectores] = await Promise.all([
      this.unidadRepo.nombresDeEquipos(
        destinos.map((d) => d.equipoId).filter((id): id is string => id !== null),
      ),
      this.unidadRepo.nombresDeSectores(
        destinos.map((d) => d.sectorId).filter((id): id is string => id !== null),
      ),
    ]);

    return Result.ok(
      destinos.map((d) => ({
        ...d,
        equipoNombre: d.equipoId !== null ? (equipos.get(d.equipoId) ?? null) : null,
        sectorNombre: d.sectorId !== null ? (sectores.get(d.sectorId) ?? null) : null,
      })),
    );
  }
}
