import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';

/**
 * DTO de entrada de `AgregarItemCompraUseCase`. `usuarioId` es el `sub` del
 * JWT del actor que agrega el ítem — estampa la `OperacionCompra{ITEM_AGREGADO}`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.2 (S4, S5).
 */
export interface AgregarItemCompraDto {
  compraId: string;
  usuarioId: string;
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: Date;
  observaciones?: string | null;
}

/**
 * AgregarItemCompraUseCase — agrega un ítem a una compra existente (§4.2,
 * S4, S5).
 *
 * Flujo — TODO dentro de la MISMA transacción (`ITenantTransactionRunner.run`,
 * regla transversal de la Fase D): a diferencia de `CrearCompraUseCase`
 * (donde la resolución del ciclo es un agregado DISTINTO y de solo lectura,
 * fail-fast fuera de la tx), acá la lectura (`findByIdConItems`) y la
 * escritura (`guardar`/`guardarItem`) operan sobre el MISMO agregado
 * `Compra` — mantenerlas en la misma transacción evita que otra request
 * mute la compra entre la lectura y la escritura.
 *
 * 1. Carga el agregado completo (`findByIdConItems`) — 404
 *    (`CompraNoEncontradaError`) si no existe o está soft-deleted.
 * 2. `CompraEntity.agregarItem()` (ADR-C1): el ítem nace `PENDIENTE` con
 *    cantidades en 0; si la compra estaba `APROBADO`/`RECHAZADO` vuelve a
 *    `PENDIENTE` por T2 — el caso de uso NO reimplementa esa lógica, solo
 *    traduce el `Result` de la entidad (S5: `CompraCanceladaError` si la
 *    compra ya está cancelada, sin persistir nada).
 * 3. Persiste la cabecera (su `updatedAt` cambió) y el ítem nuevo, y
 *    registra EXACTAMENTE 1 `OperacionCompra{ITEM_AGREGADO}` (S35) — si
 *    `registrar()` lanza, `txRunner.run` revierte TODO (S36, ADR-C4).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S4, S5), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C4. Tarea: PR-14.
 */
export class AgregarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<
      ICompraRepository,
      'findByIdConItems' | 'guardar' | 'guardarItem'
    >,
    private readonly registrarOperacion: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AgregarItemCompraDto): Promise<Result<CompraEntity, DomainError>> {
    return this.txRunner.run(async () => {
      const compra = await this.compraRepo.findByIdConItems(dto.compraId);
      if (!compra || compra.isDeleted()) {
        return Result.fail<CompraEntity, DomainError>(new CompraNoEncontradaError(dto.compraId));
      }

      const agregarResult = compra.agregarItem({
        descripcion: dto.descripcion,
        cantidad: dto.cantidad,
        proveedor: dto.proveedor,
        monto: dto.monto,
        moneda: dto.moneda,
        fechaCotizacion: dto.fechaCotizacion,
        observaciones: dto.observaciones ?? null,
      });
      if (agregarResult.isFail()) {
        return Result.fail<CompraEntity, DomainError>(agregarResult.getError());
      }

      // `agregarItem` hace push al final de `_items` — el último elemento de
      // la copia de solo lectura es siempre el ítem recién creado.
      const nuevoItem = compra.items[compra.items.length - 1];

      await this.compraRepo.guardar(compra);
      await this.compraRepo.guardarItem(nuevoItem);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: nuevoItem.id,
        tipo: 'ITEM_AGREGADO',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${nuevoItem.descripcion}" agregado.`,
        datos: null,
      });

      return Result.ok<CompraEntity, DomainError>(compra);
    });
  }
}
