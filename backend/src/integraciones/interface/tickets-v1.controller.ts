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
import { CurrentUser } from '../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { CrearComentarioUseCase } from '../../tickets/application/use-cases/crear-comentario.use-case';
import { CrearTicketUseCase } from '../../tickets/application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { toHttpException } from '../../tickets/interface/controllers/tickets.controller';
import { TicketsV1Query } from '../application/tickets-v1.query';
import { MODULO_API_V1, TiposTicketV1Query } from '../application/tipos-ticket-v1.query';
import { ApiV1, RequierePermisoApi } from './api-v1.decorator';
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
import { AlcanceActorTicket } from '../../tickets/application/services/visibilidad-ticket';
import { AccionTipoTicket } from '../../tickets/domain/permisos-tipo-ticket';
import { accionesDeClaveApi, accionesDeClaveApiParaComentar } from '../domain/alcance-clave-api';

/**
 * Alcance por tipo de la clave (odd/permisos-por-tipo-ticket, D4, D5 f). La clave no tiene filas en
 * `permisos_tipo_ticket`: cada tipo del modulo de v1 recibe las `acciones` que salen de traducir
 * las celdas de la clave (`accionesDeClaveApi`). Un tipo de otro modulo queda fuera del mapa, asi
 * que su ticket sigue siendo 404.
 *
 * Las rutas declaran `@RequierePermisoApi('TICKETS:*')`: las celdas de la clave son su modelo de
 * permisos propio (`PERMISOS_API`), no la matriz de usuarios, que ya no tiene el modulo TICKETS
 * (T9b), y la ruta responde 403 a una clave sin la celda antes de llegar al caso de uso.
 *
 * @param actor Actor sintetico de la clave.
 * @param tiposV1 Ids de los tipos del modulo de v1.
 * @param acciones Acciones que la clave tiene sobre cada uno.
 * @returns El alcance de la clave.
 */
function alcanceV1(
  actor: JwtPayload,
  tiposV1: readonly string[],
  acciones: ReadonlySet<AccionTipoTicket>,
): AlcanceActorTicket {
  return {
    actorId: actor.sub,
    permisosPorTipo: new Map(tiposV1.map((tipoId) => [tipoId, new Set(acciones)])),
  };
}

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
  @RequierePermisoApi('TICKETS:LECTURA')
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
      // Una clave de lectura trae `VER_TODOS` del guard: ve todos los tickets de los tipos de v1.
      alcance: await this.alcanceDeLaClave(actor),
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
  @RequierePermisoApi('TICKETS:LECTURA')
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
      ...(await this.alcanceDeLaClave(actor)),
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
  @RequierePermisoApi('TICKETS:ALTAS')
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
      // `TICKETS:ALTAS` de la clave traducida a `ALTAS` sobre los tipos de v1: el caso de uso la
      // exige sobre el tipo elegido, como en cualquier alta (D5 c, f).
      alcance: await this.alcanceDeLaClave(actor),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const [ticket] = await this.presenter.presentar([result.getValue()]);
    return ticket;
  }

  /**
   * Agrega un comentario PUBLICO a un ticket del cliente de la clave. Requiere `TICKETS:COMENTAR`.
   * Nunca es interno: la API no tiene forma de pedirlo. Alcanza a cualquier ticket del modulo
   * TICKETS del cliente, lo haya pedido o no el usuario de integracion
   * (`accionesDeClaveApiParaComentar`); 404
   * si el ticket no es del cliente o es de otro modulo, antes de escribir nada. El autor
   * es el usuario de integracion, que habla por el cliente: el comentario no cuenta como primera
   * respuesta de SLA (`autorEsIntegracion`, T5d). Se acepta en cualquier estado del ticket, tambien
   * RESUELTO, CERRADO o CANCELADO (odd/cerrado-solo-comentarios, S4).
   */
  @Post(':id/comentarios')
  @RequierePermisoApi('TICKETS:COMENTAR')
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
      ...(await this.alcanceDeLaClave(actor, accionesDeClaveApiParaComentar)),
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

  /**
   * Alcance de la clave sobre los tipos de v1, con sus celdas traducidas por `traducir`.
   *
   * @param actor Actor sintetico de la clave.
   * @param traducir Traducción de las celdas a acciones de un tipo; por defecto, la de la clave
   *   (`accionesDeClaveApi`).
   * @returns El alcance de la clave.
   */
  private async alcanceDeLaClave(
    actor: JwtPayload,
    traducir: (
      permisos: readonly string[],
      modulo: string,
    ) => Set<AccionTipoTicket> = accionesDeClaveApi,
  ): Promise<AlcanceActorTicket> {
    return alcanceV1(
      actor,
      await this.ticketsV1.tiposDeV1(),
      traducir(actor.permisos, MODULO_API_V1),
    );
  }
}
