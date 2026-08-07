import { uuidv7 } from 'uuidv7';
import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ArchivoEntity } from '../../../tickets/domain/entities/archivo.entity';
import { IArchivoRepository } from '../../../tickets/domain/ports/i-archivo.repository';
import { PresupuestoNoEncontradoError } from '../../domain/errors/compras.errors';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';

/** DTO de entrada para adjuntar un archivo de cotización a un presupuesto (F3-C3). */
export interface AdjuntarPresupuestoDto {
  presupuestoId: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: bigint;
  buffer: Buffer;
  subidoPorId: string;
}

/**
 * AdjuntarPresupuestoUseCase — sube un adjunto y lo vincula a un
 * presupuesto de proveedor (F3-C3, ADR-8).
 *
 * Clona el patrón de `AdjuntarArchivoUseCase` (Fase 2, ADR-7):
 * 1. Carga el presupuesto → `PresupuestoNoEncontradoError` si no existe/eliminado.
 * 2. Pre-genera un UUIDv7 para el archivo y construye la storage key
 *    determinística: `presupuestos/{presupuestoId}/{archivoId}`.
 * 3. Construye `ArchivoEntity` (revalida `tamanoBytes > 0` — defensa
 *    adicional a la validación ya hecha en el pipe de interface). Si
 *    falla → `Result.fail` SIN subir el binario.
 * 4. Sube el binario a `IFileStorage` ANTES de la transacción (ADR-7/ADR-8).
 * 5. **DENTRO de la transacción**: persiste `archivos` (`archivoRepo.save`)
 *    y la fila de join `archivos_presupuesto` (`archivoRepo.linkToPresupuesto`,
 *    extensión retrocompatible del puerto, T3.3).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-8.
 * Tarea: T5.5, T5.6.
 */
export class AdjuntarPresupuestoUseCase {
  constructor(
    private readonly presupuestoRepo: Pick<IPresupuestoRepository, 'findById'>,
    private readonly archivoRepo: Pick<IArchivoRepository, 'save' | 'linkToPresupuesto'>,
    private readonly fileStorage: Pick<IFileStorage, 'upload'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AdjuntarPresupuestoDto): Promise<Result<ArchivoEntity, DomainError>> {
    const presupuesto = await this.presupuestoRepo.findById(dto.presupuestoId);
    if (!presupuesto || presupuesto.isDeleted()) {
      return Result.fail(new PresupuestoNoEncontradoError(dto.presupuestoId));
    }

    const archivoId = uuidv7();
    const storageKey = `presupuestos/${dto.presupuestoId}/${archivoId}`;

    const archivoResult = ArchivoEntity.create(
      {
        storageKey,
        nombreOriginal: dto.nombreOriginal,
        mimeType: dto.mimeType,
        tamanoBytes: dto.tamanoBytes,
        subidoPorId: dto.subidoPorId,
      },
      archivoId,
    );
    if (archivoResult.isFail()) {
      return Result.fail(archivoResult.getError());
    }
    const archivo = archivoResult.getValue();

    // Upload ANTES de la transacción DB (ADR-7/ADR-8) — si la tx falla
    // después, el archivo queda huérfano en disco (cleanup asíncrono,
    // fuera de alcance de esta fase).
    await this.fileStorage.upload(storageKey, dto.buffer, dto.mimeType);

    await this.txRunner.run(async () => {
      await this.archivoRepo.save(archivo);
      await this.archivoRepo.linkToPresupuesto(archivo.id, dto.presupuestoId);
    });

    return Result.ok(archivo);
  }
}
