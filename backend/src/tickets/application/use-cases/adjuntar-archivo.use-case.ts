import { uuidv7 } from 'uuidv7';
import { DomainError, Result } from '../../../shared/domain/result';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';
import {
  ArchivoTamanoCeroError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IArchivoRepository } from '../../domain/ports/i-archivo.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * DTO de entrada para adjuntar un archivo a un ticket.
 *
 * - `ticketId`: UUID del ticket al que se adjunta el archivo.
 * - `buffer`: contenido binario del archivo. NUNCA se persiste en DB.
 * - `subidoPorId`: UUID del usuario que realiza la acción (del JWT).
 */
export interface AdjuntarArchivoDto {
  ticketId: string;
  nombreOriginal: string;
  mimeType: string;
  /**
   * Tamaño en bytes. DEBE ser > 0 (validado antes del upload).
   * Usamos bigint para soportar archivos de gran tamaño (>2GB) sin perder precisión.
   */
  tamanoBytes: bigint;
  /** Contenido binario del archivo. Solo para upload a IFileStorage — NO va a DB. */
  buffer: Buffer;
  /** Soft ref → master.usuarios.id. Se guarda en archivos.subido_por_id. */
  subidoPorId: string;
}

/**
 * AdjuntarArchivoUseCase — caso de uso para adjuntar un archivo a un ticket.
 *
 * Flujo:
 * 1. Carga el ticket por id → 404 si no existe.
 * 2. Valida tamanoBytes > 0 (fail-fast ANTES del upload, para evitar llamadas costosas
 *    al storage con datos inválidos).
 * 3. Pre-genera el UUIDv7 del archivo — necesario para construir la storage key
 *    ANTES del upload sin crear la entidad dos veces.
 * 4. Construye la storage key: `tickets/{ticketId}/{archivoId}`.
 * 5. Llama IFileStorage.upload(key, buffer, mime) → obtiene storageKey confirmada.
 *    El upload ocurre FUERA de la transacción DB (IFileStorage es externo).
 * 6. Crea ArchivoEntity con la storageKey confirmada y el id pre-generado.
 * 7. Dentro del txRunner (MISMA transacción DB):
 *    a. Persiste metadatos en archivos (archivoRepo.save).
 *    b. Crea fila en archivos_ticket (archivoRepo.linkToTicket).
 * 8. Retorna Result.ok(archivo).
 *
 * PATRÓN FIRE-AND-FORGET PARA CLEANUP DE STORAGE:
 * Si el upload fue exitoso pero la transacción DB falla, el archivo queda
 * huérfano en storage. Este use case NO llama IFileStorage.delete en ese caso.
 * El cleanup es responsabilidad de un job asíncrono de limpieza.
 * Razón: el spec dice "MUST NOT bloquear la respuesta esperando al storage".
 *
 * Sin throw intencional — fallos de validación y dominio retornan Result.fail().
 * Excepciones de infraestructura (DB, storage) se propagan al framework.
 *
 * Ref spec: [SPEC:tickets-core/Upload adjunto guarda solo metadata]
 * Ref spec: [SPEC:tickets-core/Borrado de adjunto no borra el binario inmediatamente]
 * Tarea: 3.C.8
 */
export class AdjuntarArchivoUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly archivoRepo: IArchivoRepository,
    private readonly fileStorage: IFileStorage,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: AdjuntarArchivoDto,
  ): Promise<Result<ArchivoEntity, DomainError | ArchivoTamanoCeroError>> {
    // 1. Cargar el ticket (verifica que existe antes de hacer cualquier trabajo costoso)
    // WARNING-1 fix: findById también devuelve tickets soft-deleted; tratarlos como no encontrados.
    // Esto evita subir archivos a IFileStorage para tickets borrados.
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Validar tamanoBytes > 0 ANTES del upload (fail-fast)
    if (dto.tamanoBytes <= BigInt(0)) {
      return Result.fail(new ArchivoTamanoCeroError(dto.tamanoBytes));
    }

    // 3. Pre-generar el UUIDv7 del archivo para usarlo en la storage key
    //    y pasar el mismo id al entity constructor (no se genera dos veces).
    const archivoId = uuidv7();

    // 4. Construir la storage key usando el id del archivo pre-generado.
    //    Formato: tickets/{ticketId}/{archivoId}
    //    La extensión se puede inferir del mimeType en la capa de presentación si es necesario.
    const storageKey = `tickets/${dto.ticketId}/${archivoId}`;

    // 5. Upload del binario a IFileStorage ANTES de cualquier INSERT en DB.
    //    Si falla aquí, no hay nada que rollback en DB (no se escribió nada aún).
    //    Si la DB falla DESPUÉS de un upload exitoso, el archivo queda huérfano
    //    en storage → cleanup asíncrono (job de limpieza), NO llamamos delete aquí.
    const confirmedKey = await this.fileStorage.upload(storageKey, dto.buffer, dto.mimeType);

    // 6. Crear ArchivoEntity con la storageKey confirmada por el adaptador.
    //    Pasamos el id pre-generado para que el entity use el mismo UUID que la storage key.
    //    tamanoBytes ya fue validado en paso 2, pero usamos create() de todas formas
    //    para que la entidad sea correctamente inicializada.
    const archivoResult = ArchivoEntity.create(
      {
        storageKey: confirmedKey,
        nombreOriginal: dto.nombreOriginal,
        mimeType: dto.mimeType,
        tamanoBytes: dto.tamanoBytes,
        subidoPorId: dto.subidoPorId,
      },
      archivoId,
    );

    // Esto no debería fallar dado el paso 2, pero mantenemos el flujo Result.
    if (archivoResult.isFail()) {
      return Result.fail(archivoResult.getError());
    }

    const archivo = archivoResult.getValue();

    // 7. Persistir metadatos (archivos) + join (archivos_ticket) en la MISMA transacción.
    await this.txRunner.run(async () => {
      await this.archivoRepo.save(archivo);
      await this.archivoRepo.linkToTicket(archivo.id, dto.ticketId);
    });

    return Result.ok(archivo);
  }
}
