/**
 * TramosTecnicoTicketController (odd/tasks/tiempo-tecnico.md, T4, S8) — unit: el alcance que pasa
 * al caso de uso, la proyección con los nombres de master, el mapeo del 404 y la metadata de
 * autorización. La visibilidad real contra la base la prueba
 * `tiempo-tecnico/tiempo-tecnico-lectura.integration.spec.ts`.
 */
import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { Result } from '../../../shared/domain/result';
import { accionesPorRuta } from '../../../shared/test-helpers/acciones-por-ruta';
import { ListarTramosTicketUseCase } from '../../../tiempo-tecnico/application/listar-tramos-ticket.use-case';
import { TramoTecnico } from '../../../tiempo-tecnico/domain/ports/i-tramo-tecnico.repository';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { CargadorAlcanceTicket } from '../alcance-ticket';
import { TramosTecnicoTicketController } from './tramos-tecnico-ticket.controller';

const ANA = 'tecnico-ana';
const BETO = 'tecnico-beto';

const CERRADO: TramoTecnico = {
  id: 'tramo-1',
  ticketId: 'ticket-1',
  tecnicoId: ANA,
  inicioAt: new Date('2026-10-05T12:00:00.000Z'),
  finAt: new Date('2026-10-05T14:00:00.000Z'),
  motivoFin: 'RESUELTO',
  habilS: 7200,
  metaS: 14_400,
  cumplido: true,
};
const ABIERTO: TramoTecnico = {
  id: 'tramo-2',
  ticketId: 'ticket-1',
  tecnicoId: BETO,
  inicioAt: new Date('2026-10-06T12:00:00.000Z'),
  finAt: null,
  motivoFin: null,
  habilS: null,
  metaS: null,
  cumplido: null,
};

function buildController() {
  const execute = vi.fn<ListarTramosTicketUseCase['execute']>();
  const caso: ListarTramosTicketUseCase = Object.create(ListarTramosTicketUseCase.prototype, {
    execute: { value: execute },
  });
  const resolverNombres = vi
    .fn<IUsuarioMasterChecker['resolverNombres']>()
    .mockResolvedValue(new Map([[ANA, { nombre: 'Ana', apellido: 'Paz' }]]));
  const checker: IUsuarioMasterChecker = {
    existeEnTenant: async () => true,
    estaActivoEnTenant: async () => true,
    resolverNombres,
    listarAgentes: async () => [],
  };
  // `tecnico-uuid` tiene LECTURA sobre `tipo-1` en la tabla del tenant.
  const alcances = new CargadorAlcanceTicket(
    new PermisosTipoTicketEnMemoria(
      [],
      [{ usuarioId: 'tecnico-uuid', tipoId: 'tipo-1', accion: 'LECTURA' }],
    ),
  );
  return {
    controller: new TramosTecnicoTicketController(caso, checker, alcances),
    execute,
    resolverNombres,
  };
}

const TECNICO = payloadDeTest({ sub: 'tecnico-uuid', cliente_id: 'cliente-uuid', rol: 'TECNICO' });

describe('TramosTecnicoTicketController — GET /tickets/:id/tramos-tecnico', () => {
  it('pasa el ticket y el alcance por tipo del actor al caso de uso', async () => {
    const { controller, execute } = buildController();
    execute.mockResolvedValue(Result.ok([]));

    await controller.listar(TECNICO, 'ticket-1');

    expect(execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      actorId: 'tecnico-uuid',
      permisosPorTipo: new Map([['tipo-1', new Set(['LECTURA'])]]),
    });
  });

  it('devuelve cada tramo con el nombre del técnico; el abierto sin medición ni veredicto', async () => {
    const { controller, execute, resolverNombres } = buildController();
    execute.mockResolvedValue(Result.ok([CERRADO, ABIERTO, { ...CERRADO, id: 'tramo-3' }]));

    const result = await controller.listar(TECNICO, 'ticket-1');

    // Un solo lote a master, sin ids repetidos.
    expect(resolverNombres).toHaveBeenCalledTimes(1);
    expect(resolverNombres).toHaveBeenCalledWith([ANA, BETO]);
    expect(result).toEqual([
      {
        id: 'tramo-1',
        tecnicoId: ANA,
        tecnicoNombre: 'Ana',
        tecnicoApellido: 'Paz',
        inicioAt: '2026-10-05T12:00:00.000Z',
        finAt: '2026-10-05T14:00:00.000Z',
        motivoFin: 'RESUELTO',
        habilS: 7200,
        metaS: 14_400,
        cumplido: true,
      },
      // BETO no está en master: nombre y apellido en null.
      {
        id: 'tramo-2',
        tecnicoId: BETO,
        tecnicoNombre: null,
        tecnicoApellido: null,
        inicioAt: '2026-10-06T12:00:00.000Z',
        finAt: null,
        motivoFin: null,
        habilS: null,
        metaS: null,
        cumplido: null,
      },
      expect.objectContaining({ id: 'tramo-3', tecnicoNombre: 'Ana' }),
    ]);
  });

  it('sin tramos devuelve una lista vacía sin consultar master', async () => {
    const { controller, execute, resolverNombres } = buildController();
    execute.mockResolvedValue(Result.ok([]));

    await expect(controller.listar(TECNICO, 'ticket-1')).resolves.toEqual([]);
    expect(resolverNombres).not.toHaveBeenCalled();
  });

  it('un ticket que el actor no ve es 404, sin consultar master', async () => {
    const { controller, execute, resolverNombres } = buildController();
    execute.mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-1')));

    await expect(controller.listar(TECNICO, 'ticket-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(resolverNombres).not.toHaveBeenCalled();
  });

  it('ni el controller ni sus rutas declaran @RequiereAcciones: decide la visibilidad del ticket', () => {
    expect(Reflect.getMetadata(ACCIONES_KEY, TramosTecnicoTicketController)).toBeUndefined();
    expect([...accionesPorRuta(TramosTecnicoTicketController)]).toEqual([['listar', []]]);
  });
});
