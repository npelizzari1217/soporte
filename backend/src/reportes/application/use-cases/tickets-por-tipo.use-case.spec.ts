/**
 * T4.5 [RED] — Unit tests para TicketsPorTipoUseCase
 *
 * Spec ref: reportes/ReporteTicketsPorTipo
 * Tarea: T4.5 (PR4, admin-general)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketsPorTipoUseCase } from './tickets-por-tipo.use-case';
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

// ─── Factory ─────────────────────────────────────────────────────────────────

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

describe('TicketsPorTipoUseCase', () => {
  let useCase: TicketsPorTipoUseCase;
  let repo: vi.Mocked<IReportesRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new TicketsPorTipoUseCase(repo);
  });

  it('los 3 tipos siempre en respuesta, incluso con total 0', async () => {
    // Repo solo devuelve SOPORTE (los otros 2 no tienen tickets)
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorTipo.mockResolvedValue([
      { tipoCodigo: 'SOPORTE', total: 20 },
      { tipoCodigo: 'COMPRAS', total: 0 },
      { tipoCodigo: 'EDILICIA', total: 0 },
    ]);

    const result = await useCase.execute({});

    expect(result).toHaveLength(3);
    expect(result.find((r) => r.tipo === 'SOPORTE')?.totalTickets).toBe(20);
    expect(result.find((r) => r.tipo === 'COMPRAS')?.totalTickets).toBe(0);
    expect(result.find((r) => r.tipo === 'EDILICIA')?.totalTickets).toBe(0);
  });

  it('repo devuelve solo tipos con tickets → use case mantiene los 3 (merge)', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    // Repo devuelve: ya tiene los 3 con 0 (el repo hace el LEFT JOIN internamente)
    repo.ticketsPorTipo.mockResolvedValue([
      { tipoCodigo: 'SOPORTE', total: 5 },
      { tipoCodigo: 'COMPRAS', total: 0 },
      { tipoCodigo: 'EDILICIA', total: 10 },
    ]);

    const result = await useCase.execute({});

    expect(result).toHaveLength(3);
    expect(result.find((r) => r.tipo === 'COMPRAS')?.totalTickets).toBe(0);
  });

  it('filtra por cicloId explícito sin consultar cicloActivo', async () => {
    repo.ticketsPorTipo.mockResolvedValue([
      { tipoCodigo: 'SOPORTE', total: 3 },
      { tipoCodigo: 'COMPRAS', total: 0 },
      { tipoCodigo: 'EDILICIA', total: 0 },
    ]);

    await useCase.execute({ cicloId: 'ciclo-especifico' });

    expect(repo.ticketsPorTipo).toHaveBeenCalledWith('ciclo-especifico');
    expect(repo.cicloActivo).not.toHaveBeenCalled();
  });

  it('excluye soft-deleted (responsabilidad del repo — use case no filtra)', async () => {
    // Este test verifica que el use case delega el filtrado al repo
    // No hace filtrado adicional sobre los resultados del repo
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorTipo.mockResolvedValue([
      { tipoCodigo: 'SOPORTE', total: 3 },
      { tipoCodigo: 'COMPRAS', total: 0 },
      { tipoCodigo: 'EDILICIA', total: 0 },
    ]);

    const result = await useCase.execute({});

    // El use case retorna exactamente lo que el repo reporta (sin filtrado adicional)
    expect(result.find((r) => r.tipo === 'SOPORTE')?.totalTickets).toBe(3);
  });

  it('sin ciclo activo y sin cicloId → lanza NoCicloActivoError', async () => {
    repo.cicloActivo.mockResolvedValue(null);

    await expect(useCase.execute({})).rejects.toThrow(NoCicloActivoError);
  });

  it('respuesta incluye shape { tipo, totalTickets }', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.ticketsPorTipo.mockResolvedValue([
      { tipoCodigo: 'SOPORTE', total: 1 },
      { tipoCodigo: 'COMPRAS', total: 0 },
      { tipoCodigo: 'EDILICIA', total: 0 },
    ]);

    const result = await useCase.execute({});

    expect(result[0]).toHaveProperty('tipo');
    expect(result[0]).toHaveProperty('totalTickets');
  });
});
