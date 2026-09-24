/**
 * WU1 (sdd/feriados-configurables) — unit, sin DB. Mockea
 * `PrismaService.getMasterClient()`, mismo molde que
 * `tipos-componente/infrastructure/persistence/prisma/prisma-tipo-componente-master.repository.spec.ts`.
 * Cubre CRUD + orden ascendente por `fecha`, y que `crear`/`editar` escriban
 * la fecha en medianoche UTC (@db.Date, D2) vía el mapper.
 */
import { PrismaFeriadoGlobalRepository } from './prisma-feriado-global.repository';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';

function fecha(iso: string): FechaCalendario {
  return FechaCalendario.crear(iso).getValue();
}

function fila(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'feriado-1',
    fecha: new Date('2026-01-01T00:00:00.000Z'),
    descripcion: 'Año Nuevo',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaService(client: {
  findMany?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}) {
  const findMany = client.findMany ?? vi.fn();
  const findUnique = client.findUnique ?? vi.fn();
  const create = client.create ?? vi.fn();
  const update = client.update ?? vi.fn();
  const del = client.delete ?? vi.fn();
  const prismaService = {
    getMasterClient: () => ({ feriado: { findMany, findUnique, create, update, delete: del } }),
  };
  return { prismaService, findMany, findUnique, create, update, delete: del };
}

describe('PrismaFeriadoGlobalRepository', () => {
  describe('listar()', () => {
    it('pide la lista ordenada por fecha ascendente y mapea cada fila', async () => {
      const { prismaService, findMany } = makePrismaService({
        findMany: vi.fn().mockResolvedValue([
          fila(),
          fila({
            id: 'feriado-2',
            fecha: new Date('2026-05-01T00:00:00.000Z'),
            descripcion: 'Día del Trabajador',
          }),
        ]),
      });
      const repo = new PrismaFeriadoGlobalRepository(prismaService as never);

      const feriados = await repo.listar();

      expect(findMany).toHaveBeenCalledWith({ orderBy: { fecha: 'asc' } });
      expect(feriados).toHaveLength(2);
      expect(feriados[0]).toBeInstanceOf(FeriadoEntity);
      expect(feriados[0].fecha.aClave()).toBe('2026-01-01');
      expect(feriados[1].descripcion).toBe('Día del Trabajador');
    });
  });

  describe('buscarPorId()', () => {
    it('retorna la entidad mapeada cuando existe, y null cuando no', async () => {
      const { prismaService, findUnique } = makePrismaService({
        findUnique: vi.fn().mockResolvedValueOnce(fila()).mockResolvedValueOnce(null),
      });
      const repo = new PrismaFeriadoGlobalRepository(prismaService as never);

      const feriado = await repo.buscarPorId('feriado-1');
      const inexistente = await repo.buscarPorId('inexistente');

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'feriado-1' } });
      expect(feriado?.fecha.aClave()).toBe('2026-01-01');
      expect(inexistente).toBeNull();
    });
  });

  describe('crear()', () => {
    it('inserta con la fecha en medianoche UTC (@db.Date)', async () => {
      const { prismaService, create } = makePrismaService({
        create: vi.fn().mockResolvedValue(undefined),
      });
      const repo = new PrismaFeriadoGlobalRepository(prismaService as never);
      const feriado = FeriadoEntity.crear(
        { fecha: fecha('2026-12-25'), descripcion: 'Navidad' },
        'feriado-navidad',
      );

      await repo.crear(feriado);

      expect(create).toHaveBeenCalledWith({
        data: {
          id: 'feriado-navidad',
          fecha: new Date('2026-12-25T00:00:00.000Z'),
          descripcion: 'Navidad',
        },
      });
    });
  });

  describe('editar()', () => {
    it('actualiza por id sin reenviarlo en el payload de datos', async () => {
      const { prismaService, update } = makePrismaService({
        update: vi.fn().mockResolvedValue(undefined),
      });
      const repo = new PrismaFeriadoGlobalRepository(prismaService as never);
      const feriado = FeriadoEntity.reconstitute(
        { fecha: fecha('2026-01-01'), descripcion: 'Año Nuevo' },
        'feriado-1',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-01T00:00:00Z'),
      );
      feriado.editar({
        fecha: fecha('2026-01-02'),
        descripcion: 'Feriado trasladado',
      });

      await repo.editar(feriado);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'feriado-1' },
        data: {
          fecha: new Date('2026-01-02T00:00:00.000Z'),
          descripcion: 'Feriado trasladado',
        },
      });
    });
  });

  describe('eliminar()', () => {
    it('borra físicamente por id (sin soft delete, D1)', async () => {
      const { prismaService, delete: del } = makePrismaService({
        delete: vi.fn().mockResolvedValue(undefined),
      });
      const repo = new PrismaFeriadoGlobalRepository(prismaService as never);

      await repo.eliminar('feriado-1');

      expect(del).toHaveBeenCalledWith({ where: { id: 'feriado-1' } });
    });
  });
});
