import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import {
  LectorCatalogoInsumos,
  validarInsumoElegible,
} from '../../../insumos/application/services/validar-insumo.service';

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
  /**
   * Insumo del catálogo que este ítem compra (insumos-entrega-3), o
   * ausente/`null` si el ítem es de texto libre. Es lo que hace que registrar
   * la recepción sume el stock solo.
   */
  insumoId?: string | null;
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
 * ## El `insumoId` se verifica contra el catálogo (insumos-entrega-3)
 *
 * Cuando el alta declara un insumo, se comprueba que sea elegible. Sin esa
 * comprobación el id inventado llega intacto al `INSERT`, la FK lo rechaza con
 * `P2003` y el usuario recibe el 409 genérico del filtro de Prisma —"la
 * operación afecta datos relacionados"—, que no dice cuál de los ids está mal.
 *
 * La comprobación corre DENTRO de la transacción y DESPUÉS de TODOS los guards
 * del agregado —el 404 de la compra inexistente y el S5 de la cancelada—. No es
 * la ubicación más barata y es deliberada: verificando primero el insumo, un
 * alta sobre una compra inexistente o cancelada con un insumo dado de baja
 * contestaba "ese insumo no existe" y mandaba a corregir el campo equivocado.
 * La compra gana, con el mismo orden que `EditarItemCompraUseCase`, y esa
 * simetría importa: son los dos caminos por los que un ítem declara su insumo,
 * y un usuario no debería recibir errores distintos según cuál usó. El ítem de
 * texto libre —la enorme mayoría— sigue sin pagar ninguna consulta, por el
 * guard de nulidad.
 *
 * La verificación se delega en `validarInsumoElegible`, de `insumos`, y no se
 * reescribe acá como un `findById() === null`: esa función es la que sabe que
 * la BAJA LÓGICA cuenta como inexistencia, y ese caso la FK no lo atrapa
 * —la fila sigue estando—. Escribir la regla de nuevo en este módulo la
 * duplicaría a medias.
 *
 * **Sin `exigirHabilitado`, a propósito.** Ese guard es de la ENTRADA de stock
 * —"deshabilitar significa que no se compra más de esto" para la carga
 * manual—, y declarar el insumo de un ítem no asienta ningún movimiento;
 * contestar con `InsumoDeshabilitadoError` le describiría al usuario una
 * entrada de stock que no está haciendo. Coherente con la decisión 1 del
 * diseño, que ya resolvió que un insumo deshabilitado no frena el circuito de
 * compras.
 *
 * La dependencia va `compras → insumos` y nunca al revés.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S4, S5), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C4; openspec/changes/insumos-entrega-3/design.md.
 * Tarea: PR-14.
 */
export class AgregarItemCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<
      ICompraRepository,
      'findByIdConItems' | 'guardar' | 'guardarItem'
    >,
    private readonly catalogoInsumos: LectorCatalogoInsumos,
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
        insumoId: dto.insumoId ?? null,
      });
      if (agregarResult.isFail()) {
        return Result.fail<CompraEntity, DomainError>(agregarResult.getError());
      }

      // El catálogo se verifica ÚLTIMO, después de TODOS los guards del
      // agregado. El orden es la corrección de un defecto que se arregló en dos
      // pasos: verificando antes, un alta sobre una compra inexistente —o
      // CANCELADA— con un insumo dado de baja contestaba "ese insumo no existe"
      // y mandaba a corregir el campo equivocado. El primer arreglo movió la
      // verificación detrás del 404 y dejó vivo el caso de la compra cancelada;
      // este la deja detrás de los dos.
      //
      // Es el mismo orden que `EditarItemCompraUseCase`, y esa simetría importa:
      // son los dos caminos por los que un ítem declara su insumo, y un usuario
      // no debería recibir errores distintos según cuál usó.
      //
      // Que el ítem ya esté empujado en memoria no persiste nada: el
      // `Result.fail` sale antes de `guardar()`/`guardarItem()` y el caller
      // descarta el agregado, igual que documenta la edición para su rollback.
      if (dto.insumoId != null) {
        const elegible = await validarInsumoElegible(this.catalogoInsumos, dto.insumoId);
        if (elegible.isFail()) {
          return Result.fail<CompraEntity, DomainError>(elegible.getError());
        }
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
