/**
 * ticket-compra.mapper.spec.ts — odd/edilicia-obra-externa T1b (S2).
 *
 * El mapper es lo único que lleva `es_servicio` de la fila al bloqueo. Si emitiera un valor fijo,
 * `comprasQueBloquean` nunca vería un ítem de servicio y la suite de dominio seguiría en verde. Por
 * eso los casos pasan por el mapper REAL y terminan en el bloqueo, incluido el filtro de borrados.
 */
import { describe, expect, it } from 'vitest';
import {
  Prisma,
  type Compra as PrismaCompra,
  type ItemCompra as PrismaItemCompra,
} from '.prisma/tenant';
import { comprasQueBloquean } from '../../../domain/services/bloqueo-reparacion';
import { TicketCompraMapper } from './ticket-compra.mapper';

function filaItem(overrides: Partial<PrismaItemCompra> = {}): PrismaItemCompra {
  return {
    id: '01966a6a-0000-7000-8000-000000000020',
    compraId: '01966a6a-0000-7000-8000-000000000001',
    descripcion: 'Ítem de test',
    insumoId: null,
    esServicio: false,
    cantidad: new Prisma.Decimal('1.00'),
    proveedor: 'Proveedor SA',
    monto: new Prisma.Decimal('100.00'),
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

function vinculo(items: PrismaItemCompra[]): {
  compra: PrismaCompra & { items: PrismaItemCompra[] };
} {
  return {
    compra: {
      id: '01966a6a-0000-7000-8000-000000000001',
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-01-10'),
      motivo: 'Obra externa',
      descripcion: null,
      solicitanteId: 'usuario-1',
      cicloId: 'ciclo-1',
      canceladaEn: null,
      canceladoPorId: null,
      motivoCancelacion: null,
      sectorId: null,
      tipoTicketId: null,
      createdAt: new Date('2026-01-10T10:00:00.000Z'),
      updatedAt: new Date('2026-01-10T10:00:00.000Z'),
      deletedAt: null,
      items,
    },
  };
}

const BORRADO = new Date('2026-01-11T10:00:00.000Z');

describe('TicketCompraMapper → comprasQueBloquean: ítems de servicio (S2)', () => {
  it('lleva esServicio=true de la fila a la vista', () => {
    const vista = TicketCompraMapper.toCompraVinculada(vinculo([filaItem({ esServicio: true })]));

    expect(vista.items.map((item) => item.esServicio)).toEqual([true]);
    expect(comprasQueBloquean([vista])).toEqual([]);
  });

  it('un bien borrado junto a un servicio activo no bloquea', () => {
    const vista = TicketCompraMapper.toCompraVinculada(
      vinculo([filaItem({ id: 'a', deletedAt: BORRADO }), filaItem({ id: 'b', esServicio: true })]),
    );

    expect(comprasQueBloquean([vista])).toEqual([]);
  });

  it('un servicio borrado junto a un bien activo bloquea', () => {
    const vista = TicketCompraMapper.toCompraVinculada(
      vinculo([filaItem({ id: 'a', esServicio: true, deletedAt: BORRADO }), filaItem({ id: 'b' })]),
    );

    expect(comprasQueBloquean([vista])).toEqual([vista]);
  });

  it('si todos los servicios están borrados la compra queda vacía y bloquea', () => {
    const vista = TicketCompraMapper.toCompraVinculada(
      vinculo([filaItem({ esServicio: true, deletedAt: BORRADO })]),
    );

    expect(comprasQueBloquean([vista])).toEqual([vista]);
  });
});
