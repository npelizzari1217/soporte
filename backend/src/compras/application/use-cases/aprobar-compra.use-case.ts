import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';

/** DTO de entrada para aprobar una compra (F3-C4). `aprobadoPorId` = JWT.sub. */
export interface AprobarCompraDto {
  /** UUID del ticket de compra a aprobar. */
  ticketId: string;
  /** UUID del actor que aprueba (soft ref → master.usuarios; extraído del JWT). */
  aprobadoPorId: string;
}

/**
 * AprobarCompraUseCase — aprueba un ticket de compra en un solo paso
 * (F3-C4, ADR-1).
 *
 * DECISIÓN CLAVE (ADR-1): la aprobación es un gate de negocio sobre el
 * satélite `ticket_compra`, NUNCA una transición de estado del `Ticket`
 * base — los 6 estados fijos de Fase 2 no incluyen un estado "APROBADO".
 *
 * Flujo:
 * 1. Carga el ticket → `TicketNoEncontradoError` (404) si no existe/eliminado.
 * 2. Busca el satélite `ticket_compra` → `CompraNoEncontradaError` si no existe.
 * 3. `ticketCompra.aprobar(...)` — falla con `CompraYaDecididaError` si ya
 *    había una decisión previa (idempotencia, sin doble decisión).
 * 4. Resuelve `tipo_operacion` APROBACION (catálogo FIJO sembrado en PR1 —
 *    su ausencia es un fallo de infraestructura, `throw` defensivo).
 * 5. **DENTRO de la transacción**: persiste el satélite decidido y
 *    registra la operación APROBACION en el timeline del ticket. El
 *    `Ticket` base NUNCA se guarda (no se mutó).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C4. Ref design: ADR-1.
 * Tarea: T5.1, T5.2.
 */
export class AprobarCompraUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findByTicketId' | 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: AprobarCompraDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticket.id);
    if (!ticketCompra) {
      return Result.fail(new CompraNoEncontradaError(ticket.id));
    }

    const aprobarResult = ticketCompra.aprobar(dto.aprobadoPorId, new Date());
    if (aprobarResult.isFail()) {
      return Result.fail(aprobarResult.getError());
    }

    // Catálogo FIJO garantizado por el seed (PR1, ADR-5) — su ausencia es
    // un bug de infraestructura, no un error del caller: throw defensivo.
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('APROBACION');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "APROBACION" en el tenant activo.',
      );
    }

    await this.txRunner.run(async () => {
      await this.ticketCompraRepo.save(ticketCompra);

      const operacion = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId,
        descripcion: null,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: dto.aprobadoPorId,
        esInterno: false,
        metadata: null,
      });
      await this.operacionRepo.save(operacion);
    });

    return Result.ok({ ticket, ticketCompra });
  }
}
