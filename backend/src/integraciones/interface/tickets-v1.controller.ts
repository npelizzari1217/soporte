import { Body, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequiereAcciones } from '../../auth/infrastructure/guards/decorators';
import { puedeEjecutar } from '../../auth/domain/permisos.util';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { CrearComentarioUseCase } from '../../tickets/application/use-cases/crear-comentario.use-case';
import { CrearTicketUseCase } from '../../tickets/application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { toHttpException } from '../../tickets/interface/controllers/tickets.controller';
import { ApiV1 } from './api-v1.decorator';
import {
  ComentarioV1,
  CrearComentarioV1Dto,
  CrearTicketV1Dto,
  ListarTicketsV1QueryDto,
  ListaTicketsV1,
  TicketV1,
} from './tickets-v1.dto';
import { TicketsV1Presenter } from './tickets-v1.presenter';

const ACCION_VER_TODOS = 'TICKETS:VER_TODOS';

/**
 * API publica `v1` de tickets (sdd/api-publica, T5, CA1): listar, ver, crear y comentar. Reusa los casos de uso
 * de la API interna; la clave llega como un actor sintetico (ver `ApiClaveGuard`). Sin logica de
 * negocio: traduce HTTP a caso de uso y el resultado al contrato `v1`.
 */
@ApiV1('tickets')
export class TicketsV1Controller {
  constructor(
    private readonly listarTickets: ListarTicketsUseCase,
    private readonly obtenerTicket: ObtenerTicketUseCase,
    private readonly crearTicket: CrearTicketUseCase,
    private readonly crearComentario: CrearComentarioUseCase,
    private readonly presenter: TicketsV1Presenter,
  ) {}

  /** Lista los tickets del cliente de la clave, paginados. Requiere `TICKETS:LECTURA`. */
  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  async listar(
    @CurrentUser() actor: JwtPayload,
    @Query() query: ListarTicketsV1QueryDto,
  ): Promise<ListaTicketsV1> {
    const result = await this.listarTickets.execute({
      actorId: actor.sub,
      tienePermisoVerTodos: puedeEjecutar(actor, ACCION_VER_TODOS),
      modulosPermitidos: actor.modulos,
      pagina: query.pagina,
      porPagina: query.porPagina,
      filtros: {
        estadoId: query.estado,
        tiposIds: query.tipo ? [query.tipo] : undefined,
        prioridadId: query.prioridad,
        fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : undefined,
        fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : undefined,
        busqueda: query.busqueda,
      },
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { items, total, pagina, porPagina } = result.getValue();
    return { items: await this.presenter.presentar(items), total, pagina, porPagina };
  }

  /** Un ticket del cliente de la clave. Uno de otro cliente da 404. Requiere `TICKETS:LECTURA`. */
  @Get(':id')
  @RequiereAcciones('TICKETS:LECTURA')
  async ver(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketV1> {
    const result = await this.obtenerTicket.execute({
      ticketId: id,
      actorId: actor.sub,
      tienePermisoVerTodos: puedeEjecutar(actor, ACCION_VER_TODOS),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const [ticket] = await this.presenter.presentar([result.getValue()]);
    return ticket;
  }

  /**
   * Crea un ticket a nombre del usuario de integracion (solicitante y autor). Requiere
   * `TICKETS:ALTAS`. 422 si tipo, prioridad o referencia no existen; 409 si no hay ciclo activo.
   */
  @Post()
  @RequiereAcciones('TICKETS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(@CurrentUser() actor: JwtPayload, @Body() dto: CrearTicketV1Dto): Promise<TicketV1> {
    const result = await this.crearTicket.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      ticketReferenciaId: dto.ticketReferenciaId ?? null,
      solicitanteId: actor.sub,
      clienteId: actor.cliente_id as string,
      autorId: actor.sub,
      anio: new Date().getFullYear(),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const [ticket] = await this.presenter.presentar([result.getValue()]);
    return ticket;
  }

  /**
   * Agrega un comentario PUBLICO a un ticket del cliente de la clave. Requiere `TICKETS:COMENTAR`.
   * Nunca es interno: la API no tiene forma de pedirlo. 404 si el ticket no es del cliente.
   */
  @Post(':id/comentarios')
  @RequiereAcciones('TICKETS:COMENTAR')
  @HttpCode(HttpStatus.CREATED)
  async comentar(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearComentarioV1Dto,
  ): Promise<ComentarioV1> {
    const result = await this.crearComentario.execute({
      ticketId: id,
      texto: dto.texto,
      autorId: actor.sub,
      esInterno: false,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const operacion = result.getValue();
    return {
      id: operacion.id,
      ticketId: operacion.ticketId,
      texto: dto.texto,
      esInterno: false,
      createdAt: operacion.createdAt.toISOString(),
    };
  }
}
