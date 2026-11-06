import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TIPO_OPERACION_CERTIFICADO } from '../../domain/constants/tipos-operacion-certificado.constants';
import { CertificadoAvanceEntity } from '../../domain/entities/certificado-avance.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { CertificadoNoEncontradoError } from '../../domain/errors/certificados.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ICertificadoAvanceRepository } from '../../domain/ports/i-certificado-avance.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { bloquearTicketActivo } from '../services/bloquear-ticket-activo';
import { verificarTicketCertificable } from '../services/certificados.reglas';
import { resolverTipoOperacion } from '../services/tareas-ticket.reglas';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

export interface AnularCertificadoDto {
  ticketId: string;
  certificadoId: string;
  alcance: AlcanceActorTicket;
  /** Motivo con al menos un carácter visible (lo valida el DTO). */
  motivo: string;
}

/**
 * AnularCertificadoUseCase — anula un certificado vigente (odd/edilicia-obra-externa, S8): exige
 * `CERTIFICAR` y un motivo, libera sus tareas y deja `CERTIFICADO_ANULADO` en el historial, con el
 * lock del ticket tomado. El certificado anulado queda como registro. Anular dos veces es 409.
 */
export class AnularCertificadoUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara' | 'bloquear'>,
    private readonly certificadoRepo: Pick<ICertificadoAvanceRepository, 'buscarPorId' | 'anular'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket, certificado, alcance del actor y motivo.
   * @returns El certificado anulado, o el error de acceso, estado o certificado.
   */
  async execute(dto: AnularCertificadoDto): Promise<Result<CertificadoAvanceEntity, DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto.alcance,
      'CERTIFICAR',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_CERTIFICADO.ANULADO,
    );

    return this.txRunner.run(async (): Promise<Result<CertificadoAvanceEntity, DomainError>> => {
      const actual = await bloquearTicketActivo(this.ticketRepo, ticket.id);
      if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
      const certificable = await verificarTicketCertificable(this.estadoRepo, actual);
      if (certificable.isFail()) return Result.fail(certificable.getError());

      const certificado = await this.certificadoRepo.buscarPorId(dto.certificadoId);
      if (!certificado || certificado.ticketId !== ticket.id) {
        return Result.fail(new CertificadoNoEncontradoError(dto.certificadoId));
      }
      const anulacion = certificado.anular(dto.alcance.actorId, dto.motivo, this.ahora());
      if (anulacion.isFail()) return Result.fail(anulacion.getError());

      await this.certificadoRepo.anular(certificado);
      await this.operacionRepo.save(
        OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId,
          descripcion: `Certificado N.º ${certificado.numero} anulado: ${dto.motivo}`,
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: dto.alcance.actorId,
          esInterno: false,
          metadata: {
            certificado_id: certificado.id,
            numero: certificado.numero,
            motivo: dto.motivo,
          },
        }),
      );
      return Result.ok(certificado);
    });
  }
}
