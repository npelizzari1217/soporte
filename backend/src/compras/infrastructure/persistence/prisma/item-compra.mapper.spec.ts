/**
 * PR-10 [C] TEST — `ItemCompraMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (sin DB) → ItemCompraEntity, y viceversa.
 * Foco (ADR-C3): la conversión `Decimal <-> number` en los bordes de
 * precisión de `Decimal(10,2)` (cantidad/cantidadComprada/cantidadEntregada)
 * y `Decimal(14,2)` (monto) NO debe perder precisión — round-trip completo
 * `Decimal -> number (toDomain) -> number (toPersistence) -> Decimal` sobre
 * cada valor de borde.
 *
 * Precedente: `equipo-informatico.mapper.ts:27-30` resuelve la misma
 * conversión (`Number(row.campo)` en toDomain, número plano en
 * toPersistence — Prisma acepta number/string en columnas Decimal) — este
 * mapper replica ese criterio.
 *
 * Tarea: PR-10.
 */
import { Prisma, type ItemCompra as PrismaItemCompra } from '.prisma/tenant';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';
import { ItemCompraMapper } from './item-compra.mapper';

function makeFakeRow(overrides: Partial<PrismaItemCompra> = {}): PrismaItemCompra {
  return {
    id: '01966a6a-0000-7000-8000-000000000020',
    compraId: '01966a6a-0000-7000-8000-000000000001',
    descripcion: 'Notebook Dell',
    insumoId: null,
    cantidad: new Prisma.Decimal('2.00'),
    proveedor: 'Proveedor SA',
    monto: new Prisma.Decimal('150000.50'),
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-10'),
    observaciones: null,
    estadoAprobacion: 'PENDIENTE',
    decididoPorId: null,
    decididoEn: null,
    cantidadOrdenada: new Prisma.Decimal('0.00'),
    cantidadRecibida: new Prisma.Decimal('0.00'),
    cantidadEntregada: new Prisma.Decimal('0.00'),
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('ItemCompraMapper', () => {
  describe('toDomain()', () => {
    it('mapea todos los campos de una fila Prisma a ItemCompraEntity, convirtiendo Decimal -> number', () => {
      const row = makeFakeRow();
      const entity = ItemCompraMapper.toDomain(row);

      expect(entity.id).toBe(row.id);
      expect(entity.compraId).toBe(row.compraId);
      expect(entity.descripcion).toBe('Notebook Dell');
      expect(entity.cantidad).toBe(2);
      expect(typeof entity.cantidad).toBe('number');
      expect(entity.proveedor).toBe('Proveedor SA');
      expect(entity.monto).toBe(150000.5);
      expect(typeof entity.monto).toBe('number');
      expect(entity.moneda).toBe('ARS');
      expect(entity.estadoAprobacion).toBe('PENDIENTE');
      expect(entity.decididoPorId).toBeNull();
      expect(entity.decididoEn).toBeNull();
      expect(entity.cantidadOrdenada).toBe(0);
      expect(entity.cantidadRecibida).toBe(0);
      expect(entity.cantidadEntregada).toBe(0);
      expect(entity.fechaOrden).toBeNull();
      expect(entity.fechaRecepcion).toBeNull();
      expect(entity.fechaEntrega).toBeNull();
      expect(entity.cerradoConFaltante).toBe(false);
      expect(entity.motivoCierreFaltante).toBeNull();
    });

    it('mapea un ítem decidido (APROBADO) con decididoPorId/decididoEn no nulos', () => {
      const decididoEn = new Date('2026-02-01T12:00:00.000Z');
      const row = makeFakeRow({
        estadoAprobacion: 'APROBADO',
        decididoPorId: 'usuario-x',
        decididoEn,
      });
      const entity = ItemCompraMapper.toDomain(row);

      expect(entity.estadoAprobacion).toBe('APROBADO');
      expect(entity.decididoPorId).toBe('usuario-x');
      expect(entity.decididoEn).toEqual(decididoEn);
    });

    it('mapea un ítem cerrado con faltante', () => {
      const row = makeFakeRow({
        cerradoConFaltante: true,
        motivoCierreFaltante: 'Proveedor sin stock',
        cantidadRecibida: new Prisma.Decimal('1.00'),
      });
      const entity = ItemCompraMapper.toDomain(row);

      expect(entity.cerradoConFaltante).toBe(true);
      expect(entity.motivoCierreFaltante).toBe('Proveedor sin stock');
      expect(entity.cantidadRecibida).toBe(1);
    });

    it('mapea el insumo del ítem cuando la fila lo trae', () => {
      const row = makeFakeRow({ insumoId: '01966a6a-0000-7000-8000-0000000000aa' });
      const entity = ItemCompraMapper.toDomain(row);

      expect(entity.insumoId).toBe('01966a6a-0000-7000-8000-0000000000aa');
    });

    // Hermano invertido: los ítems históricos quedan en NULL para siempre
    // (insumos-entrega-3, decisión 6) y el mapper tiene que sostenerlo.
    it('mapea a null el ítem histórico sin insumo', () => {
      const entity = ItemCompraMapper.toDomain(makeFakeRow());

      expect(entity.insumoId).toBeNull();
    });

    it('mapea las tres fechas de etapa cuando están presentes', () => {
      const row = makeFakeRow({
        fechaOrden: new Date('2026-08-10'),
        fechaRecepcion: new Date('2026-08-12'),
        fechaEntrega: new Date('2026-08-15'),
      });
      const entity = ItemCompraMapper.toDomain(row);

      expect(entity.fechaOrden).toEqual(new Date('2026-08-10'));
      expect(entity.fechaRecepcion).toEqual(new Date('2026-08-12'));
      expect(entity.fechaEntrega).toEqual(new Date('2026-08-15'));
    });
  });

  describe('toPersistence()', () => {
    it('convierte ItemCompraEntity a un objeto plano para Prisma, con cantidades como number', () => {
      const entity = ItemCompraEntity.reconstitute(
        {
          compraId: 'compra-1',
          descripcion: 'Monitor 24"',
          cantidad: 3,
          proveedor: 'Proveedor SA',
          monto: 45000.75,
          moneda: 'USD',
          fechaCotizacion: new Date('2026-01-05'),
          observaciones: 'Urgente',
          insumoId: null,
          estadoAprobacion: 'PENDIENTE',
          decididoPorId: null,
          decididoEn: null,
          cantidadOrdenada: 0,
          cantidadRecibida: 0,
          cantidadEntregada: 0,
          fechaOrden: null,
          fechaRecepcion: null,
          fechaEntrega: null,
          cerradoConFaltante: false,
          motivoCierreFaltante: null,
        },
        'item-1',
        new Date('2026-01-05T09:00:00.000Z'),
        new Date('2026-01-05T09:00:00.000Z'),
        null,
      );

      const data = ItemCompraMapper.toPersistence(entity);

      expect(data.id).toBe('item-1');
      expect(data.compraId).toBe('compra-1');
      expect(data.cantidad).toBe(3);
      expect(typeof data.cantidad).toBe('number');
      expect(data.monto).toBe(45000.75);
      expect(data.moneda).toBe('USD');
      expect(data.deletedAt).toBeNull();
      expect(data.createdAt).toEqual(new Date('2026-01-05T09:00:00.000Z'));
    });
  });

  // EL RIESGO DE TRASPASO de insumos-entrega-3, unidad 1 -> unidad 2. Este
  // shape alimenta un UPSERT: mientras `toPersistence` emitiera `insumoId:
  // null` fijo, cada guardado del ítem reescribía la columna a NULL. Era
  // inocuo mientras nada escribía el vínculo, y pérdida silenciosa en cuanto
  // la entidad pasó a llevarlo. Ni un error ni un log habrían avisado.
  describe('toPersistence() — el vínculo con el insumo sobrevive al UPSERT', () => {
    /** Ítem reconstituido con el insumo indicado, listo para persistir. */
    function itemConInsumo(insumoId: string | null): ItemCompraEntity {
      return ItemCompraEntity.reconstitute(
        {
          compraId: 'compra-1',
          descripcion: 'Tóner negro',
          insumoId,
          cantidad: 3,
          proveedor: 'Proveedor SA',
          monto: 1000,
          moneda: 'ARS',
          fechaCotizacion: new Date('2026-01-05'),
          observaciones: null,
          estadoAprobacion: 'PENDIENTE',
          decididoPorId: null,
          decididoEn: null,
          cantidadOrdenada: 0,
          cantidadRecibida: 0,
          cantidadEntregada: 0,
          fechaOrden: null,
          fechaRecepcion: null,
          fechaEntrega: null,
          cerradoConFaltante: false,
          motivoCierreFaltante: null,
        },
        'item-1',
        new Date('2026-01-05T09:00:00.000Z'),
        new Date('2026-01-05T09:00:00.000Z'),
        null,
      );
    }

    it('emite el insumo de la ENTIDAD, no un null fijo', () => {
      const data = ItemCompraMapper.toPersistence(itemConInsumo('insumo-a'));

      expect(data.insumoId).toBe('insumo-a');
    });

    // Hermano invertido: el ítem sin insumo sí emite null, así que el test de
    // arriba no pasa por un mapper que devolviera cualquier cosa no nula.
    it('emite null cuando el ítem no tiene insumo', () => {
      const data = ItemCompraMapper.toPersistence(itemConInsumo(null));

      expect(data.insumoId).toBeNull();
    });

    it('GUARDAR DOS VECES no pierde el vínculo: el segundo shape lo sigue trayendo', () => {
      const primera = ItemCompraMapper.toPersistence(itemConInsumo('insumo-a'));

      // Lo que la DB devolvería tras ese primer guardado, releído por el repo.
      const relectura = ItemCompraMapper.toDomain(
        makeFakeRow({ id: primera.id, insumoId: primera.insumoId }),
      );
      const segunda = ItemCompraMapper.toPersistence(relectura);

      expect(relectura.insumoId).toBe('insumo-a');
      expect(segunda.insumoId).toBe('insumo-a');
    });
  });

  describe('round-trip Decimal -> number -> Decimal (ADR-C3, sin pérdida de precisión)', () => {
    // Bordes pedidos por el orquestador (0.1, 0.3, 999999.99) + bordes de
    // precisión propios del schema: Decimal(10,2) (cantidad/cantidadComprada/
    // cantidadEntregada, máx 8 dígitos enteros -> 99999999.99) y
    // Decimal(14,2) (monto, máx 12 dígitos enteros -> 999999999999.99).
    const casosDecimal10 = ['0.1', '0.3', '999999.99', '99999999.99', '0.01', '0.00'];
    const casosDecimal14 = ['0.1', '0.3', '999999.99', '999999999999.99', '0.01'];

    it.each(casosDecimal10)(
      'cantidad=%s (Decimal(10,2)) sobrevive el round-trip toDomain -> toPersistence sin perder precisión',
      (valor) => {
        const decimalOriginal = new Prisma.Decimal(valor);
        const row = makeFakeRow({ cantidad: decimalOriginal });

        const entity = ItemCompraMapper.toDomain(row);
        const persistido = ItemCompraMapper.toPersistence(entity);
        const decimalDeVuelta = new Prisma.Decimal(persistido.cantidad as number);

        expect(decimalDeVuelta.toString()).toBe(decimalOriginal.toString());
      },
    );

    it.each(casosDecimal14)(
      'monto=%s (Decimal(14,2)) sobrevive el round-trip toDomain -> toPersistence sin perder precisión',
      (valor) => {
        const decimalOriginal = new Prisma.Decimal(valor);
        const row = makeFakeRow({ monto: decimalOriginal });

        const entity = ItemCompraMapper.toDomain(row);
        const persistido = ItemCompraMapper.toPersistence(entity);
        const decimalDeVuelta = new Prisma.Decimal(persistido.monto as number);

        expect(decimalDeVuelta.toString()).toBe(decimalOriginal.toString());
      },
    );
  });
});
