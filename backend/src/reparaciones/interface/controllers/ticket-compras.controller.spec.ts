/**
 * [CONTROLLER] — `TicketComprasController` (odd/ticket-unificado, S1, S4).
 *
 * Unit test con los casos de uso espiados (sin Nest ni guards): traducción HTTP ↔ caso de uso por
 * id de ticket, mapeo de errores y las acciones de matriz que declara cada ruta.
 */
import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { accionesPorRuta } from '../../../shared/test-helpers/acciones-por-ruta';
import { espiado } from '../../../shared/test-helpers/espiado';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  CompraNoEncontradaError,
  VinculoNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { ListarComprasDeTicketUseCase } from '../../application/use-cases/listar-compras-de-ticket.use-case';
import { VincularCompraAReparacionUseCase } from '../../application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from '../../application/use-cases/desvincular-compra-de-reparacion.use-case';
import { TicketComprasController } from './ticket-compras.controller';

const USER = payloadDeTest({
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'TECNICO',
  permisos: [],
  cliente_nombre: 'Cliente Test',
});

/** El alcance que el cargador arma con las filas de la tabla en memoria. */
const ALCANCE_USER = {
  actorId: 'usuario-uuid',
  permisosPorTipo: new Map([['tipo-soporte-uuid', new Set(['LECTURA', 'MODIFICACION'])]]),
};

function armar() {
  const listar = espiado(ListarComprasDeTicketUseCase);
  const vincular = espiado(VincularCompraAReparacionUseCase);
  const desvincular = espiado(DesvincularCompraDeReparacionUseCase);
  const alcances = new CargadorAlcanceTicket(
    new PermisosTipoTicketEnMemoria(
      [],
      [
        { usuarioId: 'usuario-uuid', tipoId: 'tipo-soporte-uuid', accion: 'LECTURA' },
        { usuarioId: 'usuario-uuid', tipoId: 'tipo-soporte-uuid', accion: 'MODIFICACION' },
      ],
    ),
  );
  const controller = new TicketComprasController(
    listar.caso,
    vincular.caso,
    desvincular.caso,
    alcances,
  );
  return { controller, listar, vincular, desvincular };
}

describe('TicketComprasController', () => {
  it('vincular y desvincular declaran COMPRAS:LECTURA; listar no declara ninguna celda', () => {
    expect(Object.fromEntries(accionesPorRuta(TicketComprasController))).toEqual({
      listar: [],
      vincular: ['COMPRAS:LECTURA'],
      desvincular: ['COMPRAS:LECTURA'],
    });
  });

  describe('GET /tickets/:ticketId/compras', () => {
    it('lista las compras del ticket con id, número, grupo y bloqueo', async () => {
      const { controller, listar } = armar();
      listar.execute.mockResolvedValue(
        Result.ok([
          { compraId: 'c1', numero: 'COM-2026-00001', grupo: 'ACTIVAS', bloquea: true },
          { compraId: 'c2', numero: 'COM-2026-00002', grupo: 'COMPLETADAS', bloquea: false },
        ]),
      );

      const respuesta = await controller.listar('ticket-uuid', USER);

      expect(respuesta).toEqual([
        { id: 'c1', numero: 'COM-2026-00001', grupo: 'ACTIVAS', bloquea: true },
        { id: 'c2', numero: 'COM-2026-00002', grupo: 'COMPLETADAS', bloquea: false },
      ]);
      expect(listar.execute).toHaveBeenCalledWith('ticket-uuid', ALCANCE_USER);
    });

    it('un ticket que el actor no ve → 404', async () => {
      const { controller, listar } = armar();
      listar.execute.mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-uuid')));

      await expect(controller.listar('ticket-uuid', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('POST /tickets/:ticketId/compras', () => {
    it('vincula por id de ticket con el alcance del actor', async () => {
      const { controller, vincular } = armar();
      vincular.execute.mockResolvedValue(Result.ok(undefined));

      await controller.vincular('ticket-uuid', { compraId: 'compra-uuid' }, USER);

      expect(vincular.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-uuid',
        compraId: 'compra-uuid',
        alcance: ALCANCE_USER,
      });
    });

    it.each([
      [
        'sin MODIFICACION sobre el tipo',
        new AccionSobreTipoNoPermitidaError('MODIFICACION'),
        ForbiddenException,
      ],
      ['compra inexistente', new CompraNoEncontradaError('compra-uuid'), NotFoundException],
      ['ticket que no ve', new TicketNoEncontradoError('ticket-uuid'), NotFoundException],
    ])('%s → %p', async (_caso, error, excepcion) => {
      const { controller, vincular } = armar();
      vincular.execute.mockResolvedValue(Result.fail(error));

      await expect(
        controller.vincular('ticket-uuid', { compraId: 'compra-uuid' }, USER),
      ).rejects.toThrow(new excepcion(error.message));
    });
  });

  describe('DELETE /tickets/:ticketId/compras/:compraId', () => {
    it('desvincula por id de ticket con el alcance del actor', async () => {
      const { controller, desvincular } = armar();
      desvincular.execute.mockResolvedValue(Result.ok(undefined));

      await controller.desvincular('ticket-uuid', 'compra-uuid', USER);

      expect(desvincular.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-uuid',
        compraId: 'compra-uuid',
        alcance: ALCANCE_USER,
      });
    });

    it('un vínculo inexistente → 404 con el mensaje del dominio', async () => {
      const { controller, desvincular } = armar();
      const error = new VinculoNoEncontradoError('ticket-uuid', 'compra-uuid');
      desvincular.execute.mockResolvedValue(Result.fail(error));

      await expect(controller.desvincular('ticket-uuid', 'compra-uuid', USER)).rejects.toThrow(
        new NotFoundException(
          'No existe un vínculo entre el ticket "ticket-uuid" y la compra "compra-uuid".',
        ),
      );
    });
  });
});
