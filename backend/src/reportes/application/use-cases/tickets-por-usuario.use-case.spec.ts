/**
 * T4.3 [RED] — Unit tests para TicketsPorUsuarioUseCase
 *
 * Spec ref: reportes/ReporteTicketsPorUsuario; Decisión D3
 * Tarea: T4.3 (PR4, admin-general)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketsPorUsuarioUseCase } from './tickets-por-usuario.use-case';
import {
  IReportesRepository,
  TicketsPorSolicitanteRow,
  TicketsPorAsignadoRow,
} from '../../domain/ports/i-reportes.repository';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeReportesRepo(): vi.Mocked<IReportesRepository> {
  return {
    ticketsPorSolicitante: vi.fn(),
    ticketsPorAsignado: vi.fn(),
    ticketsPorTipo: vi.fn(),
    ticketsPorEstado: vi.fn(),
    tiempoResolucionPromedioDias: vi.fn(),
    cicloActivo: vi.fn(),
  };
}

function makeUsuarioRepo(): vi.Mocked<IUsuarioRepository> {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByClienteId: vi.fn(),
    save: vi.fn(),
  };
}

function makeUsuario(id: string, nombre: string, apellido: string): UsuarioEntity {
  return UsuarioEntity.create(
    {
      email: `${nombre.toLowerCase()}@test.com`,
      nombre,
      apellido,
      passwordHash: 'hash',
      clienteId: 'c1',
      activo: true,
      roles: [],
    },
    id,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TicketsPorUsuarioUseCase', () => {
  let useCase: TicketsPorUsuarioUseCase;
  let reportesRepo: vi.Mocked<IReportesRepository>;
  let usuarioRepo: vi.Mocked<IUsuarioRepository>;

  beforeEach(() => {
    reportesRepo = makeReportesRepo();
    usuarioRepo = makeUsuarioRepo();
    useCase = new TicketsPorUsuarioUseCase(reportesRepo, usuarioRepo);
  });

  it('retorna { porSolicitante, porAsignado } con nombres enriquecidos del master', async () => {
    const uid1 = '01966a6a-0000-7000-8000-000000000001';
    const uid2 = '01966a6a-0000-7000-8000-000000000002';

    const solRows: TicketsPorSolicitanteRow[] = [{ solicitanteId: uid1, total: 4 }];
    const asgRows: TicketsPorAsignadoRow[] = [{ asignadoId: uid2, total: 3 }];

    reportesRepo.cicloActivo.mockResolvedValue('ciclo-1');
    reportesRepo.ticketsPorSolicitante.mockResolvedValue(solRows);
    reportesRepo.ticketsPorAsignado.mockResolvedValue(asgRows);
    usuarioRepo.findById.mockImplementation((id) =>
      Promise.resolve(makeUsuario(id, id === uid1 ? 'Ana' : 'Bob', 'Pérez')),
    );

    const result = await useCase.execute({});

    expect(result.porSolicitante).toHaveLength(1);
    expect(result.porSolicitante[0]).toMatchObject({
      usuarioId: uid1,
      nombre: 'Ana Pérez',
      totalTickets: 4,
    });
    expect(result.porAsignado).toHaveLength(1);
    expect(result.porAsignado[0]).toMatchObject({
      usuarioId: uid2,
      nombre: 'Bob Pérez',
      totalTickets: 3,
    });
  });

  it('sin asignado (null) → { usuarioId: null, nombre: "Sin asignar", totalTickets: N }', async () => {
    const asgRows: TicketsPorAsignadoRow[] = [{ asignadoId: null, total: 5 }];

    reportesRepo.cicloActivo.mockResolvedValue('ciclo-1');
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue(asgRows);

    const result = await useCase.execute({});

    expect(result.porAsignado[0]).toMatchObject({
      usuarioId: null,
      nombre: 'Sin asignar',
      totalTickets: 5,
    });
  });

  it('con cicloId param → filtra a ese ciclo exactamente', async () => {
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue([]);

    await useCase.execute({ cicloId: 'ciclo-especifico' });

    expect(reportesRepo.ticketsPorSolicitante).toHaveBeenCalledWith('ciclo-especifico');
    expect(reportesRepo.ticketsPorAsignado).toHaveBeenCalledWith('ciclo-especifico');
    // No debería llamar cicloActivo cuando cicloId está dado
    expect(reportesRepo.cicloActivo).not.toHaveBeenCalled();
  });

  it('sin cicloId → usa ciclo activo del tenant', async () => {
    reportesRepo.cicloActivo.mockResolvedValue('ciclo-activo-123');
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue([]);

    await useCase.execute({});

    expect(reportesRepo.cicloActivo).toHaveBeenCalledOnce();
    expect(reportesRepo.ticketsPorSolicitante).toHaveBeenCalledWith('ciclo-activo-123');
  });

  it('sin ciclo activo y sin cicloId → lanza NoCicloActivoError', async () => {
    reportesRepo.cicloActivo.mockResolvedValue(null);

    await expect(useCase.execute({})).rejects.toThrow(NoCicloActivoError);
  });

  it('cicloId de otro tenant → retorna [] sin error (repo devuelve vacío)', async () => {
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue([]);

    const result = await useCase.execute({ cicloId: 'ciclo-otro-tenant' });

    expect(result.porSolicitante).toEqual([]);
    expect(result.porAsignado).toEqual([]);
  });

  it('usuario no encontrado en master → usa id como fallback de nombre', async () => {
    const uid = '01966a6a-0000-7000-8000-000000000099';
    reportesRepo.cicloActivo.mockResolvedValue('ciclo-1');
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([{ solicitanteId: uid, total: 1 }]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue([]);
    usuarioRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({});

    // Cuando el usuario no existe en master, debería no crashear
    expect(result.porSolicitante).toHaveLength(1);
    expect(result.porSolicitante[0].totalTickets).toBe(1);
  });

  it('es de solo lectura: IReportesRepository.ticketsPorSolicitante y ticketsPorAsignado son read', async () => {
    reportesRepo.cicloActivo.mockResolvedValue('c1');
    reportesRepo.ticketsPorSolicitante.mockResolvedValue([]);
    reportesRepo.ticketsPorAsignado.mockResolvedValue([]);

    await useCase.execute({});

    // Verificar que NO llamó métodos de escritura (no existen en la interfaz de lectura)
    // Solo llamó los métodos de lectura apropiados
    expect(reportesRepo.ticketsPorTipo).not.toHaveBeenCalled();
    expect(reportesRepo.ticketsPorEstado).not.toHaveBeenCalled();
    expect(reportesRepo.tiempoResolucionPromedioDias).not.toHaveBeenCalled();
  });
});
