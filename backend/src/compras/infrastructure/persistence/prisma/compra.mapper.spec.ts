/**
 * PR-10 [C] TEST — `CompraMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (con `items` incluidos, sin DB) →
 * CompraEntity, y viceversa. `toDomain` delega la conversión de cada ítem en
 * `ItemCompraMapper` (no reimplementa la conversión Decimal -> number acá).
 * `toPersistence` retorna SOLO la cabecera — `guardarItem` persiste los
 * ítems por separado (ADR-C2).
 *
 * Tarea: PR-10.
 */
import {
  Prisma,
  type Compra as PrismaCompra,
  type ItemCompra as PrismaItemCompra,
} from '.prisma/tenant';
import { CompraEntity } from '../../../domain/entities/compra.entity';
import { CompraMapper } from './compra.mapper';

function makeFakeCompraRow(overrides: Partial<PrismaCompra> = {}): PrismaCompra {
  return {
    id: '01966a6a-0000-7000-8000-000000000001',
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-01-10'),
    motivo: 'Renovación de equipos',
    descripcion: null,
    solicitanteId: 'usuario-1',
    cicloId: 'ciclo-1',
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeFakeItemRow(overrides: Partial<PrismaItemCompra> = {}): PrismaItemCompra {
  return {
    id: '01966a6a-0000-7000-8000-000000000020',
    compraId: '01966a6a-0000-7000-8000-000000000001',
    descripcion: 'Notebook Dell',
    cantidad: new Prisma.Decimal('2.00'),
    proveedor: 'Proveedor SA',
    monto: new Prisma.Decimal('150000.50'),
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-10'),
    observaciones: null,
    estadoAprobacion: 'PENDIENTE',
    decididoPorId: null,
    decididoEn: null,
    cantidadComprada: new Prisma.Decimal('0.00'),
    cantidadEntregada: new Prisma.Decimal('0.00'),
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CompraMapper', () => {
  describe('toDomain()', () => {
    it('mapea la cabecera + los items incluidos a CompraEntity', () => {
      const row = { ...makeFakeCompraRow(), items: [makeFakeItemRow()] };
      const entity = CompraMapper.toDomain(row);

      expect(entity.id).toBe(row.id);
      expect(entity.numero).toBe('COM-2026-00001');
      expect(entity.motivo).toBe('Renovación de equipos');
      expect(entity.solicitanteId).toBe('usuario-1');
      expect(entity.cicloId).toBe('ciclo-1');
      expect(entity.canceladaEn).toBeNull();
      expect(entity.items).toHaveLength(1);
      expect(entity.items[0].descripcion).toBe('Notebook Dell');
      expect(entity.items[0].cantidad).toBe(2);
      expect(entity.items[0].monto).toBe(150000.5);
    });

    it('mapea una compra sin items (n=0, S1)', () => {
      const row = { ...makeFakeCompraRow(), items: [] };
      const entity = CompraMapper.toDomain(row);
      expect(entity.items).toHaveLength(0);
      expect(entity.estado).toBe('PENDIENTE');
    });

    it('mapea una compra cancelada con sus 3 campos de cancelación', () => {
      const canceladaEn = new Date('2026-02-01T00:00:00.000Z');
      const row = {
        ...makeFakeCompraRow({
          canceladaEn,
          canceladoPorId: 'usuario-2',
          motivoCancelacion: 'Presupuesto retirado',
        }),
        items: [],
      };
      const entity = CompraMapper.toDomain(row);

      expect(entity.canceladaEn).toEqual(canceladaEn);
      expect(entity.canceladoPorId).toBe('usuario-2');
      expect(entity.motivoCancelacion).toBe('Presupuesto retirado');
      expect(entity.estado).toBe('CANCELADO');
    });

    it('incluye items soft-deleted en la colección (la entidad los necesita para reconstitute)', () => {
      const itemBorrado = makeFakeItemRow({
        id: 'item-borrado',
        deletedAt: new Date('2026-01-20'),
      });
      const row = { ...makeFakeCompraRow(), items: [itemBorrado] };
      const entity = CompraMapper.toDomain(row);

      expect(entity.items).toHaveLength(1);
      expect(entity.items[0].isDeleted()).toBe(true);
      // El ítem soft-deleted no cuenta para la derivación de estado (n=0 activos).
      expect(entity.estado).toBe('PENDIENTE');
    });
  });

  describe('toPersistence()', () => {
    it('convierte CompraEntity a un objeto plano de cabecera, SIN items (guardarItem los persiste aparte)', () => {
      const entity = CompraEntity.reconstitute(
        {
          numero: 'COM-2026-00002',
          fechaSolicitud: new Date('2026-01-15'),
          motivo: 'Compra de licencias',
          descripcion: 'Renovación anual',
          solicitanteId: 'usuario-1',
          cicloId: 'ciclo-1',
          canceladaEn: null,
          canceladoPorId: null,
          motivoCancelacion: null,
        },
        [],
        'compra-2',
        new Date('2026-01-15T09:00:00.000Z'),
        new Date('2026-01-15T09:00:00.000Z'),
        null,
      );

      const data = CompraMapper.toPersistence(entity);

      expect(data.id).toBe('compra-2');
      expect(data.numero).toBe('COM-2026-00002');
      expect(data.motivo).toBe('Compra de licencias');
      expect(data.cicloId).toBe('ciclo-1');
      expect(data.deletedAt).toBeNull();
      expect(data).not.toHaveProperty('items');
    });
  });
});
