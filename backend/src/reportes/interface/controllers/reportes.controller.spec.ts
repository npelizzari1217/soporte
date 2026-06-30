/**
 * T4.12 [RED] — Tests integración ReportesController.
 *
 * Guards: JwtAuthGuard, TenantGuard, AdminOrGlobalGuard a nivel de controlador.
 * Rutas:
 *   GET /reportes/tickets-por-usuario
 *   GET /reportes/tickets-por-tipo
 *   GET /reportes/tickets-por-estado
 *   GET /reportes/tiempo-resolucion
 *
 * Nota de entorno: TenantGuard y JwtAuthGuard importan PrismaService que a su vez
 * importa '.prisma/master' (no generado en entorno de CI sin DB). Se mockean los módulos
 * con dependencias de Prisma para aislar el test del controlador.
 *
 * Spec ref: reportes (todos los requirements)
 * Tarea: T4.12 (PR4, admin-general)
 */

// ─── Mocks de módulos con dependencias de Prisma (deben ir primero) ──────────

vi.mock('../../../auth/infrastructure/guards/tenant.guard', () => {
  class TenantGuard {}
  return { TenantGuard };
});

vi.mock('../../../auth/infrastructure/guards/jwt-auth.guard', () => {
  class JwtAuthGuard {}
  return { JwtAuthGuard };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminOrGlobalGuard } from '../../infrastructure/guards/admin-or-global.guard';
import { TicketsPorUsuarioUseCase } from '../../application/use-cases/tickets-por-usuario.use-case';
import { TicketsPorTipoUseCase } from '../../application/use-cases/tickets-por-tipo.use-case';
import { TicketsPorEstadoUseCase } from '../../application/use-cases/tickets-por-estado.use-case';
import { TiempoResolucionUseCase } from '../../application/use-cases/tiempo-resolucion.use-case';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makePorUsuario(): vi.Mocked<TicketsPorUsuarioUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<TicketsPorUsuarioUseCase>;
}
function makePorTipo(): vi.Mocked<TicketsPorTipoUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<TicketsPorTipoUseCase>;
}
function makePorEstado(): vi.Mocked<TicketsPorEstadoUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<TicketsPorEstadoUseCase>;
}
function makeTiempo(): vi.Mocked<TiempoResolucionUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<TiempoResolucionUseCase>;
}

