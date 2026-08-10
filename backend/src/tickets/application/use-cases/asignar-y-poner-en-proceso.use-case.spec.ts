/**
 * [UNIT] — `AsignarYPonerEnProcesoUseCase`.
 *
 * Puertos mockeados (`vi.fn`), pero se usa la máquina de estados REAL
 * (`BaseTicketStateMachine`) para validar los arcos igual que en producción.
 * Cubre: happy desde NUEVO (asigna + 2 saltos hasta EN_PROCESO con ops de
 * timeline), happy desde ASIGNADO (1 salto), asignado no elegible → falla sin
 * tx, y estado terminal (RESUELTO) → TransicionInvalida sin tx.
 */
import {
  AsignarYPonerEnProcesoUseCase,
  AsignarYPonerEnProcesoDto,
} from './asignar-y-poner-en-proceso.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { BaseTicketStateMachine } from '../../domain/state-machine/base-ticket-state-machine';
import {
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';

/** Catálogo fijo de estados code → { id, codigo } para los mocks del repo. */
const ESTADOS: Record<string, { id: string; codigo: string }> = {
  NUEVO: { id: 'estado-nuevo-uuid', codigo: 'NUEVO' },
  ASIGNADO: { id: 'estado-asignado-uuid', codigo: 'ASIGNADO' },
  EN_PROCESO: { id: 'estado-enproceso-uuid', codigo: 'EN_PROCESO' },
  RESUELTO: { id: 'estado-resuelto-uuid', codigo: 'RESUELTO' },
};

function makeTicket(estadoCodigo: keyof typeof ESTADOS): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: ESTADOS[estadoCodigo].id,
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<AsignarYPonerEnProcesoDto> = {}): AsignarYPonerEnProcesoDto {
  return {
    ticketId: 'ticket-uuid',
    asignadoId: 'agente-uuid',
    autorId: 'asignador-uuid',
    clienteId: 'cliente-uuid',
    ...overrides,
  };
}

describe('AsignarYPonerEnProcesoUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = {
      findById: vi.fn((id: string) => {
        const estado = Object.values(ESTADOS).find((e) => e.id === id);
        return Promise.resolve(estado ?? null);
      }),
      findByCodigo: vi.fn((codigo: string) => Promise.resolve(ESTADOS[codigo] ?? null)),
    };
    const tipoTicketRepo = {
      findById: vi.fn().mockResolvedValue({ codigo: 'SOPORTE' }),
      findIdByCodigo: vi.fn(async (codigo: string) =>
        codigo === 'SOPORTE' ? 'tipo-soporte-uuid' : null,
      ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn(async (codigo: string) =>
        codigo === 'ASIGNACION' ? 'tipo-op-asignacion-uuid' : 'tipo-op-cambio-uuid',
      ),
    };
    const usuarioMasterChecker = {
      estaActivoEnTenant: vi.fn().mockResolvedValue(true),
      getAutorizacionModulos: vi
        .fn()
        .mockResolvedValue({ esAdminTotal: false, modulos: ['SOPORTE'] }),
    };
    const stateMachineFactory = { resolve: vi.fn(() => new BaseTicketStateMachine()) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AsignarYPonerEnProcesoUseCase(
      ticketRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoTicketRepo as never,
      tipoOperacionRepo as never,
      usuarioMasterChecker as never,
      stateMachineFactory as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      stateMachineFactory,
      txRunner,
    };
  }

  it('happy desde NUEVO: asigna y avanza NUEVO→ASIGNADO→EN_PROCESO con 1 ASIGNACION + 2 CAMBIO_ESTADO', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.asignadoId).toBe('agente-uuid');
    expect(ticket.estadoId).toBe(ESTADOS.EN_PROCESO.id);

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    // 1 ASIGNACION + 2 CAMBIO_ESTADO.
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(3);

    const ops = c.operacionRepo.save.mock.calls.map((call) => call[0]);
    expect(ops[0].tipoOperacionId).toBe('tipo-op-asignacion-uuid');
    expect(ops[0].estadoAnteriorId).toBeNull();
    expect(ops[0].estadoNuevoId).toBeNull();
    // Primer salto NUEVO→ASIGNADO.
    expect(ops[1].tipoOperacionId).toBe('tipo-op-cambio-uuid');
    expect(ops[1].estadoAnteriorId).toBe(ESTADOS.NUEVO.id);
    expect(ops[1].estadoNuevoId).toBe(ESTADOS.ASIGNADO.id);
    // Segundo salto ASIGNADO→EN_PROCESO.
    expect(ops[2].estadoAnteriorId).toBe(ESTADOS.ASIGNADO.id);
    expect(ops[2].estadoNuevoId).toBe(ESTADOS.EN_PROCESO.id);
  });

  it('happy desde ASIGNADO: solo avanza →EN_PROCESO (1 ASIGNACION + 1 CAMBIO_ESTADO)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('ASIGNADO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estadoId).toBe(ESTADOS.EN_PROCESO.id);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(2);
    const ops = c.operacionRepo.save.mock.calls.map((call) => call[0]);
    expect(ops[1].estadoAnteriorId).toBe(ESTADOS.ASIGNADO.id);
    expect(ops[1].estadoNuevoId).toBe(ESTADOS.EN_PROCESO.id);
  });

  it('asignado inactivo/fuera del tenant → AsignadoInvalidoError, sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    c.usuarioMasterChecker.estaActivoEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('asignado normal SIN el módulo del tipo → AsignadoNoElegibleError, sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: false,
      modulos: ['COMPRAS'],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('estado terminal/posterior (RESUELTO) → TransicionInvalidaError, sin mutar ni tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('RESUELTO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('ticket inexistente → TicketNoEncontradoError, sin tocar checkers/tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
