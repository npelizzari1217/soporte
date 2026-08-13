/**
 * PR-10 [C] TEST — `OperacionCompraMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (sin DB) → `OperacionCompra` (tipo plano, ver
 * `i-operacion-compra.repository.ts`), y viceversa. Precedente:
 * `operacion-ticket.mapper.spec.ts` — mismo criterio para `datos`/`metadata`
 * JSON (`Prisma.JsonNull` como sentinel de "columna NULL").
 *
 * Tarea: PR-10.
 */
import { Prisma, type OperacionCompra as PrismaOperacionCompra } from '.prisma/tenant';
import { CrearOperacionCompraProps } from '../../../domain/ports/i-operacion-compra.repository';
import { OperacionCompraMapper } from './operacion-compra.mapper';

function makeFakeRow(overrides: Partial<PrismaOperacionCompra> = {}): PrismaOperacionCompra {
  return {
    id: '01966a6a-0000-7000-8000-000000000030',
    compraId: '01966a6a-0000-7000-8000-000000000001',
    itemCompraId: null,
    tipo: 'CREACION',
    usuarioId: 'usuario-1',
    detalle: 'Compra creada',
    datos: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    ...overrides,
  };
}

describe('OperacionCompraMapper', () => {
  describe('toDomain()', () => {
    it('mapea una operación de cabecera (itemCompraId null)', () => {
      const row = makeFakeRow();
      const operacion = OperacionCompraMapper.toDomain(row);

      expect(operacion.id).toBe(row.id);
      expect(operacion.compraId).toBe(row.compraId);
      expect(operacion.itemCompraId).toBeNull();
      expect(operacion.tipo).toBe('CREACION');
      expect(operacion.usuarioId).toBe('usuario-1');
      expect(operacion.detalle).toBe('Compra creada');
      expect(operacion.datos).toBeNull();
      expect(operacion.createdAt).toEqual(row.createdAt);
    });

    it('mapea una operación de ítem con datos JSON no-null', () => {
      const datos = { cantidadAnterior: 0, cantidadNueva: 5 } as Prisma.JsonValue;
      const row = makeFakeRow({
        itemCompraId: 'item-1',
        tipo: 'ITEM_APROBADO',
        datos,
      });
      const operacion = OperacionCompraMapper.toDomain(row);

      expect(operacion.itemCompraId).toBe('item-1');
      expect(operacion.tipo).toBe('ITEM_APROBADO');
      expect(operacion.datos).toEqual({ cantidadAnterior: 0, cantidadNueva: 5 });
    });
  });

  describe('toPersistence()', () => {
    it('convierte CrearOperacionCompraProps a input de creación Prisma, sin id (dbgenerated)', () => {
      const props: CrearOperacionCompraProps = {
        compraId: 'compra-1',
        itemCompraId: null,
        tipo: 'CANCELACION',
        usuarioId: 'usuario-2',
        detalle: 'Compra cancelada',
        datos: null,
      };

      const data = OperacionCompraMapper.toPersistence(props);

      expect(data).not.toHaveProperty('id');
      expect(data.compraId).toBe('compra-1');
      expect(data.itemCompraId).toBeNull();
      expect(data.tipo).toBe('CANCELACION');
      expect(data.usuarioId).toBe('usuario-2');
      expect(data.detalle).toBe('Compra cancelada');
      // datos null -> sentinel Prisma.JsonNull (misma convención que OperacionTicketMapper).
      expect(data.datos).toBe(Prisma.JsonNull);
    });

    it('pasa datos no-null tal cual (JSON serializable)', () => {
      const props: CrearOperacionCompraProps = {
        compraId: 'compra-1',
        itemCompraId: 'item-1',
        tipo: 'ITEM_ELIMINADO',
        usuarioId: 'usuario-2',
        detalle: 'Ítem eliminado',
        datos: { motivo: 'duplicado' },
      };

      const data = OperacionCompraMapper.toPersistence(props);
      expect(data.datos).toEqual({ motivo: 'duplicado' });
    });
  });
});