function makeController(
  porUsuario = makePorUsuario(),
  porTipo = makePorTipo(),
  porEstado = makePorEstado(),
  tiempo = makeTiempo(),
) {
  return new ReportesController(porUsuario, porTipo, porEstado, tiempo);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /reportes/tickets-por-usuario
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportesController — GET /reportes/tickets-por-usuario (T4.12)', () => {
  it('ADMINISTRADOR → 200 con { porSolicitante, porAsignado }', async () => {
    const porUsuario = makePorUsuario();
    porUsuario.execute.mockResolvedValue({
      porSolicitante: [{ usuarioId: 'u1', nombre: 'Ana López', totalTickets: 4 }],
      porAsignado: [{ usuarioId: 'u2', nombre: 'Bob García', totalTickets: 3 }],
    });
    const controller = makeController(porUsuario);

    const result = await controller.ticketsPorUsuario({});

    expect(result.porSolicitante).toHaveLength(1);
    expect(result.porSolicitante[0].nombre).toBe('Ana López');
    expect(result.porAsignado).toHaveLength(1);
    expect(result.porAsignado[0].nombre).toBe('Bob García');
  });

  it('con cicloId → delega al use case con el cicloId dado', async () => {
    const porUsuario = makePorUsuario();
    porUsuario.execute.mockResolvedValue({ porSolicitante: [], porAsignado: [] });
    const controller = makeController(porUsuario);

    await controller.ticketsPorUsuario({ cicloId: 'ciclo-123' });

    expect(porUsuario.execute).toHaveBeenCalledWith({ cicloId: 'ciclo-123' });
  });

  it('sin ciclo activo y sin cicloId → 422 UnprocessableEntityException', async () => {
    const porUsuario = makePorUsuario();
    porUsuario.execute.mockRejectedValue(new NoCicloActivoError());
    const controller = makeController(porUsuario);

    await expect(controller.ticketsPorUsuario({})).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('resultado de tickets sin asignar incluye { usuarioId: null, nombre: "Sin asignar" }', async () => {
    const porUsuario = makePorUsuario();
    porUsuario.execute.mockResolvedValue({
      porSolicitante: [],
      porAsignado: [{ usuarioId: null, nombre: 'Sin asignar', totalTickets: 2 }],
    });
    const controller = makeController(porUsuario);

    const result = await controller.ticketsPorUsuario({});

    expect(result.porAsignado[0].usuarioId).toBeNull();
    expect(result.porAsignado[0].nombre).toBe('Sin asignar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /reportes/tickets-por-tipo
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportesController — GET /reportes/tickets-por-tipo (T4.12)', () => {
  it('→ 200 con los 3 tipos', async () => {
    const porTipo = makePorTipo();
    porTipo.execute.mockResolvedValue([
      { tipo: 'SOPORTE', totalTickets: 20 },
      { tipo: 'COMPRAS', totalTickets: 5 },
      { tipo: 'EDILICIA', totalTickets: 10 },
    ]);
    const controller = makeController(undefined, porTipo);

    const result = await controller.ticketsPorTipo({});

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ tipo: 'SOPORTE', totalTickets: 20 });
  });

  it('sin ciclo activo y sin cicloId → 422', async () => {
    const porTipo = makePorTipo();
    porTipo.execute.mockRejectedValue(new NoCicloActivoError());
    const controller = makeController(undefined, porTipo);

    await expect(controller.ticketsPorTipo({})).rejects.toThrow(UnprocessableEntityException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /reportes/tickets-por-estado
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportesController — GET /reportes/tickets-por-estado (T4.12)', () => {
  it('→ 200 con todos los estados incluyendo terminales', async () => {
    const porEstado = makePorEstado();
    porEstado.execute.mockResolvedValue([
      { estado: 'ABIERTO', totalTickets: 3 },
      { estado: 'RESUELTO', totalTickets: 5 },
      { estado: 'RECHAZADO', totalTickets: 1 },
    ]);
    const controller = makeController(undefined, undefined, porEstado);

    const result = await controller.ticketsPorEstado({});

    expect(result.find((r) => r.estado === 'RESUELTO')?.totalTickets).toBe(5);
    expect(result.find((r) => r.estado === 'RECHAZADO')?.totalTickets).toBe(1);
  });

  it('con cicloId → delega con el cicloId', async () => {
    const porEstado = makePorEstado();
    porEstado.execute.mockResolvedValue([]);
    const controller = makeController(undefined, undefined, porEstado);

    await controller.ticketsPorEstado({ cicloId: 'c2' });

    expect(porEstado.execute).toHaveBeenCalledWith({ cicloId: 'c2' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /reportes/tiempo-resolucion
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportesController — GET /reportes/tiempo-resolucion (T4.12)', () => {
  it('→ 200 con { promedioDias, totalResueltos }', async () => {
    const tiempo = makeTiempo();
    tiempo.execute.mockResolvedValue({ promedioDias: 4.0, totalResueltos: 3 });
    const controller = makeController(undefined, undefined, undefined, tiempo);

    const result = await controller.tiempoResolucion({});

    expect(result.promedioDias).toBe(4.0);
    expect(result.totalResueltos).toBe(3);
  });

  it('sin tickets resueltos → { promedioDias: null, totalResueltos: 0 }', async () => {
    const tiempo = makeTiempo();
    tiempo.execute.mockResolvedValue({ promedioDias: null, totalResueltos: 0 });
    const controller = makeController(undefined, undefined, undefined, tiempo);

    const result = await controller.tiempoResolucion({});

    expect(result.promedioDias).toBeNull();
    expect(result.totalResueltos).toBe(0);
  });

  it('sin ciclo activo → 422', async () => {
    const tiempo = makeTiempo();
    tiempo.execute.mockRejectedValue(new NoCicloActivoError());
    const controller = makeController(undefined, undefined, undefined, tiempo);

    await expect(controller.tiempoResolucion({})).rejects.toThrow(UnprocessableEntityException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportesController — Guard metadata (T4.12)', () => {
  const GUARDS_KEY = '__guards__';

  it('JwtAuthGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, ReportesController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('TenantGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, ReportesController) ?? [];
    expect(guards.some((g) => g === TenantGuard)).toBe(true);
  });

  it('AdminOrGlobalGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, ReportesController) ?? [];
    expect(guards.some((g) => g === AdminOrGlobalGuard)).toBe(true);
  });
});
