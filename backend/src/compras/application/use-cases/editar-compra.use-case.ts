import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import {
  CompraNoEncontradaError,
  SectorInexistenteError,
} from '../../domain/errors/compras.errors';
import { RegistrarOperacionCompra } from '../services/registrar-operacion-compra';

/**
 * DTO de entrada de `EditarCompraUseCase` (PATCH semántico — `undefined` no
 * toca el campo, `null` limpia `descripcion`/`sectorId`, mismo criterio que
 * `CompraActualizarProps`).
 *
 * `numero`/`solicitanteId`/`cicloId` NO están acá, igual que en el DTO de la
 * entidad: cambiarlos convertiría la compra en otra.
 */
export interface EditarCompraDto {
  compraId: string;
  /** Actor que ejecuta la edición (`JWT.sub`) — autor de la operación de bitácora. */
  usuarioId: string;
  motivo?: string;
  descripcion?: string | null;
  fechaSolicitud?: Date;
  sectorId?: string | null;
}

/**
 * EditarCompraUseCase — edita los campos de solicitud de la CABECERA de una
 * compra (`motivo`/`descripcion`/`fechaSolicitud`/`sectorId`).
 *
 * La regla de cuándo se puede editar (estado derivado `PENDIENTE`: ningún
 * ítem decidido todavía) YA está resuelta en `CompraEntity.actualizar()`
 * (ADR-C3) — este caso de uso NO la re-implementa, sólo la invoca. La compra
 * cancelada cae por el mismo guard: deriva `CANCELADO`, nunca `PENDIENTE`.
 *
 * Flujo:
 * 1. Carga la compra CON sus ítems — `actualizar()` consulta el estado
 *    derivado, que se calcula sobre los ítems: sin ellos, una compra con
 *    ítems aprobados se leería como PENDIENTE y el guard dejaría pasar la
 *    edición. Si no existe o está soft-deleted → `CompraNoEncontradaError`.
 * 2. Si viene un `sectorId` NO nulo, verifica que el sector exista →
 *    `SectorInexistenteError`. Es el mismo cierre que el fix post-verify W6
 *    hizo en `CrearCompraUseCase`: sin esta validación, un `PATCH` con un
 *    `sectorId` inventado lo escribiría intacto en la DB y reabriría el
 *    agujero por la puerta de al lado. Con `sectorId: null` (limpiar) no se
 *    consulta el repositorio — no hay nada que validar.
 * 3. Invoca `compra.actualizar(datos)` — puede fallar con
 *    `CompraNoPendienteError`. Los tres guards corren ANTES de abrir la
 *    transacción: si alguno falla, `txRunner.run` NUNCA se invoca, así que
 *    `RegistrarOperacionCompra.registrar()` queda en 0 llamadas de forma
 *    estructural (corolario de S35/S36: una mutación rechazada no es un
 *    evento del timeline).
 * 4. Si la edición fue exitosa, **dentro de la misma transacción**
 *    (`ITenantTransactionRunner.run`): persiste la cabecera (`guardar()`
 *    upsertea todos los campos de cabecera, ADR-C2) y registra EXACTAMENTE 1
 *    `OperacionCompra` de tipo `COMPRA_EDITADA` (S35), con
 *    `itemCompraId: null` — la edición es de la cabecera, no de un ítem.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 */
export class EditarCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems' | 'guardar'>,
    private readonly sectorRepo: Pick<ISectorRepository, 'findById'>,
    private readonly registrarOperacion: RegistrarOperacionCompra,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarCompraDto): Promise<Result<CompraEntity, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    if (dto.sectorId) {
      const sector = await this.sectorRepo.findById(dto.sectorId);
      if (!sector) {
        return Result.fail(new SectorInexistenteError(dto.sectorId));
      }
    }

    const resultadoEdicion = compra.actualizar({
      motivo: dto.motivo,
      descripcion: dto.descripcion,
      fechaSolicitud: dto.fechaSolicitud,
      sectorId: dto.sectorId,
    });
    if (resultadoEdicion.isFail()) {
      return Result.fail(resultadoEdicion.getError());
    }

    await this.txRunner.run(async () => {
      await this.compraRepo.guardar(compra);
      await this.registrarOperacion.registrar({
        compraId: compra.id,
        itemCompraId: null,
        tipo: 'COMPRA_EDITADA',
        usuarioId: dto.usuarioId,
        detalle: `Cabecera de la compra "${compra.numero}" editada.`,
        datos: null,
      });
    });

    return Result.ok(compra);
  }
}
