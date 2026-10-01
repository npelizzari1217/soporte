import { DomainError, Result } from '../../../shared/domain/result';
import { ESTADOS_TERMINALES } from '../../../tickets/domain/state-machine/estados.constants';
import { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { CausaPiezaNoDevolvible } from '../../../insumos/application/services/clasificar-pieza-devuelta';
import {
  normalizarSerial,
  SeguimientoInsumo,
  UNIDAD_SERIAL_MAX_LENGTH,
} from '../../../insumos/domain/entities/unidad-insumo.entity';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import {
  CATEGORIAS_BAJA_EQUIPO,
  CategoriaBajaEquipo,
  largoMaximoTextoBaja,
} from '../../domain/entities/equipo-informatico.entity';
import { EquipoDadoDeBajaError, EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';

/** DTO de entrada de `ResumenBajaEquipoUseCase`. */
export interface ResumenBajaEquipoDto {
  equipoId: string;
}

/** Una pieza activa del equipo, tal como la necesita el diálogo de baja. */
export interface PiezaResumenBaja {
  componenteId: string;
  descripcion: string | null;
  insumoId: string | null;
  insumoNombre: string | null;
  unidadId: string | null;
  /** Con unidad, el serial de la unidad; si no, el serial de texto del componente. */
  numeroSerie: string | null;
  seguimiento: SeguimientoInsumo;
  /** `true` para un legado (sin unidad) de un insumo hoy `SERIE`: la baja con `STOCK_USADO` exige su serial. */
  requiereSerial: boolean;
  /** Serial de texto válido (recortado, 1–255) de un legado `SERIE` para precargar el campo, o `null`. */
  serialSugerido: string | null;
  /**
   * Causa que impediría devolver la pieza al depósito con `STOCK_USADO`, calculada con el
   * `serialSugerido` como serial informado; `null` si puede volver.
   */
  causaQueImpideDevolver: CausaPiezaNoDevolvible | null;
}

/** Resultado del resumen previo a la baja. */
export interface ResumenBajaEquipo {
  equipoId: string;
  nombre: string;
  ticketsAbiertos: number;
  /** Espacio disponible para el texto libre, por categoría (el mismo número que valida la baja). */
  largoMaximoTexto: Record<CategoriaBajaEquipo, number>;
  piezas: PiezaResumenBaja[];
}

/**
 * ResumenBajaEquipoUseCase — sdd/baja-equipo-completo (R7, R10, R14): lo que el diálogo de baja
 * muestra antes de confirmar. Solo lectura, FUERA de transacción y sin locks: es informativo, y
 * una carrera con otra operación la resuelve la baja misma (que revalida bajo lock).
 */
export class ResumenBajaEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findActiveByEquipoId'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'contarAbiertosPorEquipo'>,
    private readonly registrarEntrada: Pick<
      RegistrarEntradaInsumoUseCase,
      'diagnosticarDevolucionesDeEquipo'
    >,
  ) {}

  async execute(dto: ResumenBajaEquipoDto): Promise<Result<ResumenBajaEquipo, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }
    if (!equipo.activo) {
      return Result.fail(new EquipoDadoDeBajaError(dto.equipoId));
    }

    const componentes = await this.componenteRepo.findActiveByEquipoId(dto.equipoId);
    const insumos = new Map<string, { nombre: string; seguimiento: SeguimientoInsumo }>();
    for (const insumoId of new Set(componentes.map((c) => c.insumoId))) {
      const insumo = await this.insumoRepo.findById(insumoId);
      if (insumo) insumos.set(insumoId, { nombre: insumo.nombre, seguimiento: insumo.seguimiento });
    }

    const base = componentes.map((c) => {
      const insumo = insumos.get(c.insumoId);
      const seguimiento = insumo?.seguimiento ?? 'NINGUNO';
      const requiereSerial = c.unidadId === null && seguimiento === 'SERIE';
      return {
        componente: c,
        insumoNombre: insumo?.nombre ?? null,
        seguimiento,
        requiereSerial,
        serialSugerido: requiereSerial ? serialValido(c.numeroSerie) : null,
      };
    });

    // El diagnóstico es el de la baja (mismo clasificador): sin seriales informados, el legado
    // `SERIE` se evalúa con el serial sugerido.
    const causas = await this.registrarEntrada.diagnosticarDevolucionesDeEquipo(
      base.map((b) => ({
        componenteId: b.componente.id,
        insumoId: b.componente.insumoId,
        unidadId: b.componente.unidadId,
        numeroSerie: b.componente.unidadId === null ? b.serialSugerido : null,
      })),
    );
    const causaPorComponente = new Map<string, CausaPiezaNoDevolvible>();
    for (const causa of causas) {
      if (!causaPorComponente.has(causa.componenteId)) {
        causaPorComponente.set(causa.componenteId, causa.causa);
      }
    }

    const ticketsAbiertos = await this.ticketSoporteRepo.contarAbiertosPorEquipo(dto.equipoId, [
      ...ESTADOS_TERMINALES,
    ]);

    const largoMaximoTexto = Object.fromEntries(
      CATEGORIAS_BAJA_EQUIPO.map((categoria) => [
        categoria,
        largoMaximoTextoBaja(equipo.nombre, categoria),
      ]),
    ) as Record<CategoriaBajaEquipo, number>;

    return Result.ok({
      equipoId: equipo.id,
      nombre: equipo.nombre,
      ticketsAbiertos,
      largoMaximoTexto,
      piezas: base.map((b) => ({
        componenteId: b.componente.id,
        descripcion: b.componente.descripcion,
        insumoId: b.componente.insumoId,
        insumoNombre: b.insumoNombre,
        unidadId: b.componente.unidadId,
        numeroSerie: b.componente.numeroSerie,
        seguimiento: b.seguimiento,
        requiereSerial: b.requiereSerial,
        serialSugerido: b.serialSugerido,
        causaQueImpideDevolver: causaPorComponente.get(b.componente.id) ?? null,
      })),
    });
  }
}

/** Serial de texto utilizable para precargar: recortado, no vacío y dentro del tope (también normalizado). */
function serialValido(numeroSerie: string | null): string | null {
  const recortado = numeroSerie?.trim() ?? '';
  if (recortado === '') return null;
  if (
    recortado.length > UNIDAD_SERIAL_MAX_LENGTH ||
    normalizarSerial(recortado).length > UNIDAD_SERIAL_MAX_LENGTH
  ) {
    return null;
  }
  return recortado;
}
