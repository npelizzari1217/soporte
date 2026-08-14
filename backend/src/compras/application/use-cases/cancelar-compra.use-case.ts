import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/** DTO de entrada para cancelar una compra (§4.8, S27-S31). */
export interface CancelarCompraDto {
  compraId: string;
  /** Actor que ejecuta la cancelación (`JWT.sub` con `compra:gestionar`) — autor de la operación de bitácora y de `canceladoPorId`. */
  usuarioId: string;
  /** Motivo de la cancelación (obligatorio, precondición de dominio — ver `CompraEntity.cancelar`). */
  motivo: string;
}

/**
 * CancelarCompraUseCase — cancela una compra (§4.8, S27-S31).
 *
 * S27-S31 YA están resueltos en `CompraEntity.cancelar()`: este caso de uso
 * NO re-implementa las guardas ni su orden (ya cancelada S30, ya cerrada
 * S28, compras registradas S29) — solo invoca la entidad y traduce el
 * `Result`.
 *
 * **S31 — el borde que NO debe bloquearse**: cancelar una compra SIN ítems
 * está PERMITIDO. La guarda de S29 (`itemsActivos().some(item =>
 * item.cantidadComprada > 0)`) es EXISTENCIAL — sobre el conjunto vacío
 * `[].some(...)` es `false`, y esa `false` es la lectura CORRECTA del
 * spec, no un caso límite a parchear. Es la asimetría deliberada frente a
 * los cuantificadores UNIVERSALES de §3 (donde la vacuidad del subconjunto
 * aprobado se fuerza a `false` por decisión explícita del usuario): dos
 * reglas distintas, dos formas distintas de cuantificar, y este caso de uso
 * no las unifica — simplemente delega en la entidad, que ya las mantiene
 * separadas (ver `CompraEntity.cancelar` JSDoc).
 *
 * Tras cancelar, **Regla 0** de la tabla de verdad de cabecera aplica sola:
 * `compra.estado === 'CANCELADO'` sin importar el estado de aprobación de
 * los ítems (incluso si TODOS están APROBADOS) — es un getter derivado
 * (`derivarEstadoCompra`, ADR-C1), este caso de uso no lo fuerza a mano.
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems -> `CompraNoEncontradaError` si no existe.
 * 2. `compra.cancelar(usuarioId, motivo)` — si falla (S28, S29, S30),
 *    retorna el error SIN mutar ningún campo y SIN entrar a la transacción
 *    — ni `guardar` ni la bitácora se llaman.
 * 3. Si la cancelación es válida: DENTRO de la transacción
 *    (`ITenantTransactionRunner.run`), persiste la cabecera (única entidad
 *    mutada — la cancelación no toca los ítems) y registra la operación
 *    `CANCELACION` de CABECERA (`itemCompraId: null`, S35: exactamente 1
 *    por mutación exitosa).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 * `motivo` vacío es precondición de dominio modelada con `throw` en
 * `CompraEntity.cancelar()` (mismo criterio que `validarCamposBase`,
 * consistente con `ItemCompraEntity.create()`), no un `DomainError`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.8 (S27-S31), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4. Tarea: PR-18.
 */
export class CancelarCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar'>,
    private readonly registrarOperacionCompra: Pick<RegistrarOperacionCompra, 'registrar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: CancelarCompraDto): Promise<Result<CompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const cancelacion = compra.cancelar(dto.usuarioId, dto.motivo);
    if (cancelacion.isFail()) {
      return Result.fail(cancelacion.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardar(compra);
      await this.registrarOperacionCompra.registrar({
        compraId: compra.id,
        itemCompraId: null,
        tipo: 'CANCELACION',
        usuarioId: dto.usuarioId,
        detalle: `Compra "${compra.numero}" cancelada: ${dto.motivo}`,
        datos: null,
      });
    });

    return Result.ok(compra);
  }
}
