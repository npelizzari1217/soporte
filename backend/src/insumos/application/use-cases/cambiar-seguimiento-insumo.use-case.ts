import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ConteosParaCambioDeSeguimiento, InsumoEntity } from '../../domain/entities/insumo.entity';
import { calcularSaldos } from '../../domain/entities/tipo-movimiento-insumo';
import type { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import {
  InsumoNoEncontradoError,
  UnidadMedidaInexistenteError,
} from '../../domain/errors/insumos.errors';
import { UnidadMedidaCambiadaError } from '../../domain/errors/unidades-medida.errors';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

export interface CambiarSeguimientoInsumoDto {
  insumoId: string;
  /** Seguimiento pedido: `SERIE` (activar) o `NINGUNO` (volver al stock por cantidad). */
  seguimiento: SeguimientoInsumo;
}

/**
 * CambiarSeguimientoInsumoUseCase — cambia el `seguimiento` de un insumo en
 * las dos direcciones (ADR-3 de sdd/repuestos-numero-de-serie).
 *
 * Toma los locks en el orden global de ADR-12, dentro de `txRunner.run()`:
 *
 * 1. Lectura SIN lock del `unidad_medida_id` (solo para saber qué fila de L0
 *    tomar).
 * 2. L0 `leerParaUso` (`FOR SHARE` de la unidad), solo al pasar a `SERIE`.
 * 3. L1 `bloquearParaCambioDeSeguimiento` (`FOR NO KEY UPDATE` del insumo):
 *    espera a toda transacción de stock en vuelo. Va ANTES de L2 a propósito:
 *    con una entrada en vuelo espera acá sin tener L2, y por eso no hay ciclo.
 * 4. Re-lectura (W1): si la unidad de medida de la lectura con L1 difiere de
 *    la del paso 1, otra edición comiteó en el medio y la validación de
 *    `entera` ya no vale: `UnidadMedidaCambiadaError` (409, reintentable). NO se
 *    toma L0 sobre la unidad nueva: sería un L0 después de L1.
 * 5. L2 `bloquearStock`.
 * 6. Conteos sobre la instantánea nueva (READ COMMITTED: cada sentencia ve lo
 *    comiteado hasta ese momento) y decisión de la entidad.
 *
 * Sin `throw` para los fallos esperados. Un `Result.fail` no escribió nada: la
 * transacción solo comitea los locks.
 */
export class CambiarSeguimientoInsumoUseCase {
  constructor(
    private readonly insumoRepo: Pick<
      IInsumoRepository,
      'findById' | 'bloquearParaCambioDeSeguimiento' | 'cambiarSeguimiento'
    >,
    private readonly unidadMedidaRepo: Pick<IUnidadMedidaRepository, 'leerParaUso'>,
    private readonly movimientoRepo: Pick<
      IMovimientoInsumoRepository,
      'bloquearStock' | 'sumByTipo'
    >,
    private readonly unidadRepo: Pick<IUnidadInsumoRepository, 'contarPorEstado'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @returns El insumo con su seguimiento vigente, o `InsumoNoEncontradoError`,
   *   `UnidadMedidaInexistenteError`, `UnidadMedidaCambiadaError` o
   *   `SeguimientoNoModificableError` (con el motivo).
   */
  async execute(dto: CambiarSeguimientoInsumoDto): Promise<Result<InsumoEntity, DomainError>> {
    return this.txRunner.run(async () => {
      // 1. Sin lock: solo decide qué fila de L0 tomar.
      const previo = await this.insumoRepo.findById(dto.insumoId);
      if (!previo || previo.isDeleted()) {
        return Result.fail<InsumoEntity, DomainError>(new InsumoNoEncontradoError(dto.insumoId));
      }

      // 2. L0: toda activación lee `entera` con la unidad bloqueada `FOR SHARE`.
      let unidadMedidaEntera = false;
      if (dto.seguimiento === 'SERIE') {
        const unidad = await this.unidadMedidaRepo.leerParaUso(previo.unidadMedidaId);
        if (!unidad) {
          return Result.fail<InsumoEntity, DomainError>(
            new UnidadMedidaInexistenteError(previo.unidadMedidaId),
          );
        }
        unidadMedidaEntera = unidad.entera;
      }

      // 3. L1.
      const bloqueado = await this.insumoRepo.bloquearParaCambioDeSeguimiento(dto.insumoId);
      if (!bloqueado) {
        return Result.fail<InsumoEntity, DomainError>(new InsumoNoEncontradoError(dto.insumoId));
      }

      // 4. W1: la unidad cambió entre la lectura sin lock y L1.
      if (dto.seguimiento === 'SERIE' && bloqueado.unidadMedidaId !== previo.unidadMedidaId) {
        return Result.fail<InsumoEntity, DomainError>(new UnidadMedidaCambiadaError(dto.insumoId));
      }

      // 5. L2.
      await this.movimientoRepo.bloquearStock(dto.insumoId);

      // 6. Instantánea nueva: la entidad y los conteos se leen con L1 y L2 en mano.
      const insumo = await this.insumoRepo.findById(dto.insumoId);
      if (!insumo || insumo.isDeleted()) {
        return Result.fail<InsumoEntity, DomainError>(new InsumoNoEncontradoError(dto.insumoId));
      }

      const conteos: ConteosParaCambioDeSeguimiento = {
        saldoTotal: 0,
        unidadesEnDeposito: 0,
        unidadesInstaladas: 0,
        unidadMedidaEntera,
      };
      if (dto.seguimiento === 'SERIE') {
        conteos.saldoTotal = calcularSaldos(
          await this.movimientoRepo.sumByTipo(dto.insumoId),
        ).total;
      } else {
        const porEstado = await this.unidadRepo.contarPorEstado(dto.insumoId);
        conteos.unidadesEnDeposito = porEstado.EN_DEPOSITO;
        conteos.unidadesInstaladas = porEstado.INSTALADA;
      }

      const puede = insumo.puedeCambiarSeguimiento(dto.seguimiento, conteos);
      if (puede.isFail()) {
        return Result.fail<InsumoEntity, DomainError>(puede.getError());
      }

      if (insumo.seguimiento !== dto.seguimiento) {
        await this.insumoRepo.cambiarSeguimiento(dto.insumoId, dto.seguimiento);
      }

      const actualizado = await this.insumoRepo.findById(dto.insumoId);
      return Result.ok<InsumoEntity, DomainError>(actualizado ?? insumo);
    });
  }
}
