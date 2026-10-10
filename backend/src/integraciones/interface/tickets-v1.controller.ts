import { Body, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, RequiereAcciones } from '../../auth/infrastructure/guards/decorators';
import { puedeEjecutar } from '../../auth/domain/permisos.util';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { CrearComentarioUseCase } from '../../tickets/application/use-cases/crear-comentario.use-case';
import { CrearTicketUseCase } from '../../tickets/application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { toHttpException } from '../../tickets/interface/controllers/tickets.controller';
import { TicketsV1Query } from '../application/tickets-v1.query';
import { TiposTicketV1Query } from '../application/tipos-ticket-v1.query';
import { ApiV1 } from './api-v1.decorator';
import { ErrorV1 } from './error-v1.dto';
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

/** Path param `id` documentado como uuid: `ParseUUIDPipe` responde 400 a cualquier otra cosa. */
const ParamIdTicket = (): MethodDecorator =>
  ApiParam({ name: 'id', format: 'uuid', description: 'Id del ticket.' });

/**
 * API publica `v1` de tickets (sdd/api-publica, T5, CA1): listar, ver, crear y comentar. Reusa los casos de uso
 * de la API interna; la clave llega como un actor sintetico (ver `ApiClaveGuard`). Sin logica de
 * negocio: traduce HTTP a caso de uso y el resultado al contrato `v1`.
 */
@ApiV1('tickets')
@ApiTags('Tickets')
export class TicketsV1Controller {
  constructor(
    private readonly listarTickets: ListarTicketsUseCase,
    private readonly obtenerTicket: ObtenerTicketUseCase,
    private readonly crearTicket: CrearTicketUseCase,
    private readonly crearComentario: CrearComentarioUseCase,
    private readonly presenter: TicketsV1Presenter,
    private readonly tiposV1: TiposTicketV1Query,
    private readonly ticketsV1: TicketsV1Query,
  ) {}

  /** Lista los tickets del cliente de la clave, paginados. Requiere `TICKETS:LECTURA`. */
  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  @ApiOperation({
    summary: 'Lista los tickets del cliente',
    description: 'Paginado y con filtros combinables (AND). Requiere el permiso de lectura.',
  })
  @ApiOkResponse({ type: ListaTicketsV1 })
  @ApiBadRequestResponse({ type: ErrorV1, description: 'Filtros o paginación inválidos.' })
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

  /**
   * Un ticket del cliente de la clave. Uno de otro cliente o de otro modulo da el mismo 404 que uno
   * inexistente. Requiere `TICKETS:LECTURA`.
   */
  @Get(':id')
  @RequiereAcciones('TICKETS:LECTURA')
  @ApiOperation({
    summary: 'Obtiene un ticket del cliente',
    description: 'Nunca trae comentarios internos. Requiere el permiso de lectura.',
  })
  @ParamIdTicket()
  @ApiOkResponse({ type: TicketV1 })
  @ApiBadRequestResponse({ type: ErrorV1, description: 'El id no es un uuid.' })
  @ApiNotFoundResponse({
    type: ErrorV1,
    description: 'El ticket no existe, es de otro cliente o no es del módulo TICKETS.',
  })
  async ver(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketV1> {
    const deV1 = await this.ticketsV1.validarExistente(id);
    if (deV1.isFail()) {
      throw toHttpException(deV1.getError());
    }
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
   * El tipo tiene que ser uno de los que publica `GET /v1/catalogos` (activo, del modulo TICKETS):
   * si no, 422 con el mismo mensaje sea inexistente, dado de baja o de otro modulo (T5e). La
   * referencia, si viene, tiene que ser un ticket del modulo TICKETS: si no, el mismo 422 que una
   * referencia inexistente.
   */
  @Post()
  @RequiereAcciones('TICKETS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea un ticket',
    description:
      'El ticket queda a nombre de la integración del cliente. Tipo y prioridad salen de ' +
      '`GET /api/v1/catalogos`. Requiere el permiso de alta.',
  })
  @ApiCreatedResponse({ type: TicketV1 })
  @ApiBadRequestResponse({ type: ErrorV1, description: 'El cuerpo no cumple el contrato.' })
  @ApiUnprocessableEntityResponse({
    type: ErrorV1,
    description:
      'El tipo no está publicado en el catálogo (inexistente, dado de baja o de otro módulo), o la ' +
      'prioridad o el ticket de referencia no existen.',
  })
  @ApiConflictResponse({ type: ErrorV1, description: 'El cliente no tiene un ciclo activo.' })
  async crear(@CurrentUser() actor: JwtPayload, @Body() dto: CrearTicketV1Dto): Promise<TicketV1> {
    const tipo = await this.tiposV1.validarParaAlta(dto.tipoId);
    if (tipo.isFail()) {
      throw toHttpException(tipo.getError());
    }
    if (dto.ticketReferenciaId) {
      const referencia = await this.ticketsV1.validarReferencia(dto.ticketReferenciaId);
      if (referencia.isFail()) {
        throw toHttpException(referencia.getError());
      }
    }
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
   * Nunca es interno: la API no tiene forma de pedirlo. 404 si el ticket no es del cliente o es de
   * otro modulo, antes de escribir nada. El autor
   * es el usuario de integracion, que habla por el cliente: el comentario no cuenta como primera
   * respuesta de SLA (`autorEsIntegracion`, T5d).
   */
  @Post(':id/comentarios')
  @RequiereAcciones('TICKETS:COMENTAR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Comenta un ticket',
    description:
      'El comentario siempre es público y no cuenta como primera respuesta del SLA. Requiere el ' +
      'permiso de comentario.',
  })
  @ParamIdTicket()
  @ApiCreatedResponse({ type: ComentarioV1 })
  @ApiBadRequestResponse({
    type: ErrorV1,
    description: 'El id no es un uuid o el cuerpo no cumple el contrato.',
  })
  @ApiNotFoundResponse({
    type: ErrorV1,
    description: 'El ticket no existe, es de otro cliente o no es del módulo TICKETS.',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorV1,
    description: 'El estado del ticket no admite comentarios.',
  })
  async comentar(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearComentarioV1Dto,
  ): Promise<ComentarioV1> {
    const deV1 = await this.ticketsV1.validarExistente(id);
    if (deV1.isFail()) {
      throw toHttpException(deV1.getError());
    }
    const result = await this.crearComentario.execute({
      ticketId: id,
      texto: dto.texto,
      autorId: actor.sub,
      esInterno: false,
      autorEsIntegracion: true,
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
