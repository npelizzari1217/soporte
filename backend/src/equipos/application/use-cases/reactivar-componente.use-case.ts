import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  ComponenteDevueltoAlStockError,
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  UnidadDelComponenteNoDisponibleError,
} from '../../domain/errors/equipos.errors';

/**
 * Se lanza dentro de la transacción para que Postgres revierta lo ya escrito (la reinstalación de
 * la unidad) cuando la marca condicional no toca la fila. `execute` la convierte en `Result.fail`.
 */
class FalloReactivacionDeComponente extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`La reactivación del componente falló: ${errorDeDominio.message}`);
    this.name = 'FalloReactivacionDeComponente';
  }
}

/** DTO de entrada para reactivar un componente de equipo dado de baja. */
export interface ReactivarComponenteDto {
  /** Equipo dueño (de la URL) — se valida que el componente le pertenezca. */
  equipoId: string;
  componenteId: string;
  /** Quién reactiva (firma el evento `REACTIVACION` de la unidad). Lo pone el borde desde el JWT. */
  usuarioId: string;
}

/**
 * ReactivarComponenteUseCase — revierte la baja lógica (soft delete) de un
 * componente de equipo (listado enriquecido de componentes).
 *
 * Flujo:
 * 1. Carga el componente → `ComponenteNoEncontradoError` si no existe.
 * 2. Si ya está activo → `ComponenteYaActivoError` (mismo criterio que
 *    `RetirarComponenteUseCase` rechaza el retiro de algo ya dado de baja).
 * 3. Si volvió al stock como USADO (`bajaDestino === 'STOCK_USADO'`) →
 *    `ComponenteDevueltoAlStockError`: reactivarlo lo contaría dos veces.
 * 4. Dentro de `txRunner.run()`, primero el lock LE `FOR SHARE` del equipo
 *    (`bloquearParaOperarPiezas`, ADR-2): inexistente o borrado → `EquipoNoEncontradoError`;
 *    dado de baja → `EquipoDadoDeBajaError` sin tocar el componente ni la unidad
 *    (baja-equipo-completo R11). Después, con unidad, en este orden (ADR-12, el componente es
 *    L4 y va último): `operaciones.reinstalar` (L1, L2, L3; la unidad vuelve a
 *    `INSTALADA` solo si su último evento es el `DESCARTE` de este componente) y
 *    después `reactivar()` + la marca condicional del repositorio (CAS: solo toca la fila si
 *    sigue dada de baja y no volvió al stock; si no, revierte y devuelve el error que
 *    corresponda al estado actual). Una unidad recuperada o movida por otra vía
 *    ⇒ `UnidadDelComponenteNoDisponibleError`; un insumo que ya no es `SERIE` ⇒
 *    `SeguimientoNoModificableError`. Ninguna escribe nada antes de fallar.
 * 5. Sin unidad (retiro legado, o de un insumo `NINGUNO`): `reactivar()` y la misma marca
 *    condicional. Vale para un `DESCARTE` y para un retiro legado (sin destino).
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (listado enriquecido de
 * componentes — reactivar).
 */
export class ReactivarComponenteUseCase {
  constructor(
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'reactivar'>,
    private readonly operaciones: Pick<OperacionesUnidadInsumo, 'reinstalar'>,
  ) {}

  async execute(dto: ReactivarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const componente = await this.componenteRepo.findById(dto.componenteId);
    // Pertenencia: un componente de OTRO equipo se trata como no encontrado.
    if (!componente || componente.equipoId !== dto.equipoId) {
      return Result.fail(new ComponenteNoEncontradoError(dto.componenteId));
    }
    if (!componente.isDeleted()) {
      return Result.fail(new ComponenteYaActivoError(dto.componenteId));
    }

    if (componente.bajaDestino === 'STOCK_USADO') {
      return Result.fail(new ComponenteDevueltoAlStockError(dto.componenteId));
    }

    try {
      return await this.txRunner.run(async () => {
        // LE `FOR SHARE` (ADR-2): primer lock de la transacción, antes de cualquier lock de insumos.
        // Un equipo dado de baja no admite reactivar sus piezas (R11): la baja ya las devolvió o
        // descartó. Falla sin escribir, así que devolver el `Result.fail` es seguro.
        const equipo = await this.equipoRepo.bloquearParaOperarPiezas(dto.equipoId);
        if (!equipo || equipo.isDeleted()) {
          return Result.fail<ComponenteEquipoEntity, DomainError>(
            new EquipoNoEncontradoError(dto.equipoId),
          );
        }
        if (!equipo.activo) {
          return Result.fail<ComponenteEquipoEntity, DomainError>(
            new EquipoDadoDeBajaError(dto.equipoId),
          );
        }

        if (componente.unidadId !== null) {
          const reinstalada = await this.operaciones.reinstalar(
            [
              {
                unidadId: componente.unidadId,
                equipoId: dto.equipoId,
                componenteId: componente.id,
                insumoId: componente.insumoId,
              },
            ],
            { usuarioId: dto.usuarioId },
          );
          if (reinstalada.isFail()) {
            const error = reinstalada.getError();
            // El servicio de insumos tiene su propia clase (insumos no importa equipos):
            // misma condición y mismo `code`, así que se traduce por `code`.
            return Result.fail<ComponenteEquipoEntity, DomainError>(
              error.code === 'UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE'
                ? new UnidadDelComponenteNoDisponibleError(componente.id)
                : error,
            );
          }
        }

        componente.reactivar();
        const marcado = await this.componenteRepo.reactivar(componente);
        if (!marcado) {
          // Entre la lectura y el guardado otro cambió el componente: revertir la reinstalación.
          throw new FalloReactivacionDeComponente(await this.errorPorEstadoActual(componente.id));
        }
        return Result.ok<ComponenteEquipoEntity, DomainError>(componente);
      });
    } catch (error) {
      if (error instanceof FalloReactivacionDeComponente) {
        return Result.fail(error.errorDeDominio);
      }
      throw error;
    }
  }

  /** Error que corresponde al estado del componente cuando la marca condicional no tocó la fila. */
  private async errorPorEstadoActual(componenteId: string): Promise<DomainError> {
    const actual = await this.componenteRepo.findById(componenteId);
    if (!actual) return new ComponenteNoEncontradoError(componenteId);
    if (actual.isDeleted() && actual.bajaDestino === 'STOCK_USADO') {
      return new ComponenteDevueltoAlStockError(componenteId);
    }
    return new ComponenteYaActivoError(componenteId);
  }
}
