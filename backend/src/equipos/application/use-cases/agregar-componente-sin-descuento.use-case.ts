import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { FalloOperacionDeUnidad } from '../../../insumos/domain/errors/fallo-operacion-de-unidad';
import { CondicionStock } from '../../../insumos/domain/entities/tipo-movimiento-insumo';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { UnidadConAltaSinDescuentoError } from '../../domain/errors/equipos.errors';

/** Entrada del alta sin descuento. Sin `unidadId`: ver `UnidadConAltaSinDescuentoError`. */
export interface AgregarComponenteSinDescuentoDto {
  equipoId: string;
  insumoId: string;
  /** Quien da el alta; firma el evento `ALTA_INSTALADA`. Sale de `JWT.sub`. */
  usuarioId: string;
  descripcion?: string | null;
  /** Insumo `SERIE`: serial de la unidad que nace (obligatorio). Con `NINGUNO`: texto libre del componente, como siempre. */
  numeroSerie?: string | null;
  capacidad?: string | null;
  /** Condición de la unidad que nace. Solo rige con insumo `SERIE`; con `NINGUNO` se ignora. Omitida = `NUEVO`. */
  condicion?: CondicionStock;
  /** Siempre se rechaza: el borde lo pasa para que el rechazo sea explícito y no un descarte silencioso. */
  unidadId?: string | null;
}

/**
 * AgregarComponenteSinDescuentoUseCase — alta de un componente con
 * `descontarStock: false` (sdd/repuestos-numero-de-serie, D3 / ADR-7).
 *
 * - Insumo `NINGUNO`: el alta de siempre (`preparar()` + `save()`), sin cambios.
 * - Insumo `SERIE`: el componente es una pieza física que ya está instalada, así
 *   que su unidad nace `INSTALADA` con el serial indicado y sin movimiento (el
 *   saldo no cambia). Todo en UNA transacción y en el orden de la invariante de
 *   locks L (ADR-12): `preparar()` → `operaciones.altaInstalada()` (L1 a L3,
 *   escribe unidad y evento `ALTA_INSTALADA`) → `save()` del componente (L4).
 *
 * `unidadId` con `descontarStock: false` se RECHAZA (`UnidadConAltaSinDescuentoError`):
 * descartarlo en silencio dejaría al usuario creyendo que instaló la unidad que eligió.
 *
 * Un serial repetido llega como `FalloOperacionDeUnidad` (P2002), que se lanza dentro
 * de `run()` para revertir el alta y se desenvuelve afuera como `Result.fail`.
 */
export class AgregarComponenteSinDescuentoUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly agregarComponenteUseCase: Pick<AgregarComponenteUseCase, 'preparar'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'altaInstalada'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'save' | 'findById'>,
  ) {}

  async execute(
    dto: AgregarComponenteSinDescuentoDto,
  ): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    if (dto.unidadId) {
      return Result.fail(new UnidadConAltaSinDescuentoError(dto.unidadId));
    }
    try {
      return await this.txRunner.run(() => this.alta(dto));
    } catch (error) {
      // Solo el fallo de negocio de la unidad (serial repetido); lo demás sigue propagando.
      if (error instanceof FalloOperacionDeUnidad) {
        return Result.fail(error.errorDeDominio);
      }
      throw error;
    }
  }

  private async alta(
    dto: AgregarComponenteSinDescuentoDto,
  ): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const preparado = await this.agregarComponenteUseCase.preparar({
      equipoId: dto.equipoId,
      insumoId: dto.insumoId,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    });
    if (preparado.isFail()) {
      return Result.fail(preparado.getError());
    }
    const componente = preparado.getValue();

    // `preparar()` ya validó que el insumo existe, está activo y es un repuesto.
    const insumo = await this.insumoRepo.findById(dto.insumoId);
    if (insumo?.seguimiento !== 'SERIE') {
      await this.componenteRepo.save(componente);
      return Result.ok(componente);
    }

    const unidad = await this.operaciones.altaInstalada(
      dto.insumoId,
      dto.numeroSerie ?? '',
      dto.equipoId,
      {
        usuarioId: dto.usuarioId,
        condicion: dto.condicion ?? 'NUEVO',
        componenteId: componente.id,
      },
    );
    if (unidad.isFail()) {
      // Un `Result.fail` de la operación no escribió nada: se devuelve tal cual.
      return Result.fail(unidad.getError());
    }

    componente.vincularUnidad(unidad.getValue().id);
    await this.componenteRepo.save(componente);

    // La respuesta lleva el serial resuelto de la unidad (mapper, ADR-7).
    return Result.ok((await this.componenteRepo.findById(componente.id)) ?? componente);
  }
}
