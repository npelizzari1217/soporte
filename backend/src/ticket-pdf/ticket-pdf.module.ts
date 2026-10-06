import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerLogoClienteUseCase } from '../clientes/application/use-cases/ver-logo-cliente.use-case';
import { ClientesModule } from '../clientes/clientes.module';
import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from '../equipos/domain/ports/i-equipo-informatico.repository';
import {
  ITicketSoporteRepository,
  TICKET_SOPORTE_REPOSITORY,
} from '../equipos/domain/ports/i-ticket-soporte.repository';
import { EquiposModule } from '../equipos/equipos.module';
import {
  ISubtareaEdiliciaRepository,
  SUBTAREA_EDILICIA_REPOSITORY,
} from '../reparaciones/domain/ports/i-subtarea-edilicia.repository';
import {
  ITicketEdiliciaRepository,
  TICKET_EDILICIA_REPOSITORY,
} from '../reparaciones/domain/ports/i-ticket-edilicia.repository';
import { ReparacionesModule } from '../reparaciones/reparaciones.module';
import { ListarTimelineUseCase } from '../tickets/application/use-cases/listar-timeline.use-case';
import { ObtenerTicketUseCase } from '../tickets/application/use-cases/obtener-ticket.use-case';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';
import {
  IPrioridadRepository,
  PRIORIDAD_REPOSITORY,
} from '../tickets/domain/ports/i-prioridad.repository';
import {
  ISolicitanteExternoRepository,
  SOLICITANTE_EXTERNO_REPOSITORY,
} from '../tickets/domain/ports/i-solicitante-externo.repository';
import {
  ITipoOperacionRepository,
  TIPO_OPERACION_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-operacion.repository';
import {
  ITipoTicketRepository,
  TIPO_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../tickets/domain/ports/i-usuario-master.checker';
import { TicketsModule } from '../tickets/tickets.module';
import { GenerarPdfTicketUseCase } from './application/use-cases/generar-pdf-ticket.use-case';
import { GENERADOR_PDF_TICKET, IGeneradorPdfTicket } from './domain/ports/i-generador-pdf-ticket';
import { PdfkitGeneradorPdfTicket } from './infrastructure/pdfkit-generador-pdf-ticket';
import { TicketPdfController } from './interface/controllers/ticket-pdf.controller';

/**
 * TicketPdfModule — ficha PDF de un ticket (`GET /tickets/:id/pdf`).
 *
 * Módulo propio porque compone cuatro módulos que ya dependen entre sí en un
 * solo sentido (`equipos` y `reparaciones` importan `tickets`): ponerlo en
 * `TicketsModule` cerraría un ciclo. AuthModule va explícito por la misma
 * razón que en los demás módulos funcionales (guards del controller).
 *
 * `pdfkit` solo se importa desde `infrastructure/`: el caso de uso trabaja
 * contra el puerto `IGeneradorPdfTicket`.
 */
@Module({
  imports: [AuthModule, TicketsModule, EquiposModule, ReparacionesModule, ClientesModule],
  controllers: [TicketPdfController],
  providers: [
    { provide: GENERADOR_PDF_TICKET, useFactory: () => new PdfkitGeneradorPdfTicket() },
    {
      provide: GenerarPdfTicketUseCase,
      useFactory: (
        obtenerTicket: ObtenerTicketUseCase,
        listarTimeline: ListarTimelineUseCase,
        estadoRepo: IEstadoRepository,
        prioridadRepo: IPrioridadRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        solicitanteExternoRepo: ISolicitanteExternoRepository,
        ticketSoporteRepo: ITicketSoporteRepository,
        equipoRepo: IEquipoInformaticoRepository,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        subtareaRepo: ISubtareaEdiliciaRepository,
        verLogoCliente: VerLogoClienteUseCase,
        generador: IGeneradorPdfTicket,
      ) =>
        new GenerarPdfTicketUseCase(
          obtenerTicket,
          listarTimeline,
          estadoRepo,
          prioridadRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          solicitanteExternoRepo,
          ticketSoporteRepo,
          equipoRepo,
          ticketEdiliciaRepo,
          subtareaRepo,
          verLogoCliente,
          generador,
        ),
      inject: [
        ObtenerTicketUseCase,
        ListarTimelineUseCase,
        ESTADO_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        SOLICITANTE_EXTERNO_REPOSITORY,
        TICKET_SOPORTE_REPOSITORY,
        EQUIPO_INFORMATICO_REPOSITORY,
        TICKET_EDILICIA_REPOSITORY,
        SUBTAREA_EDILICIA_REPOSITORY,
        VerLogoClienteUseCase,
        GENERADOR_PDF_TICKET,
      ],
    },
  ],
})
export class TicketPdfModule {}
