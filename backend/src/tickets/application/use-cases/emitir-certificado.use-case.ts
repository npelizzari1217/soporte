import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TIPO_OPERACION_CERTIFICADO } from '../../domain/constants/tipos-operacion-certificado.constants';
import { CertificadoAvanceEntity } from '../../domain/entities/certificado-avance.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { CertificadoSoloExternoError } from '../../domain/errors/certificados.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ICertificadoAvanceRepository } from '../../domain/ports/i-certificado-avance.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { tareasParaCertificar } from '../../domain/services/emision-certificado';
import { bloquearTicketActivo } from '../services/bloquear-ticket-activo';
import { verificarTicketCertificable } from '../services/certificados.reglas';
import { resolverTipoOperacion } from '../services/tareas-ticket.reglas';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

export interface EmitirCertificadoDto {
  ticketId: string;
  alcance: AlcanceActorTicket;
  /** Tareas del certificado, sin repetir y al menos una (lo valida el DTO). */
  tareaIds: string[];
}

/**
 * EmitirCertificadoUseCase — certifica un grupo de tareas completadas de un ticket EXTERNA
 * (odd/edilicia-obra-externa, S4, S5, S6, S8).
 *
 * Exige `CERTIFICAR` sobre el tipo del ticket (S6; ADMINISTRADOR y ROOT no tienen restricción). Con
 * el lock del ticket tomado verifica que no esté cerrado ni cancelado (L26), que los pesos de las
 * tareas activas sumen 100 (S4) y que cada tarea pedida esté activa, completada y fuera de otro
 * certificado vigente (S5). El certificado copia el peso de cada tarea (S8), registra quién lo emitió
 * y cuándo (S6) y deja `CERTIFICADO_EMITIDO` en el historial, todo en la misma transacción.
 */
export class EmitirCertificadoUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara' | 'bloquear'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly certificadoRepo: Pick<
      ICertificadoAvanceRepository,
      'tareasCertificadas' | 'siguienteNumero' | 'crear'
    >,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket, alcance del actor y tareas pedidas.
   * @returns El certificado emitido, o el error de acceso, estado, modalidad, pesos o tareas.
   */
  async execute(dto: EmitirCertificadoDto): Promise<Result<CertificadoAvanceEntity, DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto.alcance,
      'CERTIFICAR',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();
    if (ticket.modalidad !== 'EXTERNA') return Result.fail(new CertificadoSoloExternoError());

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_CERTIFICADO.EMITIDO,
    );

    return this.txRunner.run(async (): Promise<Result<CertificadoAvanceEntity, DomainError>> => {
      const actual = await bloquearTicketActivo(this.ticketRepo, ticket.id);
      if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
      const certificable = await verificarTicketCertificable(this.estadoRepo, actual);
      if (certificable.isFail()) return Result.fail(certificable.getError());

      const tareas = (await this.tareaRepo.listarPorTicket(ticket.id)).filter(
        (t) => !t.isDeleted(),
      );
      const certificadas = await this.certificadoRepo.tareasCertificadas(ticket.id);
      const elegidas = tareasParaCertificar(tareas, dto.tareaIds, certificadas);
      if (elegidas.isFail()) return Result.fail(elegidas.getError());

      const certificado = CertificadoAvanceEntity.emitir({
        ticketId: ticket.id,
        numero: await this.certificadoRepo.siguienteNumero(ticket.id),
        emitidoPorId: dto.alcance.actorId,
        emitidoEn: this.ahora(),
        tareas: elegidas.getValue(),
      });
      await this.certificadoRepo.crear(certificado);
      await this.operacionRepo.save(
        OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId,
          descripcion: `Certificado N.º ${certificado.numero} (${certificado.porcentaje} %)`,
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: dto.alcance.actorId,
          esInterno: false,
          metadata: {
            certificado_id: certificado.id,
            numero: certificado.numero,
            porcentaje: certificado.porcentaje,
            tareas: certificado.tareas.map((t) => ({ tarea_id: t.tareaId, peso: t.peso })),
          },
        }),
      );
      return Result.ok(certificado);
    });
  }
}
