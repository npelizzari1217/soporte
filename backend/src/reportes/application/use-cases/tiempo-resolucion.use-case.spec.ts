/**
 * T4.9 [RED] — Unit tests para TiempoResolucionUseCase
 *
 * Spec ref: reportes/ReporteTiempoResolucion; Decisión D2
 * Tarea: T4.9 (PR4, admin-general)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TiempoResolucionUseCase } from './tiempo-resolucion.use-case';
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

describe('TiempoResolucionUseCase', () => {
  let useCase: TiempoResolucionUseCase;
  let repo: vi.Mocked<IReportesRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new TiempoResolucionUseCase(repo);
  });

  it('retorna promedioDias=4 y totalResueltos=3 con 3 tickets (2+4+6 días)', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: 4.0, totalResueltos: 3 });

    const result = await useCase.execute({});

    expect(result.promedioDias).toBe(4.0);
    expect(result.totalResueltos).toBe(3);
  });

  it('sin tickets resueltos → { promedioDias: null, totalResueltos: 0 } sin error', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: null, totalResueltos: 0 });

    const result = await useCase.execute({});

    expect(result.promedioDias).toBeNull();
    expect(result.totalResueltos).toBe(0);
    // MUST NOT lanzar error de división por cero
  });

  it('excluye RECHAZADO — el repo solo incluye RESUELTO+SIN_SOLUCION', async () => {
    // La exclusión de RECHAZADO es responsabilidad del repo (SQL WHERE).
    // El use case no filtra adicional — verifica que no llama al repo con RECHAZADO.
    // La verificación indirecta: el use case solo llama tiempoResolucionPromedioDias().
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: 2.0, totalResueltos: 1 });

    await useCase.execute({});

    // El use case llama exactamente este método (no otros relacionados con estados)
    expect(repo.tiempoResolucionPromedioDias).toHaveBeenCalledOnce();
    expect(repo.ticketsPorEstado).not.toHaveBeenCalled();
  });

  it('solo incluye tickets con fecha_cierre IS NOT NULL (responsabilidad del repo)', async () => {
    // El repo filtra fecha_cierre IS NOT NULL en SQL.
    // El use case confía en el repo y retorna lo que éste proporciona.
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: 3.0, totalResueltos: 3 });

    const result = await useCase.execute({});

    expect(result.totalResueltos).toBe(3); // exactamente los que tienen fecha_cierre
  });

  it('filtra por cicloId explícito sin consultar cicloActivo', async () => {
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: 5.0, totalResueltos: 2 });

    await useCase.execute({ cicloId: 'ciclo-2' });

    expect(repo.tiempoResolucionPromedioDias).toHaveBeenCalledWith('ciclo-2');
    expect(repo.cicloActivo).not.toHaveBeenCalled();
  });

  it('sin ciclo activo y sin cicloId → lanza NoCicloActivoError', async () => {
    repo.cicloActivo.mockResolvedValue(null);

    await expect(useCase.execute({})).rejects.toThrow(NoCicloActivoError);
  });

  it('respuesta incluye shape { promedioDias, totalResueltos }', async () => {
    repo.cicloActivo.mockResolvedValue('ciclo-1');
    repo.tiempoResolucionPromedioDias.mockResolvedValue({ promedioDias: 1.5, totalResueltos: 2 });

    const result = await useCase.execute({});

    expect(result).toHaveProperty('promedioDias');
    expect(result).toHaveProperty('totalResueltos');
  });
});
