/**
 * PR4a — Unit tests para CrearComentarioUseCase. (T4A.1–T4A.6)
 *
 * Todos los repositorios son mockeados (sin Prisma ni DB).
 * NO hay txRunner: el comentario solo guarda una OperacionTicket, sin
 * modificar el ticket → una sola escritura, sin transacción distribuida.
 *
 * Cubre (ADR-2, spec tickets-core §CrearComentarioUseCase):
 * T4A.1 — Ticket no encontrado → TicketNoEncontradoError 404; save NOT called
 * T4A.2 — Terminales (RESUELTO, SIN_SOLUCION, RECHAZADO) → ComentarioNoPermitidoError 422
 * T4A.3 — Congelados legacy (CERRADO, CANCELADO, PENDIENTE_APROBACION) → mismo error
 * T4A.4 — ABIERTO → Result.ok(operacion); tipo_operacion_id = COMENTARIO; ticketRepo.save NOT called
 * T4A.5 — APROBADO → permitido; estado del ticket NO cambia (vs. CrearObservacionUseCase)
 * T4A.6 — EN_PROGRESO y SUSPENDIDO → permitidos
 * Extra — catálogo corrupto → EstadoCatalogoNoEncontradoError
 * Extra — COMENTARIO ausente del catálogo → TipoOperacionNoEncontradoError
 * Multi-tenant — ticket de otro tenant (findById → null) → TicketNoEncontradoError
 *
 * Ref spec: specs/tickets-core/spec.md §CrearComentarioUseCase
 * Ref design: ADR-2
 * Change: tickets-rbac-4-roles / PR4a
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CrearComentarioDto, CrearComentarioUseCase } from './crear-comentario.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import {
  ComentarioNoPermitidoError,
  EstadoCatalogoNoEncontradoError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-pr4a-001';
const AUTOR_ID = 'user-autor-pr4a-001';

const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const ESTADO_APROBADO_ID = 'c0000000-0000-4000-c000-000000000003';
const ESTADO_EN_PROGRESO_ID = 'c0000000-0000-4000-c000-000000000005';
const ESTADO_SUSPENDIDO_ID = 'c0000000-0000-4000-c000-000000000009';
const ESTADO_RESUELTO_ID = 'c0000000-0000-4000-c000-000000000006';
const ESTADO_SIN_SOLUCION_ID = 'c0000000-0000-4000-c000-00000000000a';
const ESTADO_RECHAZADO_ID = 'c0000000-0000-4000-c000-000000000004';
const ESTADO_CERRADO_ID = 'c0000000-0000-4000-c000-000000000007';
const ESTADO_CANCELADO_ID = 'c0000000-0000-4000-c000-000000000008';
const ESTADO_PENDIENTE_APROBACION_ID = 'c0000000-0000-4000-c000-000000000002';

const TIPO_OP_COMENTARIO_ID = 'f0000000-0000-4000-f000-000000000002';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEstado(codigo: string, id: string): EstadoEntity {
  return EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 10, activo: true }, id);
}

function makeTicketProps(estadoId: string): TicketProps {
  return {
    numero: 'SOP-2026-00201',
    titulo: 'Ticket de comentario PR4a',
    descripcion: null,
    tipoId: 'tipo-uuid-001',
    estadoId,
    prioridadId: 'prio-uuid-001',
    cicloId: null,
    solicitanteId: 'user-solicitante-001',
    asignadoId: null,
    fechaCierre: null,
  };
}

function makeTicket(estadoId: string): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps(estadoId),
    TICKET_ID,
    new Date(),
    new Date(),
    null,
  );
}

const baseDto: CrearComentarioDto = {
  ticketId: TICKET_ID,
  texto: 'Un comentario sobre el estado del ticket',
  autorId: AUTOR_ID,
};

// ─── Mocks factory ────────────────────────────────────────────────────────────

function makeMocks() {
  const ticketRepo: vi.Mocked<ITicketRepository> = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  };

  const estadoRepo: vi.Mocked<IEstadoRepository> = {
    findById: vi.fn(),
    findByCodigo: vi.fn(),
    findAllActive: vi.fn(),
    findAll: vi.fn(),
  };

  const operacionRepo: vi.Mocked<IOperacionTicketRepository> = {
    findByTicketId: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const tipoOperacionRepo: vi.Mocked<ITipoOperacionRepository> = {
    findIdByCodigo: vi.fn(),
  };

  return { ticketRepo, estadoRepo, operacionRepo, tipoOperacionRepo };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearComentarioUseCase', () => {
  let ticketRepo: vi.Mocked<ITicketRepository>;
  let estadoRepo: vi.Mocked<IEstadoRepository>;
  let operacionRepo: vi.Mocked<IOperacionTicketRepository>;
  let tipoOperacionRepo: vi.Mocked<ITipoOperacionRepository>;
  let useCase: CrearComentarioUseCase;

  beforeEach(() => {
    const mocks = makeMocks();
    ticketRepo = mocks.ticketRepo;
    estadoRepo = mocks.estadoRepo;
    operacionRepo = mocks.operacionRepo;
    tipoOperacionRepo = mocks.tipoOperacionRepo;
    useCase = new CrearComentarioUseCase(ticketRepo, estadoRepo, operacionRepo, tipoOperacionRepo);
  });

  // ─── T4A.1: Ticket no encontrado ─────────────────────────────────────────────

  it('T4A.1: ticket no encontrado → TicketNoEncontradoError 404; operacionRepo.save NOT llamado', async () => {
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  // ─── T4A.2: Estados terminales activos bloquean comentario ───────────────────

  it.each([
    ['RESUELTO', ESTADO_RESUELTO_ID],
    ['SIN_SOLUCION', ESTADO_SIN_SOLUCION_ID],
    ['RECHAZADO', ESTADO_RECHAZADO_ID],
  ])(
    'T4A.2: ticket en %s (terminal) → ComentarioNoPermitidoError 422; save NOT llamado',
    async (codigo, id) => {
      ticketRepo.findById.mockResolvedValue(makeTicket(id));
      estadoRepo.findById.mockResolvedValue(makeEstado(codigo, id));

      const result = await useCase.execute(baseDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ComentarioNoPermitidoError);
      expect((result.getError() as ComentarioNoPermitidoError).code).toBe(
        'COMENTARIO_NO_PERMITIDO',
      );
      expect(operacionRepo.save).not.toHaveBeenCalled();
    },
  );

  // ─── T4A.3: Estados congelados legacy bloquean comentario ────────────────────

  it.each([
    ['CERRADO', ESTADO_CERRADO_ID],
    ['CANCELADO', ESTADO_CANCELADO_ID],
    ['PENDIENTE_APROBACION', ESTADO_PENDIENTE_APROBACION_ID],
  ])(
    'T4A.3: ticket en %s (congelado legacy) → ComentarioNoPermitidoError 422; save NOT llamado',
    async (codigo, id) => {
      ticketRepo.findById.mockResolvedValue(makeTicket(id));
      estadoRepo.findById.mockResolvedValue(makeEstado(codigo, id));

      const result = await useCase.execute(baseDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ComentarioNoPermitidoError);
      expect(operacionRepo.save).not.toHaveBeenCalled();
    },
  );

  // ─── T4A.4: ABIERTO → ok con operacion COMENTARIO ───────────────────────────

  it('T4A.4: ticket en ABIERTO → Result.ok(operacion); tipo=COMENTARIO; estadoAnterior/Nuevo null; ticketRepo.save NOT llamado', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('ABIERTO', ESTADO_ABIERTO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_COMENTARIO_ID);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    const operacion = result.getValue();
    expect(operacion.tipoOperacionId).toBe(TIPO_OP_COMENTARIO_ID);
    expect(operacion.estadoAnteriorId).toBeNull();
    expect(operacion.estadoNuevoId).toBeNull();
    expect(operacion.descripcion).toBe(baseDto.texto);
    expect(operacion.autorId).toBe(AUTOR_ID);
    // ticketRepo.save NOT invocado (sin cambio de estado)
    expect(ticketRepo.save).not.toHaveBeenCalled();
    // exactamente 1 save en operacionRepo
    expect(operacionRepo.save).toHaveBeenCalledOnce();
    expect(tipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('COMENTARIO');
  });

  // ─── T4A.5: APROBADO → permitido, SIN auto-transición ───────────────────────

  it('T4A.5: ticket en APROBADO → comentario permitido; estado del ticket NO cambia (a diferencia de CrearObservacionUseCase)', async () => {
    const ticket = makeTicket(ESTADO_APROBADO_ID);
    ticketRepo.findById.mockResolvedValue(ticket);
    estadoRepo.findById.mockResolvedValue(makeEstado('APROBADO', ESTADO_APROBADO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_COMENTARIO_ID);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    // Invariante: NO hay auto-transición; el estadoId del ticket no muta
    expect(ticket.estadoId).toBe(ESTADO_APROBADO_ID);
    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(operacionRepo.save).toHaveBeenCalledOnce();
  });

  // ─── T4A.6: EN_PROGRESO y SUSPENDIDO → permitidos ────────────────────────────

  it('T4A.6a: ticket en EN_PROGRESO → comentario permitido; 1 save en operacionRepo', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_EN_PROGRESO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_COMENTARIO_ID);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(operacionRepo.save).toHaveBeenCalledOnce();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('T4A.6b: ticket en SUSPENDIDO → comentario permitido; 1 save en operacionRepo', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_SUSPENDIDO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('SUSPENDIDO', ESTADO_SUSPENDIDO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_COMENTARIO_ID);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(operacionRepo.save).toHaveBeenCalledOnce();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  // ─── Extras: cobertura de infraestructura ────────────────────────────────────

  it('Extra: catálogo estado corrupto (estadoId sin registro) → EstadoCatalogoNoEncontradoError', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID));
    estadoRepo.findById.mockResolvedValue(null); // corrupción de datos

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstadoCatalogoNoEncontradoError);
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  it('Extra: tipo_operacion COMENTARIO ausente del catálogo → TipoOperacionNoEncontradoError', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('ABIERTO', ESTADO_ABIERTO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(null); // catálogo no sembrado

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoOperacionNoEncontradoError);
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  // ─── Multi-tenant ─────────────────────────────────────────────────────────────

  it('Multi-tenant: ticket de otro tenant (findById → null) → TicketNoEncontradoError', async () => {
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ ...baseDto, ticketId: 'tenant-b-ticket-id' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(estadoRepo.findById).not.toHaveBeenCalled();
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });
});
