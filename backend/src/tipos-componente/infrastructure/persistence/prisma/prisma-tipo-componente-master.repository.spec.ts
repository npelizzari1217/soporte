/**
 * PR1 [UNIT] — RED→GREEN: PrismaTipoComponenteMasterRepository (catálogo
 * MASTER de tipos de componente, `prisma_master`). Mockea
 * `PrismaService.getMasterClient()` (mismo molde que
 * `sla/infrastructure/persistence/prisma/prisma-tenant-enumerator.spec.ts`).
 *
 * Ref: sdd/tipos-componente-master (PR1).
 */
import { PrismaTipoComponenteMasterRepository } from './prisma-tipo-componente-master.repository';
import { TipoComponente } from '../../../domain/entities/tipo-componente.entity';

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tipo-1',
    codigo: 'CPU',
    nombre: 'CPU / Procesador',
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaService(client: {
  findUnique?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
}) {
  const findUnique = client.findUnique ?? vi.fn();
  const findMany = client.findMany ?? vi.fn();
  const upsert = client.upsert ?? vi.fn();
  const prismaService = {
    getMasterClient: () => ({ tipoComponente: { findUnique, findMany, upsert } }),
  };
  return { prismaService, findUnique, findMany, upsert };
}

describe('PrismaTipoComponenteMasterRepository', () => {
  describe('findById()', () => {
    it('retorna la entidad mapeada cuando la fila existe', async () => {
      const { prismaService, findUnique } = makePrismaService({
        findUnique: vi.fn().mockResolvedValue(makeRow()),
      });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipo = await repo.findById('tipo-1');

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'tipo-1' } });
      expect(tipo).toBeInstanceOf(TipoComponente);
      expect(tipo?.codigo).toBe('CPU');
    });

    it('retorna null cuando no existe', async () => {
      const { prismaService } = makePrismaService({ findUnique: vi.fn().mockResolvedValue(null) });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipo = await repo.findById('inexistente');

      expect(tipo).toBeNull();
    });
  });

  describe('findByCodigo()', () => {
    it('busca por codigo exacto (sin normalizar) y mapea la entidad', async () => {
      const { prismaService, findUnique } = makePrismaService({
        findUnique: vi.fn().mockResolvedValue(makeRow({ codigo: 'RAM', nombre: 'Memoria RAM' })),
      });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipo = await repo.findByCodigo('RAM');

      expect(findUnique).toHaveBeenCalledWith({ where: { codigo: 'RAM' } });
      expect(tipo?.nombre).toBe('Memoria RAM');
    });

    it('retorna null cuando el codigo no existe', async () => {
      const { prismaService } = makePrismaService({ findUnique: vi.fn().mockResolvedValue(null) });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipo = await repo.findByCodigo('INEXISTENTE');

      expect(tipo).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('retorna todos los tipos mapeados', async () => {
      const { prismaService } = makePrismaService({
        findMany: vi.fn().mockResolvedValue([makeRow(), makeRow({ id: 'tipo-2', codigo: 'RAM' })]),
      });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipos = await repo.findAll();

      expect(tipos).toHaveLength(2);
      expect(tipos.map((t) => t.codigo)).toEqual(['CPU', 'RAM']);
    });

    it('lista vacía cuando no hay tipos', async () => {
      const { prismaService } = makePrismaService({ findMany: vi.fn().mockResolvedValue([]) });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);

      const tipos = await repo.findAll();

      expect(tipos).toEqual([]);
    });
  });

  describe('save()', () => {
    it('hace upsert por id con los datos mapeados a persistencia', async () => {
      const { prismaService, upsert } = makePrismaService({
        upsert: vi.fn().mockResolvedValue(undefined),
      });
      const repo = new PrismaTipoComponenteMasterRepository(prismaService as never);
      const tipo = TipoComponente.create(
        { codigo: 'GPU', nombre: 'Placa de video' },
        'tipo-gpu',
      ).getValue();

      await repo.save(tipo);

      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'tipo-gpu' },
        create: { id: 'tipo-gpu', codigo: 'GPU', nombre: 'Placa de video', activo: true },
        update: { codigo: 'GPU', nombre: 'Placa de video', activo: true },
      });
    });
  });
});
