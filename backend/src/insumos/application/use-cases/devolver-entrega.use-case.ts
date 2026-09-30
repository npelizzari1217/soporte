import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { UnidadNoEncontradaError } from '../../domain/errors/unidades-insumo.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';
import type { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';
import {
  LectorCatalogoFamilias,
  validarCondicionAdmitida,
  validarInsumoElegible,
} from '../services/validar-insumo.service';

export interface DevolverEntregaDto {
  insumoId: string;
  unidadId: string;
  condicion: CondicionStock;
  motivo?: string | null;
  usuarioId: string;
}

/**
 * DevolverEntregaUseCase — una unidad `ENTREGADA` vuelve al depósito con la
 * condición que elige el usuario (ADR-13).
 *
 * Corre en una transacción y respeta el orden de ADR-12: L1 (la fila del
 * insumo) antes que nada, luego `operaciones.devolverEntregas` toma L2 y L3 y
 * escribe la ENTRADA de cantidad 1 y el evento `DEVOLUCION_DE_ENTREGA`.
 *
 * **La exención de G2 es de ESTE caso de uso y de ningún otro**: la pieza
 * existe físicamente, así que se admite el insumo deshabilitado (nunca uno
 * inexistente o dado de baja) y la familia dada de baja o deshabilitada
 * (`esRepuesto = false` con USADO sí rechaza). Igual que
 * `registrarDevolucionDeComponente`, la exención no es un campo del DTO: la
 * ENTRADA y el AJUSTE manuales no la reciben.
 */
export class DevolverEntregaUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'leerSeguimientoParaMovimiento'
    >,
    private readonly unidadRepo: Pick<IUnidadInsumoRepository, 'findById'>,
    private readonly familiaRepo: LectorCatalogoFamilias,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'devolverEntregas'>,
  ) {}

  /**
   * @param dto Insumo y unidad de la URL, condición elegida, motivo opcional y usuario que firma.
   * @returns La ENTRADA registrada; o el error de dominio que corresponda, sin haber cambiado nada.
   */
  async execute(dto: DevolverEntregaDto): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    try {
      return await this.txRunner.run(() => this.devolverBajoL1(dto));
    } catch (error) {
      if (error instanceof FalloOperacionDeUnidad) return Result.fail(error.errorDeDominio);
      throw error;
    }
  }

  private async devolverBajoL1(
    dto: DevolverEntregaDto,
  ): Promise<Result<MovimientoInsumoEntity, DomainError>> {
    // L1 primero: esta lectura toma FOR SHARE sobre la fila del insumo.
    const seguimiento = await this.insumoRepo.leerSeguimientoParaMovimiento(dto.insumoId);
    if (seguimiento === null) return Result.fail(new InsumoNoEncontradoError(dto.insumoId));

    const foto = await this.unidadRepo.findById(dto.unidadId);
    if (foto === null || foto.insumoId !== dto.insumoId) {
      return Result.fail(new UnidadNoEncontradaError(dto.unidadId));
    }

    // Exención G2: sin `exigirHabilitado`; el insumo sigue debiendo existir y estar vigente.
    const elegible = await validarInsumoElegible(this.insumoRepo, dto.insumoId);
    if (elegible.isFail()) return Result.fail(elegible.getError());

    const admitida = await validarCondicionAdmitida(
      this.familiaRepo,
      elegible.getValue(),
      dto.condicion,
      { admitirFamiliaNoVigente: true },
    );
    if (admitida.isFail()) return Result.fail(admitida.getError());

    const devueltas = await this.operaciones.devolverEntregas(dto.insumoId, [dto.unidadId], {
      usuarioId: dto.usuarioId,
      motivo: dto.motivo ?? null,
      condicion: dto.condicion,
    });
    if (devueltas.isFail()) return Result.fail(devueltas.getError());

    return Result.ok(devueltas.getValue()[0].movimiento);
  }
}
