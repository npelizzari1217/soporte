import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/** DTO de entrada para cerrar con faltante un ítem de compra (§4.7, S22-S25). */
export interface CerrarItemConFaltanteDto {
  compraId: string;
  itemId: string;
  /** Actor que ejecuta el cierre (`JWT.sub` con `compra:gestionar`) — autor de la operación de bitácora. */
  usuarioId: string;
  /** Motivo del faltante (S24: obligatorio, no vacío). */
  motivo: string;
}

/**
 * CerrarItemConFaltanteUseCase — cierra un ítem de compra con faltante
 * (§4.7, req 9).
 *
 * S22-S25 YA están resueltos en `ItemCompraEntity.cerrarConFaltante()`: este
 * caso de uso NO re-implementa la tabla de verdad ni el orden de guards
 * (terminalidad S25 primero, motivo S24, faltante real S23) — solo invoca la
 * entidad y traduce el `Result`.
 *
 * S22 (la cláusula OR): el cierre marca `comprado` **y** `entregado` en
 * `true` pese a que `cantidadComprada < cantidad` — es un efecto de los
 * getters derivados de `ItemCompraEntity` (`itemComprado`/`itemEntregado`,
 * ADR-C1), no algo que este caso de uso fuerce a mano. Si el ítem cerrado
 * era el último aprobado pendiente de la compra, la cabecera pasa a
 * `cerrado=true` de la MISMA forma: es un getter derivado
 * (`CompraEntity.cerrado` -> `derivarEstadoCompra`), no una columna que este
 * caso de uso deba persistir — por eso no se llama `compraRepo.guardar()`
 * acá (mismo criterio que `AprobarItemCompraUseCase`/`RechazarItemCompraUseCase`:
 * la cabecera nunca se persiste para un cambio derivado de sus ítems).
 *
 * S25 TERMINALIDAD: `cerradoConFaltante` es un estado sin retorno — la
 * entidad bloquea NO SÓLO un segundo cierre (`ItemCompraYaCerradoError` acá),
 * sino también cualquier `registrarCompra`/`registrarEntrega` posterior
 * sobre ese ítem (guard `asegurarNoCerrado()`, compartido por los tres
 * métodos de `ItemCompraEntity`). Ese efecto colateral no pasa por este
 * caso de uso — vive enteramente en la entidad, y se prueba directo contra
 * ella en el spec (no hay `RegistrarCompraDeItemUseCase`/
 * `RegistrarEntregaDeItemUseCase` en este PR: PR-17, en paralelo).
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems -> `CompraNoEncontradaError` si no existe.
 * 2. Guarda de "compra cancelada" (`compra.canceladaEn !== null`) ->
 *    `CompraCanceladaError`, ANTES de buscar el ítem y SIN entrar a la
 *    transacción. Guard de remediación (mismo criterio que
 *    `AprobarItemCompraUseCase`/`RechazarItemCompraUseCase`): S29 prohíbe
 *    cancelar una compra con algún ítem `cantidadComprada > 0` (el camino
 *    correcto ahí ES cerrar con faltante), pero si se pudiera cerrar un
 *    ítem con faltante DESPUÉS de cancelar la compra, se llegaría por la
 *    puerta de atrás al mismo estado que S29 existe para impedir — el
 *    invariante quedaría burlado. No requiere tocar `CompraEntity`:
 *    `canceladaEn` es un getter público y `asegurarNoCancelada()` es
 *    privado y exclusivo del ABM (`agregarItem`/`editarItem`/`eliminarItem`).
 * 3. Busca el ítem ACTIVO (no soft-deleted) dentro del agregado ->
 *    `ItemCompraNoEncontradoError` si no está.
 * 4. `item.cerrarConFaltante(motivo)` — si falla (terminalidad, motivo
 *    vacío, o sin faltante real), retorna el error SIN mutar ningún campo y
 *    SIN entrar a la transacción — ni `guardarItem` ni la bitácora se
 *    llaman.
 * 5. Si el cierre es válido: DENTRO de la transacción
 *    (`ITenantTransactionRunner.run`), persiste el ítem y registra la
 *    operación `ITEM_CERRADO_CON_FALTANTE` (S35: exactamente 1 por mutación
 *    exitosa).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.7 (S22-S25), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C4. Tarea: PR-18 + guard de remediación
 * (compra cancelada en cierre con faltante).
 */
export class CerrarItemConFaltanteUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardarItem'>,
    private readonly registrarOperacionCompra: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: CerrarItemConFaltanteDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    if (compra.canceladaEn !== null) {
      return Result.fail(new CompraCanceladaError(compra.id));
    }

    const item = compra.items.find((i) => i.id === dto.itemId && !i.isDeleted());
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    const cierre = item.cerrarConFaltante(dto.motivo);
    if (cierre.isFail()) {
      return Result.fail(cierre.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardarItem(item);
      await this.registrarOperacionCompra.registrar({
        compraId: dto.compraId,
        itemCompraId: item.id,
        tipo: 'ITEM_CERRADO_CON_FALTANTE',
        usuarioId: dto.usuarioId,
        detalle: `Ítem "${item.descripcion}" cerrado con faltante: ${dto.motivo}`,
        datos: null,
      });
    });

    return Result.ok(item);
  }
}
