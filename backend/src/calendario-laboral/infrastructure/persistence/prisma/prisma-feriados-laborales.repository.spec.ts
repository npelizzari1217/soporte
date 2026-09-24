/**
 * WU5b (sdd/feriados-configurables) — unit, sin DB. Mockea
 * `PrismaService.getMasterClient()` y `TenantContext`, mismo molde que
 * `prisma-feriado-global.repository.spec.ts`. Cubre la unión global+cliente
 * (D3), el dedup cuando la misma fecha está en las dos fuentes, la tabla de
 * cliente vacía, y el fail-closed cuando no hay `TenantContext` bindeado.
 * La cobertura de integración real (Postgres, `feriado_cliente` de un
 * tenant efímero) queda en `calendario-laboral.repositorios.integration.spec.ts`
 * (H4).
 */
import {
  FeriadosSinTenantContextError,
  PrismaFeriadosLaboralesRepository,
} from './prisma-feriados-laborales.repository';

function filaFeriado(fecha: string) {
  return { fecha: new Date(`${fecha}T00:00:00.000Z`) };
}

function makePrismaService(findMany: ReturnType<typeof vi.fn>) {
  return { getMasterClient: () => ({ feriado: { findMany } }) };
}

function makeTenantContext(ctx: { prismaClient: unknown } | undefined) {
  return { get: vi.fn().mockReturnValue(ctx) };
}

describe('PrismaFeriadosLaboralesRepository (WU5b, sdd/feriados-configurables)', () => {
  describe('obtener() — sin TenantContext bindeado', () => {
    it('lanza FeriadosSinTenantContextError y nunca consulta Prisma (fail-closed, D3)', async () => {
      const findMany = vi.fn();
      const prismaService = makePrismaService(findMany);
      const tenantContext = makeTenantContext(undefined);
      const repo = new PrismaFeriadosLaboralesRepository(
        prismaService as never,
        tenantContext as never,
      );

      await expect(repo.obtener()).rejects.toThrow(FeriadosSinTenantContextError);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('obtener() — con TenantContext bindeado', () => {
    it('devuelve la unión de feriados globales y propios del cliente', async () => {
      const findManyGlobal = vi.fn().mockResolvedValue([filaFeriado('2026-01-01')]);
      const findManyCliente = vi.fn().mockResolvedValue([filaFeriado('2026-05-01')]);
      const prismaService = makePrismaService(findManyGlobal);
      const tenantContext = makeTenantContext({
        prismaClient: { feriadoCliente: { findMany: findManyCliente } },
      });
      const repo = new PrismaFeriadosLaboralesRepository(
        prismaService as never,
        tenantContext as never,
      );

      const feriados = await repo.obtener();

      expect(feriados.has('2026-01-01')).toBe(true);
      expect(feriados.has('2026-05-01')).toBe(true);
      expect(feriados.size).toBe(2);
    });

    it('deduplica cuando la misma fecha existe en global Y en el cliente', async () => {
      const findManyGlobal = vi.fn().mockResolvedValue([filaFeriado('2026-12-25')]);
      const findManyCliente = vi.fn().mockResolvedValue([filaFeriado('2026-12-25')]);
      const prismaService = makePrismaService(findManyGlobal);
      const tenantContext = makeTenantContext({
        prismaClient: { feriadoCliente: { findMany: findManyCliente } },
      });
      const repo = new PrismaFeriadosLaboralesRepository(
        prismaService as never,
        tenantContext as never,
      );

      const feriados = await repo.obtener();

      expect(feriados.size).toBe(1);
      expect(feriados.has('2026-12-25')).toBe(true);
    });

    it('con la tabla de cliente vacía, devuelve solo los globales', async () => {
      const findManyGlobal = vi.fn().mockResolvedValue([filaFeriado('2026-01-01')]);
      const findManyCliente = vi.fn().mockResolvedValue([]);
      const prismaService = makePrismaService(findManyGlobal);
      const tenantContext = makeTenantContext({
        prismaClient: { feriadoCliente: { findMany: findManyCliente } },
      });
      const repo = new PrismaFeriadosLaboralesRepository(
        prismaService as never,
        tenantContext as never,
      );

      const feriados = await repo.obtener();

      expect(Array.from(feriados)).toEqual(['2026-01-01']);
    });

    it('mapea la medianoche UTC (@db.Date) al mismo día calendario para ambas fuentes', async () => {
      // Trampa D2: si alguna de las dos lecturas usara `desplazarAArgentina`
      // en vez de `claveDiaUtcDe`, el día correría hacia atrás.
      const findManyGlobal = vi.fn().mockResolvedValue([filaFeriado('2026-03-10')]);
      const findManyCliente = vi.fn().mockResolvedValue([filaFeriado('2026-08-17')]);
      const prismaService = makePrismaService(findManyGlobal);
      const tenantContext = makeTenantContext({
        prismaClient: { feriadoCliente: { findMany: findManyCliente } },
      });
      const repo = new PrismaFeriadosLaboralesRepository(
        prismaService as never,
        tenantContext as never,
      );

      const feriados = await repo.obtener();

      expect(feriados.has('2026-03-10')).toBe(true);
      expect(feriados.has('2026-03-09')).toBe(false);
      expect(feriados.has('2026-08-17')).toBe(true);
      expect(feriados.has('2026-08-16')).toBe(false);
    });
  });
});
