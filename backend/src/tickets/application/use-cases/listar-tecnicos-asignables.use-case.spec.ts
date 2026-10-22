/**
 * [UNIT] — `ListarTecnicosAsignablesUseCase`.
 *
 * Sin DB: `ElegibilidadAsignado` real sobre dobles en memoria. Cubre el universo por tipo
 * (odd/permisos-por-tipo-ticket, D5 g): TECNICO o COLABORADOR con `LECTURA` sobre el tipo del
 * ticket, sin importar las celdas por módulo de master. También el 404 de ticket inexistente.
 */
import { ListarTecnicosAsignablesUseCase } from './listar-tecnicos-asignables.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';

/** Actor que ve cualquier ticket: los casos del universo de técnicos no dependen del acceso. */
const ALCANCE_SIN_RESTRICCION = alcanceSinRestriccion('asignador-uuid');

const ANA = { id: 'tec-1', nombre: 'Ana', apellido: 'García' };
const BETO = { id: 'tec-2', nombre: 'Beto', apellido: 'López' };
const CARO = { id: 'tec-3', nombre: 'Caro', apellido: 'Díaz' };

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
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    // Ana y Beto atienden Soporte; Caro, Electricidad. Caro tiene además la celda del módulo
    // TICKETS, que ya no la vuelve elegible para Soporte.
    const master = new MasterAgentesEnMemoria();
    master.agregar({ ...ANA, rol: 'TECNICO', celdas: [] });
    master.agregar({ ...BETO, rol: 'COLABORADOR', celdas: [] });
    master.agregar({ ...CARO, rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
    const permisos = new PermisosTipoTicketEnMemoria(
      [],
      [
        { usuarioId: ANA.id, tipoId: 'tipo-soporte-uuid', accion: 'LECTURA' },
        { usuarioId: BETO.id, tipoId: 'tipo-soporte-uuid', accion: 'LECTURA' },
        { usuarioId: CARO.id, tipoId: 'tipo-electricidad-uuid', accion: 'LECTURA' },
      ],
    );
    const elegibilidad = new ElegibilidadAsignado(master, permisos);
    const listarAgentesDeTipo = vi.spyOn(elegibilidad, 'listarAgentesDeTipo');

    const useCase = new ListarTecnicosAsignablesUseCase(ticketRepo, elegibilidad);
    return { useCase, ticketRepo, listarAgentesDeTipo };
  }

  it('happy: devuelve los agentes con LECTURA sobre el tipo del ticket', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([ANA, BETO]);
    expect(c.listarAgentesDeTipo).toHaveBeenCalledWith('cliente-uuid', 'tipo-soporte-uuid');
  });

  it('decide por tipo: un ticket de Electricidad lista solo a quien atiende Electricidad', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-electricidad-uuid'));

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.getValue()).toEqual([CARO]);
  });

  it('un tipo sin filas no tiene agentes, aunque haya técnicos con celdas de su módulo', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-mantenimiento-uuid'));

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.getValue()).toEqual([]);
  });

  it('ticket inexistente → TicketNoEncontradoError, sin resolver técnicos', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      ...ALCANCE_SIN_RESTRICCION,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.listarAgentesDeTipo).not.toHaveBeenCalled();
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, S6)', () => {
    // Mismo usuario: Soporte con Ver y Asignar, Mantenimiento solo con Ver, Electricidad sin nada.
    const alcance = alcancePorTipo('solicitante-uuid', {
      'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR'],
      'tipo-mantenimiento-uuid': ['LECTURA'],
    });

    it('un ticket de un tipo con ASIGNAR lista los técnicos', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...alcance,
      });

      expect(result.isOk()).toBe(true);
      expect(c.listarAgentesDeTipo).toHaveBeenCalledTimes(1);
    });

    it('un ticket de un tipo con solo LECTURA es 403; no consulta técnicos', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-mantenimiento-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...alcance,
      });

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(c.listarAgentesDeTipo).not.toHaveBeenCalled();
    });

    it('un ticket de un tipo sin LECTURA es 404; no consulta técnicos', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-electricidad-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...alcance,
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.listarAgentesDeTipo).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...alcancePorTipo('asignador-uuid', { 'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR'] }),
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'asignador-uuid');
      expect(c.listarAgentesDeTipo).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) lista los técnicos de un tipo sin filas', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-electricidad-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        clienteId: 'cliente-uuid',
        ...ALCANCE_SIN_RESTRICCION,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([CARO]);
    });
  });
});
