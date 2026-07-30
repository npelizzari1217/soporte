/**
 * 4.10 — RED: el evento `TicketEstadoCambiado` publicado por AMBOS caminos de
 * cambio de estado (`TransicionarEstadoUseCase` — camino oficial PATCH, y
 * `CrearObservacionUseCase` — auto-transición inline desde APROBADO) tiene
 * EXACTAMENTE la misma forma: mismos campos, mismos tipos. El handler de
 * notificación NO necesita distinguir de qué camino vino el evento.
 *
 * Ref spec: Requirement 9 Scenario "El evento publicado desde el camino de
 * auto-transición tiene la misma forma que el publicado desde el camino oficial".
 * Ref design: §6 (los dos puntos de publicación), §5 (firma única del evento).
 * Ref tasks: PR4 4.10.
 */
import { TransicionarEstadoDto, TransicionarEstadoUseCase } from './transicionar-estado.use-case';
import { CrearObservacionDto, CrearObservacionUseCase } from './crear-observacion.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ITicketStateMachine } from '../../domain/state-machine/i-ticket-state-machine';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';

const TICKET_ID = 'ticket-forma-identica-001';
const AUTOR_ID = 'user-autor-forma-identica';
const CLIENTE_ID = 'cliente-forma-identica';
const SOLICITANTE_ID = 'solicitante-forma-identica';
const TIPO_ID = 'tipo-uuid-forma-identica';
const ESTADO_ORIGEN_ID = 'estado-origen-uuid';
const ESTADO_RESUELTO_ID = 'estado-resuelto-uuid';

function makeEstado(id: string, codigo: string): EstadoEntity {
  return EstadoEntity.reconstitute(
    { codigo, nombre: codigo, color: null, orden: 10, activo: true },
    id,
    new Date(),
    new Date(),
    null,
  );
}

function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
  return {
    numero: 'SOP-2026-09999',
    titulo: 'Ticket forma idéntica',
    descripcion: null,
    tipoId: TIPO_ID,
    estadoId: ESTADO_ORIGEN_ID,
    prioridadId: 'prioridad-001',
    cicloId: null,
    solicitanteId: SOLICITANTE_ID,
    asignadoId: null,
    fechaCierre: null,
    ...overrides,
  };
}

