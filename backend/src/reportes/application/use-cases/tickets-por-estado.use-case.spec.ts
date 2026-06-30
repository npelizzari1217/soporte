/**
 * T4.7 [RED] — Unit tests para TicketsPorEstadoUseCase
 *
 * Spec ref: reportes/ReporteTicketsPorEstado
 * Tarea: T4.7 (PR4, admin-general)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketsPorEstadoUseCase } from './tickets-por-estado.use-case';
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeAllEstados(
  overrides: Record<string, number> = {},
): Array<{ estadoCodigo: string; total: number }> {
  const defaults: Record<string, number> = {
    ABIERTO: 0,
    PENDIENTE_APROBACION: 0,
    APROBADO: 0,
    RECHAZADO: 0,
    EN_PROGRESO: 0,
    RESUELTO: 0,
    CERRADO: 0,
    CANCELADO: 0,
    SIN_SOLUCION: 0,
    SUSPENDIDO: 0,
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([estadoCodigo, total]) => ({ estadoCodigo, total }));
}

function makeRepo(): vi.Mocked<IReportesRepository> {
  return {
    ticketsPorSolicitante: vi.fn(),
    ticketsPorAsignado: vi.fn(),
    ticketsPorTipo: vi.fn(),
    ticketsPorEstado: vi.fn(),
    tiempoResolucionPromedioDias: vi.fn(),
    cicloActivo: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TicketsPorEstadoUseCase', () => {
  let useCase: TicketsPorEstadoUseCase;
  let repo: vi.Mocked<IReportesRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new TicketsPorEstadoUseCase(repo);
  });

  it('incluye todos los estados incluyendo terminales (RESUELTO, SIN_SOLUCION, RECHAZADO)', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorEstado.mockResolvedValue(
      makeAllEstados({ ABIERTO: 3, EN_PROGRESO: 2, RESUELTO: 5, RECHAZADO: 1 }),
    );

    const result = await useCase.execute({});

    expect(result.find((r) => r.estado === 'RESUELTO')?.totalTickets).toBe(5);
    expect(result.find((r) => r.estado === 'RECHAZADO')?.totalTickets).toBe(1);
    expect(result.find((r) => r.estado === 'SIN_SOLUCION')?.totalTickets).toBe(0);
    expect(result.find((r) => r.estado === 'ABIERTO')?.totalTickets).toBe(3);
  });

  it('estados con 0 tickets están presentes en la respuesta', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorEstado.mockResolvedValue(makeAllEstados({ ABIERTO: 5 }));

    const result = await useCase.execute({});

    expect(result.find((r) => r.estado === 'SUSPENDIDO')?.totalTickets).toBe(0);
    expect(result.find((r) => r.estado === 'CANCELADO')?.totalTickets).toBe(0);
    expect(result.find((r) => r.estado === 'RECHAZADO')?.totalTickets).toBe(0);
  });

  it('tickets soft-deleted son excluidos (delegado al repo) → ABIERTO: 3 no 5', async () => {
    // Si hubiera 5 tickets ABIERTO pero 2 soft-deleted, el repo devuelve 3.
    // El use case retorna exactamente lo que el repo reporta (sin filtrado extra).
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorEstado.mockResolvedValue(makeAllEstados({ ABIERTO: 3 }));

    const result = await useCase.execute({});

    expect(result.find((r) => r.estado === 'ABIERTO')?.totalTickets).toBe(3);
  });

  it('filtra por cicloId explícito sin consultar cicloActivo', async () => {
    repo.ticketsPorEstado.mockResolvedValue(makeAllEstados());

    await useCase.execute({ cicloId: 'ciclo-2' });

    expect(repo.ticketsPorEstado).toHaveBeenCalledWith('ciclo-2');
    expect(repo.cicloActivo).not.toHaveBeenCalled();
  });

  it('sin ciclo activo y sin cicloId → lanza NoCicloActivoError', async () => {
    repo.cicloActivo.mockResolvedValue(null);

    await expect(useCase.execute({})).rejects.toThrow(NoCicloActivoError);
  });

  it('respuesta incluye shape { estado, totalTickets }', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorEstado.mockResolvedValue(makeAllEstados({ ABIERTO: 2 }));

    const result = await useCase.execute({});

    expect(result[0]).toHaveProperty('estado');
    expect(result[0]).toHaveProperty('totalTickets');
  });
});
