/**
 * WU1 (sdd/feriados-configurables) — unit, sin DB. Mockea
 * `PrismaService.getMasterClient()`.
 * Cubre CRUD + orden ascendente por `fecha`, y que `crear`/`editar` escriban
 * la fecha en medianoche UTC (@db.Date, D2) vía el mapper.
 */
import { PrismaFeriadoGlobalRepository } from './prisma-feriado-global.repository';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { FeriadoEntity } from '../../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';
import { FeriadosGlobalesCache } from '../feriados-globales.cache';

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
  // PrismaService es una clase concreta con estado privado (pool de conexión
  // real, `PrismaPg`): se parte de su prototipo y se pisa el único método que
  // este repositorio usa, `getMasterClient()`; el resto de la superficie de
  // PrismaService nunca se ejercita.
  const prismaService: PrismaService = Object.assign(Object.create(PrismaService.prototype), {
    getMasterClient: () => ({ feriado: { findMany, findUnique, create, update, delete: del } }),
  });
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
      const repo = new PrismaFeriadoGlobalRepository(prismaService);

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
      const repo = new PrismaFeriadoGlobalRepository(prismaService);

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
      const repo = new PrismaFeriadoGlobalRepository(prismaService);
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
      const repo = new PrismaFeriadoGlobalRepository(prismaService);
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
      const repo = new PrismaFeriadoGlobalRepository(prismaService);

      await repo.eliminar('feriado-1');

      expect(del).toHaveBeenCalledWith({ where: { id: 'feriado-1' } });
    });
  });

  describe('copia en memoria de los feriados globales (JD-B-002)', () => {
    const navidad = (): FeriadoEntity =>
      FeriadoEntity.crear(
        { fecha: fecha('2026-12-25'), descripcion: 'Navidad' },
        'feriado-navidad',
      );
    const escrituras: Array<[string, (repo: PrismaFeriadoGlobalRepository) => Promise<void>]> = [
      ['crear', (repo) => repo.crear(navidad())],
      ['editar', (repo) => repo.editar(navidad())],
      ['eliminar', (repo) => repo.eliminar('feriado-navidad')],
    ];

    it.each(escrituras)(
      '%s la descarta: la próxima lectura vuelve a master',
      async (_nombre, escribir) => {
        const { prismaService } = makePrismaService({
          create: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        });
        const cache = new FeriadosGlobalesCache();
        const repo = new PrismaFeriadoGlobalRepository(prismaService, cache);
        const cargar = vi.fn().mockResolvedValue([]);
        await cache.obtener(cargar);

        await escribir(repo);
        await cache.obtener(cargar);

        expect(cargar).toHaveBeenCalledTimes(2);
      },
    );

    it('una escritura que falla no la descarta', async () => {
      const { prismaService } = makePrismaService({
        create: vi.fn().mockRejectedValue(new Error('unique violation')),
      });
      const cache = new FeriadosGlobalesCache();
      const repo = new PrismaFeriadoGlobalRepository(prismaService, cache);
      const cargar = vi.fn().mockResolvedValue([]);
      await cache.obtener(cargar);

      await expect(repo.crear(navidad())).rejects.toThrow('unique violation');
      await cache.obtener(cargar);

      expect(cargar).toHaveBeenCalledTimes(1);
    });
  });
});
