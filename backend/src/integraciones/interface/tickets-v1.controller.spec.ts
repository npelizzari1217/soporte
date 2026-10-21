import { NotFoundException, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { Result } from '../../shared/domain/result';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { CrearComentarioUseCase } from '../../tickets/application/use-cases/crear-comentario.use-case';
import { CrearTicketUseCase } from '../../tickets/application/use-cases/crear-ticket.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { OperacionTicketEntity } from '../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../tickets/domain/errors/tickets.errors';
import { accionesDeTipoDesdeCeldas } from '../../tickets/domain/permisos-tipo-ticket';
import { TipoTicketV1NoDisponibleError } from '../domain/integraciones.errors';
import { TicketsV1Query } from '../application/tickets-v1.query';
import { TiposTicketV1Query } from '../application/tipos-ticket-v1.query';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';
import { TicketsV1Controller } from './tickets-v1.controller';
import { TicketsV1Presenter } from './tickets-v1.presenter';
import { CrearTicketV1Dto } from './tickets-v1.dto';

const ID = '01977a00-0000-7000-8000-0000000000cc';

const actor: JwtPayload = {
  v: 1,
  sub: '01977a00-0000-7000-8000-0000000000aa',
  cliente_id: 'c1',
  rol: 'USUARIO',
  permisos: ['TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
  is_global_admin: false,
  cliente_nombre: null,
  membresias: [],
  modulos: ['TICKETS'],
  nombre: 'Integracion',
  apellido: 'API',
  cliente_logo_v: null,
};

/** Clave con solo alta. */
const actorDeAlta: JwtPayload = { ...actor, permisos: ['TICKETS:ALTAS'] };

/** Clave con solo comentario: el guard no le agrega VER_TODOS. */
const actorDeComentario: JwtPayload = { ...actor, permisos: ['TICKETS:COMENTAR'] };

function ticket(): TicketEntity {
  return TicketEntity.create({
    numero: 'SOP-2026-00001',
    titulo: 'No imprime',
    descripcion: null,
    tipoId: 'tipo-1',
    estadoId: 'estado-1',
    prioridadId: 'prio-1',
    cicloId: null,
    ticketReferenciaId: null,
    solicitanteId: actor.sub,
  });
}

async function armar(encontrado = true, tipoPublicado = true, deV1 = true) {
  const listar = vi
    .fn()
    .mockResolvedValue(Result.ok({ items: [ticket()], total: 1, pagina: 1, porPagina: 20 }));
  const obtener = vi
    .fn()
    .mockResolvedValue(
      encontrado ? Result.ok(ticket()) : Result.fail(new TicketNoEncontradoError(ID)),
    );
  const crear = vi.fn().mockResolvedValue(Result.ok(ticket()));
  const comentar = vi.fn().mockResolvedValue(
    Result.ok(
      OperacionTicketEntity.create({
        ticketId: ID,
        tipoOperacionId: 'op-1',
        descripcion: 'hola',
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: actor.sub,
        esInterno: false,
        metadata: null,
      }),
    ),
  );
  const presentar = vi.fn().mockResolvedValue([{ numero: 'SOP-2026-00001' }]);
  const validarTipo = vi
    .fn()
    .mockResolvedValue(
      tipoPublicado ? Result.ok(undefined) : Result.fail(new TipoTicketV1NoDisponibleError()),
    );
  const validarExistente = vi
    .fn()
    .mockResolvedValue(deV1 ? Result.ok(undefined) : Result.fail(new TicketNoEncontradoError(ID)));
  const validarReferencia = vi.fn().mockResolvedValue(Result.ok(undefined));
  const tiposDeV1 = vi.fn().mockResolvedValue(['tipo-1', 'tipo-2']);
  const modulo = await Test.createTestingModule({
    controllers: [TicketsV1Controller],
    providers: [
      { provide: TicketsV1Presenter, useValue: { presentar } },
      { provide: ListarTicketsUseCase, useValue: { execute: listar } },
      { provide: ObtenerTicketUseCase, useValue: { execute: obtener } },
      { provide: CrearTicketUseCase, useValue: { execute: crear } },
      { provide: CrearComentarioUseCase, useValue: { execute: comentar } },
      { provide: TiposTicketV1Query, useValue: { validarParaAlta: validarTipo } },
      {
        provide: TicketsV1Query,
        useValue: { validarExistente, validarReferencia, tiposDeV1 },
      },
    ],
  })
    .overrideGuard(ApiClaveGuard)
    .useValue({})
    .overrideGuard(ApiV1ThrottlerGuard)
    .useValue({})
    .overrideGuard(AccionesGuard)
    .useValue({})
    .compile();
  return {
    controller: modulo.get(TicketsV1Controller),
    listar,
    obtener,
    crear,
    comentar,
    validarTipo,
    validarExistente,
  };
}

describe('TicketsV1Controller (lectura)', () => {
  it('lista con el alcance del actor sintetico y sin filtros internos', async () => {
    const { controller, listar } = await armar();

    const res = await controller.listar(actor, { estado: ID, pagina: 2, busqueda: 'imprime' });

    expect(listar).toHaveBeenCalledWith(
      expect.objectContaining({
        // Las celdas de la clave traducidas por L11 sobre cada tipo de v1 (odd/permisos-por-tipo-ticket,
        // D4, D5 f): lectura con ver todos da también imprimir.
        alcance: {
          actorId: actor.sub,
          permisosPorTipo: new Map([
            ['tipo-1', new Set(['LECTURA', 'VER_TODOS', 'IMPRESION'])],
            ['tipo-2', new Set(['LECTURA', 'VER_TODOS', 'IMPRESION'])],
          ]),
        },
        pagina: 2,
        filtros: expect.objectContaining({ estadoId: ID, busqueda: 'imprime' }),
      }),
    );
    const filtros = listar.mock.calls[0][0].filtros;
    expect(filtros.asignadoId).toBeUndefined();
    expect(filtros.cicloId).toBeUndefined();
    expect(res).toEqual({
      items: [{ numero: 'SOP-2026-00001' }],
      total: 1,
      pagina: 1,
      porPagina: 20,
    });
  });

  it('el detalle pasa por el caso de uso con el mismo alcance y presenta el contrato v1', async () => {
    const { controller, obtener } = await armar();

    const res = await controller.ver(actor, ID);

    // La clave no tiene filas por tipo: sus celdas traducidas por L11 sobre cada tipo de v1, con la
    // misma función que el backfill y las plantillas (odd/permisos-por-tipo-ticket, D4, D5 f).
    const acciones = accionesDeTipoDesdeCeldas(actor.permisos, 'TICKETS');
    expect(acciones).toEqual(new Set(['LECTURA', 'VER_TODOS', 'IMPRESION']));
    expect(obtener).toHaveBeenCalledWith({
      ticketId: ID,
      actorId: actor.sub,
      permisosPorTipo: new Map([
        ['tipo-1', acciones],
        ['tipo-2', acciones],
      ]),
    });
    expect(res).toEqual({ numero: 'SOP-2026-00001' });
  });

  it('sin VER_TODOS en la clave, el detalle lleva LECTURA sin VER_TODOS sobre los tipos de v1', async () => {
    const { controller, obtener } = await armar();

    await controller.ver({ ...actor, permisos: ['TICKETS:LECTURA'] }, ID);

    expect(obtener).toHaveBeenCalledWith({
      ticketId: ID,
      actorId: actor.sub,
      permisosPorTipo: new Map([
        ['tipo-1', new Set(['LECTURA', 'IMPRESION'])],
        ['tipo-2', new Set(['LECTURA', 'IMPRESION'])],
      ]),
    });
  });

  it('un ticket inexistente o de otro cliente es 404', async () => {
    const { controller } = await armar(false);

    await expect(controller.ver(actor, ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea el ticket a nombre del actor (solicitante y autor) con el anio del servidor', async () => {
    const { controller, crear } = await armar();

    await controller.crear(actorDeAlta, { titulo: 'T', tipoId: ID, prioridadId: ID });

    expect(crear).toHaveBeenCalledWith({
      titulo: 'T',
      descripcion: null,
      tipoId: ID,
      prioridadId: ID,
      ticketReferenciaId: null,
      solicitanteId: actor.sub,
      clienteId: 'c1',
      autorId: actor.sub,
      anio: new Date().getFullYear(),
      // La celda de alta de la clave, traducida por L11 sobre cada tipo de v1 (D5 f): el caso de uso
      // exige ALTAS sobre el tipo elegido, como cualquier alta.
      alcance: {
        actorId: actor.sub,
        permisosPorTipo: new Map([
          ['tipo-1', new Set(['ALTAS'])],
          ['tipo-2', new Set(['ALTAS'])],
        ]),
      },
    });
  });

  describe('ubicacion y sector no entran por la API v1 (odd/ubicacion-sector-ticket, CA3)', () => {
    const conCamposNuevos = {
      titulo: 'T',
      tipoId: ID,
      prioridadId: ID,
      ubicacion: 'Aula 3',
      sectorId: ID,
    };

    it('el ValidationPipe global (whitelist) los descarta del body', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      const dto: unknown = await pipe.transform(conCamposNuevos, {
        type: 'body',
        metatype: CrearTicketV1Dto,
      });

      expect(dto).not.toHaveProperty('ubicacion');
      expect(dto).not.toHaveProperty('sectorId');
    });

    it('el mapeo explicito del controller no los pasa al caso de uso aunque lleguen', async () => {
      const { controller, crear } = await armar();

      await controller.crear(actor, conCamposNuevos);

      const recibido: object = crear.mock.calls[0][0];
      expect(recibido).not.toHaveProperty('ubicacion');
      expect(recibido).not.toHaveProperty('sectorId');
    });
  });

  it('T5e: valida el tipo contra los publicados antes de crear', async () => {
    const { controller, validarTipo } = await armar();

    await controller.crear(actor, { titulo: 'T', tipoId: ID, prioridadId: ID });

    expect(validarTipo).toHaveBeenCalledWith(ID);
  });

  it('T5e: un tipo no publicado es 422 y no llega al caso de uso de alta', async () => {
    const { controller, crear } = await armar(true, false);

    await expect(
      controller.crear(actor, { titulo: 'T', tipoId: ID, prioridadId: ID }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('el comentario es siempre publico, de autoria del actor y marcado como de integracion', async () => {
    const { controller, comentar } = await armar();

    const res = await controller.comentar(actorDeComentario, ID, { texto: 'hola' });

    // Solo COMENTAR traduce a COMENTAR; la ampliación explícita de v1 le suma ver todos los tickets
    // del tipo para poder comentarlos (L18).
    expect(comentar).toHaveBeenCalledWith({
      ticketId: ID,
      texto: 'hola',
      autorId: actor.sub,
      esInterno: false,
      autorEsIntegracion: true,
      actorId: actor.sub,
      permisosPorTipo: new Map([
        ['tipo-1', new Set(['COMENTAR', 'LECTURA', 'VER_TODOS'])],
        ['tipo-2', new Set(['COMENTAR', 'LECTURA', 'VER_TODOS'])],
      ]),
    });
    expect(res).toMatchObject({ ticketId: ID, texto: 'hola', esInterno: false });
  });

  it('JD-3: un ticket fuera de v1 es 404 al ver y al comentar, sin llegar a los casos de uso', async () => {
    const { controller, obtener, comentar, validarExistente } = await armar(true, true, false);

    await expect(controller.ver(actor, ID)).rejects.toMatchObject({ status: 404 });
    await expect(controller.comentar(actor, ID, { texto: 'hola' })).rejects.toMatchObject({
      status: 404,
    });
    expect(validarExistente).toHaveBeenCalledWith(ID);
    expect(obtener).not.toHaveBeenCalled();
    expect(comentar).not.toHaveBeenCalled();
  });
});
