import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { Result } from '../../shared/domain/result';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../tickets/domain/errors/tickets.errors';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';
import { TicketsV1Controller } from './tickets-v1.controller';
import { TicketsV1Presenter } from './tickets-v1.presenter';

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

async function armar(encontrado = true) {
  const listar = vi
    .fn()
    .mockResolvedValue(Result.ok({ items: [ticket()], total: 1, pagina: 1, porPagina: 20 }));
  const obtener = vi
    .fn()
    .mockResolvedValue(
      encontrado ? Result.ok(ticket()) : Result.fail(new TicketNoEncontradoError(ID)),
    );
  const presentar = vi.fn().mockResolvedValue([{ numero: 'SOP-2026-00001' }]);
  const modulo = await Test.createTestingModule({
    controllers: [TicketsV1Controller],
    providers: [
      { provide: TicketsV1Presenter, useValue: { presentar } },
      { provide: ListarTicketsUseCase, useValue: { execute: listar } },
      { provide: ObtenerTicketUseCase, useValue: { execute: obtener } },
    ],
  })
    .overrideGuard(ApiClaveGuard)
    .useValue({})
    .overrideGuard(ApiV1ThrottlerGuard)
    .useValue({})
    .overrideGuard(AccionesGuard)
    .useValue({})
    .compile();
  return { controller: modulo.get(TicketsV1Controller), listar, obtener, presentar };
}

describe('TicketsV1Controller (lectura)', () => {
  it('lista con el alcance del actor sintetico y sin filtros internos', async () => {
    const { controller, listar } = await armar();

    const res = await controller.listar(actor, { estado: ID, pagina: 2, busqueda: 'imprime' });

    expect(listar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor.sub,
        tienePermisoVerTodos: true,
        modulosPermitidos: ['TICKETS'],
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

    expect(obtener).toHaveBeenCalledWith({
      ticketId: ID,
      actorId: actor.sub,
      tienePermisoVerTodos: true,
    });
    expect(res).toEqual({ numero: 'SOP-2026-00001' });
  });

  it('un ticket inexistente o de otro cliente es 404', async () => {
    const { controller } = await armar(false);

    await expect(controller.ver(actor, ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
