/**
 * T5.4 [U] TEST — `OperacionTicketMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (sin DB) → OperacionTicketEntity, y viceversa.
 *
 * Tarea: T5.4
 */
import { Prisma, type OperacionTicket as PrismaOperacionTicket } from '.prisma/tenant';
import { OperacionTicketMapper } from './operacion-ticket.mapper';
import { OperacionTicketEntity } from '../../../domain/entities/operacion-ticket.entity';

function makeFakeRow(overrides: Partial<PrismaOperacionTicket> = {}): PrismaOperacionTicket {
  return {
    id: '01966a6a-0000-7000-8000-000000000010',
    ticketId: 'ticket-id',
    tipoOperacionId: 'tipo-op-cambio-estado-id',
    descripcion: 'Ticket creado',
    estadoAnteriorId: null,
    estadoNuevoId: 'estado-nuevo-id',
    autorId: 'autor-id',
    esInterno: false,
    metadata: null,
    slaRelojSeq: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('OperacionTicketMapper', () => {
  describe('toDomain()', () => {
    it('mapea todos los campos de una fila Prisma a OperacionTicketEntity', () => {
      const row = makeFakeRow();
      const entity = OperacionTicketMapper.toDomain(row);

      expect(entity.id).toBe(row.id);
      expect(entity.ticketId).toBe(row.ticketId);
      expect(entity.tipoOperacionId).toBe(row.tipoOperacionId);
      expect(entity.descripcion).toBe(row.descripcion);
      expect(entity.estadoAnteriorId).toBeNull();
      expect(entity.estadoNuevoId).toBe(row.estadoNuevoId);
      expect(entity.autorId).toBe(row.autorId);
      expect(entity.esInterno).toBe(false);
      expect(entity.metadata).toBeNull();
    });

    it('mapea metadata JSON no-null y esInterno=true', () => {
      const metadata = { previo: null, nuevo: 'usuario-x' } as Prisma.JsonValue;
      const row = makeFakeRow({ esInterno: true, metadata });
      const entity = OperacionTicketMapper.toDomain(row);

      expect(entity.esInterno).toBe(true);
      expect(entity.metadata).toEqual({ previo: null, nuevo: 'usuario-x' });
    });
  });

  describe('toPersistence()', () => {
    it('convierte OperacionTicketEntity a un objeto plano para INSERT', () => {
      const entity = OperacionTicketEntity.create(
        {
          ticketId: 'ticket-id',
          tipoOperacionId: 'tipo-op-id',
          descripcion: 'Comentario público',
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: 'autor-id',
          metadata: null,
        },
        '01966a6a-0000-7000-8000-000000000011',
      );

      const data = OperacionTicketMapper.toPersistence(entity);

      expect(data.id).toBe(entity.id);
      expect(data.ticketId).toBe('ticket-id');
      expect(data.esInterno).toBe(false);
      // metadata null → sentinel Prisma.JsonNull (NO `null` plano: Prisma
      // distingue "columna NULL" de "no tocar la columna" en campos Json?).
      expect(data.metadata).toBe(Prisma.JsonNull);
    });

    it('pasa metadata no-null tal cual (JSON serializable)', () => {
      const entity = OperacionTicketEntity.create({
        ticketId: 'ticket-id',
        tipoOperacionId: 'tipo-op-id',
        descripcion: null,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: 'autor-id',
        metadata: { previo: null, nuevo: 'usuario-x' },
      });

      const data = OperacionTicketMapper.toPersistence(entity);
      expect(data.metadata).toEqual({ previo: null, nuevo: 'usuario-x' });
    });
  });
});
