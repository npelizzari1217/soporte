/**
 * PR3 [UNIT] — RED→GREEN: TipoComponenteMasterChecker (checker cross-DB del
 * catálogo MASTER de tipos de componente, consumido por
 * `ListarTiposComponenteUseCase`). Mockea `PrismaService.getMasterClient()`
 * (mismo molde que `UsuarioMasterChecker` /
 * `PrismaTipoComponenteMasterRepository.spec.ts`).
 *
 * Ref: sdd/tipos-componente-master (PR3).
 */
import { describe, it, expect, vi } from 'vitest';
import { TipoComponenteMasterChecker } from './tipo-componente-master.checker';

function makePrismaService(client: {
  findMany?: ReturnType<typeof vi.fn>;
  findFirst?: ReturnType<typeof vi.fn>;
}) {
  const findMany = client.findMany ?? vi.fn();
  const findFirst = client.findFirst ?? vi.fn();
  const prismaService = {
    getMasterClient: () => ({ tipoComponente: { findMany, findFirst } }),
  };
  return { prismaService, findMany, findFirst };
}

describe('TipoComponenteMasterChecker', () => {
  describe('resolver()', () => {
    it('resuelve un batch de codigos en un solo findMany', async () => {
      const { prismaService, findMany } = makePrismaService({
        findMany: vi.fn().mockResolvedValue([
          { codigo: 'CPU', nombre: 'CPU / Procesador', activo: true },
          { codigo: 'RAM', nombre: 'Memoria RAM', activo: false },
        ]),
      });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const result = await checker.resolver(['CPU', 'RAM']);

      expect(findMany).toHaveBeenCalledWith({
        where: { codigo: { in: ['CPU', 'RAM'] } },
        select: { codigo: true, nombre: true, activo: true },
      });
      expect(result.get('CPU')).toEqual({ nombre: 'CPU / Procesador', activo: true });
      expect(result.get('RAM')).toEqual({ nombre: 'Memoria RAM', activo: false });
    });

    it('array vacio retorna Map vacio sin consultar la DB', async () => {
      const { prismaService, findMany } = makePrismaService({});
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const result = await checker.resolver([]);

      expect(result.size).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('codigos inexistentes simplemente no aparecen en el Map (best-effort)', async () => {
      const { prismaService } = makePrismaService({
        findMany: vi.fn().mockResolvedValue([{ codigo: 'CPU', nombre: 'CPU', activo: true }]),
      });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const result = await checker.resolver(['CPU', 'INEXISTENTE']);

      expect(result.size).toBe(1);
      expect(result.has('INEXISTENTE')).toBe(false);
    });
  });

  describe('estaActivo()', () => {
    it('true cuando el codigo existe y esta activo', async () => {
      const { prismaService, findFirst } = makePrismaService({
        findFirst: vi.fn().mockResolvedValue({ codigo: 'CPU' }),
      });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const activo = await checker.estaActivo('CPU');

      expect(findFirst).toHaveBeenCalledWith({
        where: { codigo: 'CPU', activo: true },
        select: { codigo: true },
      });
      expect(activo).toBe(true);
    });

    it('false cuando el codigo no existe o esta inactivo', async () => {
      const { prismaService } = makePrismaService({ findFirst: vi.fn().mockResolvedValue(null) });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const activo = await checker.estaActivo('INEXISTENTE');

      expect(activo).toBe(false);
    });
  });

  describe('listarActivos()', () => {
    it('lista solo los tipos activos ordenados por nombre', async () => {
      const { prismaService, findMany } = makePrismaService({
        findMany: vi.fn().mockResolvedValue([
          { codigo: 'RAM', nombre: 'Memoria RAM' },
          { codigo: 'CPU', nombre: 'CPU / Procesador' },
        ]),
      });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const tipos = await checker.listarActivos();

      expect(findMany).toHaveBeenCalledWith({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { codigo: true, nombre: true },
      });
      expect(tipos).toEqual([
        { codigo: 'RAM', nombre: 'Memoria RAM' },
        { codigo: 'CPU', nombre: 'CPU / Procesador' },
      ]);
    });

    it('lista vacia cuando no hay tipos activos', async () => {
      const { prismaService } = makePrismaService({ findMany: vi.fn().mockResolvedValue([]) });
      const checker = new TipoComponenteMasterChecker(prismaService as never);

      const tipos = await checker.listarActivos();

      expect(tipos).toEqual([]);
    });
  });
});
