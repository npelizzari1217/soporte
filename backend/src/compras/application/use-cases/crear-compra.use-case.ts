import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { NumeradorCompra } from '../../domain/services/numerador-compra';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { ResolverCicloActivoCompra } from '../services/resolver-ciclo-activo-compra.service';

/**
 * DTO de entrada de `CrearCompraUseCase`.
 *
 * - `solicitanteId`: `sub` del JWT (spec §4.1, S1 — "solicitanteId =
 *   JWT.sub"). Se usa TANTO para estampar la cabecera de la compra COMO
 *   `usuarioId` de la `OperacionCompra{CREACION}` — a diferencia de
 *   `CrearTicketDto` (que distingue `solicitanteId`/`autorId`), la spec de
 *   compras no describe un actor distinto al solicitante para la creación.
 * - `anio`: resuelto por el controller (server-side, PR-21), nunca por el
 *   cliente HTTP — año en curso para el numerador (ADR-C5).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.1 (S1).
 */
export interface CrearCompraDto {
  motivo: string;
  descripcion?: string | null;
  fechaSolicitud: Date;
  solicitanteId: string;
  anio: number;
  /** Sector de destino (WU-09, R11) — opcional, sin backfill (S66). */
  sectorId?: string | null;
}

/**
 * CrearCompraUseCase — creación de una compra nueva (§4.1, S1, S2).
 *
 * Flujo:
 * 1. Resuelve el ciclo ACTIVO del tenant (`ResolverCicloActivoCompra`,
 *    propio de `compras/` — reusa el puerto `ICicloClienteRepository` de
 *    `tickets/` porque es la misma tabla `CicloCliente` compartida, pero
 *    traduce "sin ciclo activo" al `SinCicloActivoError` de
 *    `compras/domain/errors`, no al de `tickets/`; ver el JSDoc de
 *    `ResolverCicloActivoCompra` para el porqué). Corre ANTES de la
 *    transacción y ANTES de tocar el numerador: si no hay ciclo activo,
 *    `SinCicloActivoError` (S2) se retorna sin abrir `txRunner.run` ni
 *    consumir la secuencia del numerador — mismo criterio que
 *    `CrearTicketUseCase` (fail-fast en validaciones de solo lectura).
 * 2. **DENTRO de la transacción** (`ITenantTransactionRunner.run`, ADR-C5):
 *    genera el `numero` (`NumeradorCompra.generarNumero`, que internamente
 *    adquiere el advisory lock vía `findLastSecuencia`), crea `CompraEntity`
 *    (nace sin ítems -> `PENDIENTE` por T1), persiste la cabecera y registra
 *    EXACTAMENTE 1 `OperacionCompra{CREACION}` (S35) — si `registrar()`
 *    lanza, `txRunner.run` revierte TODO (S36, ADR-C4).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1 (S1, S2), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4, ADR-C5. Tarea: PR-14.
 */
export class CrearCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'guardar'>,
    private readonly numerador: Pick<NumeradorCompra, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoCompra, 'resolver'>,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearCompraDto): Promise<Result<CompraEntity, DomainError>> {
    // 1. Ciclo ACTIVO del tenant — el servidor lo determina, nunca el
    //    cliente (S1). Corre ANTES de la tx: S2 exige que el numerador NO
    //    se consuma si la creación va a fallar.
    const cicloResult = await this.resolverCicloActivo.resolver();
    if (cicloResult.isFail()) {
      return Result.fail(cicloResult.getError());
    }
    const cicloActivo = cicloResult.getValue();

    // 2. Sección crítica: numeración (advisory lock, ADR-C5) + persistencia
    //    + bitácora, atómica en la MISMA transacción.
    return this.txRunner.run(async () => {
      const numeroResult = await this.numerador.generarNumero(dto.anio);
      if (numeroResult.isFail()) {
        return Result.fail<CompraEntity, DomainError>(numeroResult.getError());
      }

      const compra = CompraEntity.create({
        numero: numeroResult.getValue(),
        fechaSolicitud: dto.fechaSolicitud,
        motivo: dto.motivo,
        descripcion: dto.descripcion ?? null,
        solicitanteId: dto.solicitanteId,
        cicloId: cicloActivo.id,
        sectorId: dto.sectorId ?? null,
      });

      await this.compraRepo.guardar(compra);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: null,
        tipo: 'CREACION',
        usuarioId: dto.solicitanteId,
        detalle: `Compra "${compra.numero}" creada.`,
        datos: null,
      });

      return Result.ok<CompraEntity, DomainError>(compra);
    });
  }
}
