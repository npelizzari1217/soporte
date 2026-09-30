import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import { UnidadNoEncontradaError } from '../../domain/errors/unidades-insumo.errors';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';
import type { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';

export interface CargarSerialUnidadDto {
  insumoId: string;
  unidadId: string;
  numeroSerie: string;
  usuarioId: string;
}

/**
 * CargarSerialUnidadUseCase — completa el serial de una unidad pendiente.
 *
 * Corre en una transacción y delega en `OperacionesUnidadInsumo.cargarSerial`,
 * cuya primera lectura es L1 (la fila del insumo) y sigue con L2 y L3 en el
 * orden de ADR-12. Antes de delegar solo hay una lectura sin lock para verificar
 * que la unidad es del insumo de la URL (el `insumoId` de una unidad no cambia).
 * Un serial repetido llega como `FalloOperacionDeUnidad` (P2002) y se
 * desenvuelve AFUERA del `run()`, ya revertida la transacción.
 */
export class CargarSerialUnidadUseCase {
  constructor(
    private readonly unidadRepo: Pick<IUnidadInsumoRepository, 'findById'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'cargarSerial'>,
  ) {}

  /**
   * @param dto Unidad, serial crudo y usuario que firma.
   * @returns La unidad con el serial cargado; o el error de dominio que corresponda.
   */
  async execute(dto: CargarSerialUnidadDto): Promise<Result<UnidadInsumoEntity, DomainError>> {
    try {
      return await this.txRunner.run(async () => {
        const foto = await this.unidadRepo.findById(dto.unidadId);
        if (foto === null || foto.insumoId !== dto.insumoId) {
          return Result.fail<UnidadInsumoEntity, DomainError>(
            new UnidadNoEncontradaError(dto.unidadId),
          );
        }
        return this.operaciones.cargarSerial(dto.unidadId, dto.numeroSerie, {
          usuarioId: dto.usuarioId,
        });
      });
    } catch (error) {
      if (error instanceof FalloOperacionDeUnidad) return Result.fail(error.errorDeDominio);
      throw error;
    }
  }
}