describe('TicketEstadoCambiado — misma forma en ambos caminos de publicación (R9)', () => {
  it('el evento publicado vía TransicionarEstadoUseCase y vía CrearObservacionUseCase tiene las mismas claves y tipos', async () => {
    // ─── Camino A: TransicionarEstadoUseCase (PATCH oficial) ─────────────────
    const publishMockA = vi.fn();
    const publisherA: IDomainEventPublisher = { publish: publishMockA };
    const ticketA = TicketEntity.reconstitute(
      makeTicketProps({ estadoId: ESTADO_ORIGEN_ID }),
      TICKET_ID,
      new Date(),
      new Date(),
      null,
    );
    const ticketRepoA: vi.Mocked<ITicketRepository> = {
      findById: vi.fn().mockResolvedValue(ticketA),
      findByNumero: vi.fn(),
      findLastSecuencia: vi.fn(),
      findAll: vi.fn(),
      findByEstado: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    };
    const operacionRepoA: vi.Mocked<IOperacionTicketRepository> = {
      findByTicketId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const estadoRepoA: vi.Mocked<IEstadoRepository> = {
      findById: vi.fn().mockResolvedValue(makeEstado(ESTADO_ORIGEN_ID, 'EN_PROGRESO')),
      findByCodigo: vi.fn().mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO')),
      findAllActive: vi.fn(),
      findAll: vi.fn(),
    };
    const tipoTicketRepoA: vi.Mocked<ITipoTicketRepository> = {
      findCodigoById: vi.fn().mockResolvedValue('SOPORTE'),
    };
    const tipoOperacionRepoA: vi.Mocked<ITipoOperacionRepository> = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado'),
    };
    const mockMachineA: vi.Mocked<ITicketStateMachine> = { puedeTransicionar: vi.fn(() => true) };
    const factoryA: Pick<TicketStateMachineFactory, 'resolve'> = {
      resolve: vi.fn().mockReturnValue(mockMachineA),
    };
    const txRunnerA: ITenantTransactionRunner = { run: vi.fn((fn) => fn()) };
    const loggerA: ILogger = { error: vi.fn() };

    const transicionarUseCase = new TransicionarEstadoUseCase(
      ticketRepoA,
      operacionRepoA,
      estadoRepoA,
      tipoTicketRepoA,
      tipoOperacionRepoA,
      factoryA,
      txRunnerA,
      publisherA,
      loggerA,
    );

    const dtoA: TransicionarEstadoDto = {
      ticketId: TICKET_ID,
      nuevoEstadoCodigo: 'RESUELTO',
      autorId: AUTOR_ID,
      clienteId: CLIENTE_ID,
      fechaCierre: new Date('2026-07-30'),
    };
    await transicionarUseCase.execute(dtoA);

    expect(publishMockA).toHaveBeenCalledOnce();
    const eventoCaminoOficial = publishMockA.mock.calls[0][0] as TicketEstadoCambiado;

    // ─── Camino B: CrearObservacionUseCase (auto-transición desde APROBADO) ──
    const publishMockB = vi.fn();
    const publisherB: IDomainEventPublisher = { publish: publishMockB };
    const ticketB = TicketEntity.reconstitute(
      makeTicketProps({ estadoId: ESTADO_ORIGEN_ID }),
      TICKET_ID,
      new Date(),
      new Date(),
      null,
    );
    const ticketRepoB: vi.Mocked<ITicketRepository> = {
      findById: vi.fn().mockResolvedValue(ticketB),
      findByNumero: vi.fn(),
      findLastSecuencia: vi.fn(),
      findAll: vi.fn(),
      findByEstado: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
    };
    const operacionRepoB: vi.Mocked<IOperacionTicketRepository> = {
      findByTicketId: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const estadoRepoB: vi.Mocked<IEstadoRepository> = {
      findById: vi.fn().mockResolvedValue(makeEstado(ESTADO_ORIGEN_ID, 'APROBADO')),
      findByCodigo: vi.fn().mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO')),
      findAllActive: vi.fn(),
      findAll: vi.fn(),
    };
    const tipoOperacionRepoB: vi.Mocked<ITipoOperacionRepository> = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado'),
    };
    const tipoTicketRepoB: vi.Mocked<ITipoTicketRepository> = {
      findCodigoById: vi.fn().mockResolvedValue('SOPORTE'),
    };
    const txRunnerB: ITenantTransactionRunner = { run: vi.fn((fn) => fn()) };
    const loggerB: ILogger = { error: vi.fn() };

    const crearObservacionUseCase = new CrearObservacionUseCase(
      ticketRepoB,
      estadoRepoB,
      operacionRepoB,
      tipoOperacionRepoB,
      txRunnerB,
      tipoTicketRepoB,
      publisherB,
      loggerB,
    );

    const dtoB: CrearObservacionDto = {
      ticketId: TICKET_ID,
      texto: 'Observación equivalente',
      autorId: AUTOR_ID,
      clienteId: CLIENTE_ID,
      estadoDestinoCodigo: 'RESUELTO',
      fechaCierre: new Date('2026-07-30'),
    };
    await crearObservacionUseCase.execute(dtoB);

    expect(publishMockB).toHaveBeenCalledOnce();
    const eventoCaminoObservacion = publishMockB.mock.calls[0][0] as TicketEstadoCambiado;

    // ─── Comparación de forma (R9): mismas claves, mismos tipos ───────────────
    expect(eventoCaminoOficial).toBeInstanceOf(TicketEstadoCambiado);
    expect(eventoCaminoObservacion).toBeInstanceOf(TicketEstadoCambiado);

    const clavesOficial = Object.keys(eventoCaminoOficial).sort();
    const clavesObservacion = Object.keys(eventoCaminoObservacion).sort();
    expect(clavesObservacion).toEqual(clavesOficial);

    const entradasOficial = Object.entries(eventoCaminoOficial);
    const mapaObservacion = new Map(Object.entries(eventoCaminoObservacion));
    for (const [clave, valorOficial] of entradasOficial) {
      expect(typeof mapaObservacion.get(clave)).toBe(typeof valorOficial);
    }

    // Valores de negocio equivalentes por construcción (mismo ticket, mismo destino):
    expect(eventoCaminoObservacion.ticketId).toBe(eventoCaminoOficial.ticketId);
    expect(eventoCaminoObservacion.numero).toBe(eventoCaminoOficial.numero);
    expect(eventoCaminoObservacion.tituloTicket).toBe(eventoCaminoOficial.tituloTicket);
    expect(eventoCaminoObservacion.tipoCodigo).toBe(eventoCaminoOficial.tipoCodigo);
    expect(eventoCaminoObservacion.estadoNuevoCodigo).toBe(eventoCaminoOficial.estadoNuevoCodigo);
    expect(eventoCaminoObservacion.solicitanteId).toBe(eventoCaminoOficial.solicitanteId);
    expect(eventoCaminoObservacion.tenantId).toBe(eventoCaminoOficial.tenantId);
    expect(eventoCaminoObservacion.autorId).toBe(eventoCaminoOficial.autorId);
  });
});
