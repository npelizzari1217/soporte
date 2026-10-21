/**
 * [UNIT] — `ListarTecnicosAsignablesUseCase`.
 *
 * Puertos mockeados (`vi.fn`) — sin DB. Cubre el camino feliz (técnicos del
 * módulo del tipo, leído de la columna `modulo`, B2) y la REGRESIÓN del gap:
 * un tipo CUSTOM ahora tiene un módulo real → devuelve técnicos (antes, al
 * derivar el módulo por convención de `codigo`, un custom caía en `null` y la
 * lista era `[]`). También el 404 de ticket inexistente.
 */
import { ListarTecnicosAsignablesUseCase } from './listar-tecnicos-asignables.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { Modulo } from '../../../shared/domain/modulos';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { AlcanceActorTicket } from '../services/visibilidad-ticket';

/** Actor que ve cualquier ticket: los casos del universo de técnicos no dependen del acceso. */
const ALCANCE_SIN_RESTRICCION: AlcanceActorTicket = {
  actorId: 'asignador-uuid',
  tienePermisoVerTodos: true,
  modulosPermitidos: null,
};

function makeTicket(tipoId = 'tipo-soporte-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId,
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

describe('ListarTecnicosAsignablesUseCase', () => {
  function makeCollaborators(modulo: Modulo = 'TICKETS') {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    const tipoTicket = TipoTicketEntity.create(
      { codigo: 'ANY', nombre: 'Any', modulo, activo: true },
      'tipo-uuid',
    );
    const tipoTicketRepo = {
      findById: vi.fn<ITipoTicketRepository['findById']>().mockResolvedValue(tipoTicket),
    };
    const usuarioMasterChecker = {
      listarTecnicosAsignables: vi
        .fn<IUsuarioMasterChecker['listarTecnicosAsignables']>()
        .mockResolvedValue([]),
    };

    const useCase = new ListarTecnicosAsignablesUseCase(
      ticketRepo,
      tipoTicketRepo,
      usuarioMasterChecker,
    );
    return { useCase, ticketRepo, tipoTicketRepo, usuarioMasterChecker };
  }

  it('happy: lee el módulo del tipo (columna) y devuelve los técnicos del checker', async () => {
    const c = makeCollaborators('TICKETS');
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    const tecnicos = [
      { id: 'tec-1', nombre: 'Ana', apellido: 'García' },
      { id: 'tec-2', nombre: 'Beto', apellido: 'López' },
    ];
    c.usuarioMasterChecker.listarTecnicosAsignables.mockResolvedValue(tecnicos);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(tecnicos);
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      'TICKETS',
    );
  });

  it('REGRESIÓN gap B2: tipo CUSTOM con módulo real → devuelve técnicos (antes daba [])', async () => {
    // Un tipo custom (COMPRAS_GENERALES) tiene módulo COMPRAS en la columna;
    // antes se derivaba por `codigo` → null → lista vacía. Ahora hay técnicos.
    const c = makeCollaborators('COMPRAS');
    c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-custom-uuid'));
    const tecnicos = [{ id: 'tec-3', nombre: 'Caro', apellido: 'Díaz' }];
    c.usuarioMasterChecker.listarTecnicosAsignables.mockResolvedValue(tecnicos);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(tecnicos);
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      'COMPRAS',
    );
  });

  it('ticket inexistente → TicketNoEncontradoError, sin resolver tipo ni técnicos', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.tipoTicketRepo.findById).not.toHaveBeenCalled();
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).not.toHaveBeenCalled();
  });

  describe('acceso al ticket (odd/permisos-por-tipo-ticket, S0)', () => {
    it('un ticket de un tipo de otro módulo es 404 aunque el actor tenga VER_TODOS; no consulta técnicos', async () => {
      const c = makeCollaborators('EDILICIA');
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...ALCANCE_SIN_RESTRICCION,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.usuarioMasterChecker.listarTecnicosAsignables).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404', async () => {
      const c = makeCollaborators('TICKETS');
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        actorId: 'asignador-uuid',
        tienePermisoVerTodos: false,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'asignador-uuid');
      expect(c.usuarioMasterChecker.listarTecnicosAsignables).not.toHaveBeenCalled();
    });

    it('un ticket de un tipo de sus módulos que el actor ve lista los técnicos', async () => {
      const c = makeCollaborators('TICKETS');
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        actorId: 'solicitante-uuid',
        tienePermisoVerTodos: false,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isOk()).toBe(true);
      expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledTimes(1);
    });

    it('sin restricción de módulo (ROOT o ADMINISTRADOR) lista los técnicos de un tipo de cualquier módulo', async () => {
      const c = makeCollaborators('EDILICIA');
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...ALCANCE_SIN_RESTRICCION,
      });

      expect(result.isOk()).toBe(true);
      expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
        'cliente-uuid',
        'EDILICIA',
      );
    });
  });
});
