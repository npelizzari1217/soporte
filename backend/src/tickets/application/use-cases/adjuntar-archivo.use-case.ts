import { uuidv7 } from 'uuidv7';
import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IArchivoRepository } from '../../domain/ports/i-archivo.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `AdjuntarArchivoUseCase`.
 *
 * Exactamente uno de `ticketId`/`operacionId` debe estar presente (lo
 * garantiza el controller, que expone dos endpoints distintos —
 * `POST /tickets/:id/adjuntos` y `POST /operaciones/:id/adjuntos`, T22):
 * - `ticketId`: adjunta directo al ticket (join `archivos_ticket`).
 * - `operacionId`: adjunta a una operación EXISTENTE del timeline (join
 *   `archivos_operacion`) — el ticket dueño se resuelve vía
 *   `operacionRepo.findById` (deviation de PR10, ver `IOperacionTicketRepository`).
 *
 * El alcance del actor (`AlcanceActorTicket`) lo carga la capa de interface: adjuntar exige ver el
 * ticket, con el mismo criterio que el detalle, y además `ALTAS` o `MODIFICACION` sobre su tipo
 * (odd/permisos-por-tipo-ticket, D5 c).
 */
export interface AdjuntarArchivoDto extends AlcanceActorTicket {
  ticketId?: string;
  operacionId?: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: bigint;
  buffer: Buffer;
  subidoPorId: string;
}

/**
 * AdjuntarArchivoUseCase — sube un adjunto y lo vincula a un ticket o a una
 * operación existente del timeline (T20, T21, T22).
 *
 * Flujo:
 * 1. Resuelve el ticket "dueño": directo (`ticketId`) o vía la operación
 *    (`operacionId` → `operacion.ticketId`). Si el ticket o la operación no
 *    existen (o están soft-deleted) → `TicketNoEncontradoError` (404).
 * 2. Verifica acceso al ticket con el punto único `puedeOperarTicket`
 *    (odd/permisos-por-tipo-ticket D5 c): `LECTURA` sobre el tipo y fila
 *    (`VER_TODOS` sobre el tipo, solicitante, responsable o técnico de una
 *    tarea activa). Sin acceso → `TicketNoEncontradoError` (404 — mismo
 *    criterio de "no revela existencia" que T6/T18). Si lo ve sin `ALTAS` ni
 *    `MODIFICACION` sobre el tipo → `AccionSobreTipoNoPermitidaError` (403).
 * 3. Pre-genera un UUIDv7 para el archivo y construye la storage key
 *    determinística (ADR-7): `tickets/{ticketId}/{archivoId}` si se adjunta
 *    directo al ticket, `operaciones/{operacionId}/{archivoId}` si se
 *    adjunta a una operación existente.
 * 4. Construye la `ArchivoEntity` (revalida `tamanoBytes > 0` — T21,
 *    defensa adicional a la validación ya hecha en el pipe de interface,
 *    T10.1). Si falla → `Result.fail` SIN subir el binario.
 * 5. Sube el binario a `IFileStorage` ANTES de la transacción (ADR-7).
 * 6. **DENTRO de la transacción** (`ITenantTransactionRunner.run`, T22/T24):
 *    persiste `archivos` (`archivoRepo.save`), la fila de join
 *    (`linkToTicket`/`linkToOperacion` según el destino) y una NUEVA
 *    operación `ADJUNTO` en el timeline del ticket dueño — SIEMPRE, incluso
 *    cuando el join es contra una operación existente (T22: "MUST registrar
 *    una operación ADJUNTO en el timeline del ticket").
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 * Catálogos FIJOS (`tipo_operacion`) cuya ausencia es un fallo de
 * infraestructura usan `throw` defensivo (mismo patrón que
 * `CrearTicketUseCase`/`TransicionarEstadoUseCase`/`AsignarTicketUseCase`).
 *
 * Ref spec: sdd/tickets-core/spec T20, T21, T22. Ref design: ADR-7.
 * Tarea: T10.2.
 */
export class AdjuntarArchivoUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'findById' | 'save'>,
    private readonly archivoRepo: Pick<
      IArchivoRepository,
      'save' | 'linkToTicket' | 'linkToOperacion'
    >,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly fileStorage: Pick<IFileStorage, 'upload'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AdjuntarArchivoDto): Promise<Result<ArchivoEntity, DomainError>> {
    let ticketId: string;

    if (dto.operacionId) {
      const operacion = await this.operacionRepo.findById(dto.operacionId);
      if (!operacion || operacion.isDeleted()) {
        return Result.fail(new TicketNoEncontradoError(dto.operacionId));
      }
      ticketId = operacion.ticketId;
    } else {
      ticketId = dto.ticketId as string;
    }

    // Lo que el actor no ve tampoco recibe adjuntos: 404, no revela existencia (S0, T6/T18).
    const acceso = await cargarTicketParaOperar(this.ticketRepo, ticketId, dto, {
      algunaDe: ['ALTAS', 'MODIFICACION'],
    });
    if (acceso.isFail()) return Result.fail(acceso.getError());

    const archivoId = uuidv7();
    const storageKey = dto.operacionId
      ? `operaciones/${dto.operacionId}/${archivoId}`
      : `tickets/${ticketId}/${archivoId}`;

    // Revalidación defensiva (T21): el pipe de interface (T10.1) ya validó
    // tamaño/mime, pero el dominio nunca confía ciegamente en la capa HTTP.
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

    // Upload ANTES de la transacción DB (ADR-7) — si la tx falla después,
    // el archivo queda huérfano en disco (cleanup asíncrono, fuera de Fase 2).
    await this.fileStorage.upload(storageKey, dto.buffer, dto.mimeType);

    // Catálogo FIJO garantizado por el seed — su ausencia es un bug de
    // infraestructura, no un error del caller: throw defensivo (mismo
    // patrón que CrearTicketUseCase/TransicionarEstadoUseCase/AsignarTicketUseCase).
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ADJUNTO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "ADJUNTO" en el tenant activo.',
      );
    }

    await this.txRunner.run(async () => {
      await this.archivoRepo.save(archivo);
      if (dto.operacionId) {
        await this.archivoRepo.linkToOperacion(archivo.id, dto.operacionId);
      } else {
        await this.archivoRepo.linkToTicket(archivo.id, ticketId);
      }

      const operacionAdjunto = OperacionTicketEntity.create({
        ticketId,
        tipoOperacionId,
        descripcion: dto.nombreOriginal,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: dto.subidoPorId,
        esInterno: false,
        metadata: { archivoId: archivo.id },
      });
      await this.operacionRepo.save(operacionAdjunto);
    });

    return Result.ok(archivo);
  }
}
