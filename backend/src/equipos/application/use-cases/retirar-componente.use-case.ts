import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import {
  ComponenteEquipoEntity,
  DestinoRetiroComponente,
} from '../../domain/entities/componente-equipo.entity';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
} from '../../domain/errors/equipos.errors';

/**
 * Excepción de uso INTERNO de este archivo: envuelve el `DomainError` de una
 * ENTRADA fallida, o de una marca de retiro que tocó 0 filas, para que viaje
 * como EXCEPCIÓN dentro de la transacción y vuelva a ser `Result.fail` afuera.
 *
 * Mismo mecanismo y mismo motivo que `FalloSalidaDeStock` en
 * `InstalarComponenteDesdeDepositoUseCase`: `$transaction` solo revierte ante
 * una excepción, y `registrarDevolucionDeComponente` devuelve `Result` en vez
 * de lanzar. Sin este envoltorio, Postgres comitearía una ENTRADA sin el
 * componente retirado, o al revés.
 */
class FalloRetiroDeComponente extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`El retiro del componente falló: ${errorDeDominio.message}`);
    this.name = 'FalloRetiroDeComponente';
  }
}

/** DTO de entrada de `RetirarComponenteUseCase`. */
export interface RetirarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
  destino: DestinoRetiroComponente;
  /** Motivo crudo del usuario; el caso de uso lo normaliza. */
  motivo?: string | null;
  /** Quién retira. Lo pone el borde desde el usuario autenticado, nunca el body. */
  usuarioId: string;
}

/**
 * RetirarComponenteUseCase — sdd/stock-usado-componentes (ADR-4): retira un
 * componente de un equipo con dos desenlaces posibles. `STOCK_USADO` devuelve
 * la pieza al depósito como una ENTRADA USADO; `DESCARTE` solo da de baja el
 * componente y no toca stock.
 *
 * Fuera de la transacción: el componente existe y pertenece al equipo, está
 * activo y el motivo cumple la regla del destino.
 *
 * Dentro de `txRunner.run()`: con `STOCK_USADO` primero la ENTRADA (la FK de
 * `baja_movimiento_id` exige que el movimiento exista) y después la marca
 * condicional `WHERE deleted_at IS NULL`. Si la ENTRADA falla o la marca toca 0
 * filas (otro retiro llegó antes), se lanza `FalloRetiroDeComponente` para que
 * Postgres revierta la ENTRADA. Así dos retiros concurrentes dejan UNA sola
 * ENTRADA. Cualquier otra excepción propaga.
 */
export class RetirarComponenteUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'retirar'>,
    private readonly registrarEntrada: Pick<
      RegistrarEntradaInsumoUseCase,
      'registrarDevolucionDeComponente'
    >,
  ) {}

  async execute(dto: RetirarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const componente = await this.componenteRepo.findById(dto.componenteId);
    // Pertenencia: un componente de OTRO equipo se trata como no encontrado.
    if (!componente || componente.equipoId !== dto.equipoId) {
      return Result.fail(new ComponenteNoEncontradoError(dto.componenteId));
    }
    if (componente.isDeleted()) {
      return Result.fail(new ComponenteDadoDeBajaError(dto.componenteId));
    }

    const motivoResult = componente.validarRetiro(dto.destino, dto.motivo);
    if (motivoResult.isFail()) {
      return Result.fail(motivoResult.getError());
    }
    const motivo = motivoResult.getValue();

    try {
      return await this.txRunner.run(async () => {
        let bajaMovimientoId: string | null = null;

        if (dto.destino === 'STOCK_USADO') {
          const entrada = await this.registrarEntrada.registrarDevolucionDeComponente({
            insumoId: componente.insumoId,
            equipoId: dto.equipoId,
            usuarioId: dto.usuarioId,
            motivo,
          });
          if (entrada.isFail()) {
            throw new FalloRetiroDeComponente(entrada.getError());
          }
          bajaMovimientoId = entrada.getValue().id;
        }

        componente.retirar({
          destino: dto.destino,
          motivo,
          usuarioId: dto.usuarioId,
          bajaMovimientoId,
        });

        const marcado = await this.componenteRepo.retirar(componente);
        if (!marcado) {
          // Otro retiro comiteó primero: revertir la ENTRADA de este.
          throw new FalloRetiroDeComponente(new ComponenteDadoDeBajaError(componente.id));
        }

        return Result.ok<ComponenteEquipoEntity, DomainError>(componente);
      });
    } catch (error) {
      if (error instanceof FalloRetiroDeComponente) {
        return Result.fail(error.errorDeDominio);
      }
      throw error;
    }
  }
}
