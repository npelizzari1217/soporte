/**
 * T5.1 [U] TEST — `TicketMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (sin DB) → TicketEntity, y viceversa.
 *
 * Tarea: T5.1
 */
import type { Ticket as PrismaTicket } from '.prisma/tenant';
import { TicketMapper } from './ticket.mapper';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

/** Fila Prisma fake, tipada contra el client generado — sin tocar la DB. */
function makeFakeRow(overrides: Partial<PrismaTicket> = {}): PrismaTicket {
  return {
    id: '01966a6a-0000-7000-8000-000000000001',
    numero: 'SOP-2026-00001',
    titulo: 'Impresora no imprime',
    descripcion: 'La impresora del piso 3 no responde.',
    tipoId: 'tipo-soporte-id',
    estadoId: 'estado-nuevo-id',
    prioridadId: 'prioridad-media-id',
    cicloId: 'ciclo-activo-id',
    ticketReferenciaId: null,
    solicitanteId: 'usuario-solicitante-id',
    asignadoId: null,
    slaVenceAt: null,
    vencido: false,
    fechaCierre: null,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('TicketMapper', () => {
  describe('toDomain()', () => {
    it('mapea todos los campos de una fila Prisma a TicketEntity', () => {
      const row = makeFakeRow();
      const entity = TicketMapper.toDomain(row);

      expect(entity.id).toBe(row.id);
      expect(entity.numero).toBe('SOP-2026-00001');
      expect(entity.titulo).toBe(row.titulo);
      expect(entity.descripcion).toBe(row.descripcion);
      expect(entity.tipoId).toBe(row.tipoId);
      expect(entity.estadoId).toBe(row.estadoId);
      expect(entity.prioridadId).toBe(row.prioridadId);
      expect(entity.cicloId).toBe(row.cicloId);
      expect(entity.ticketReferenciaId).toBeNull();
      expect(entity.solicitanteId).toBe(row.solicitanteId);
      expect(entity.asignadoId).toBeNull();
      expect(entity.slaVenceAt).toBeNull();
      expect(entity.vencido).toBe(false);
      expect(entity.fechaCierre).toBeNull();
      expect(entity.createdAt.getTime()).toBe(row.createdAt.getTime());
      expect(entity.deletedAt).toBeNull();
    });

    it('mapea ticketReferenciaId, asignadoId y fechaCierre cuando no son null', () => {
      const row = makeFakeRow({
        ticketReferenciaId: 'ticket-anterior-id',
        asignadoId: 'usuario-asignado-id',
        fechaCierre: new Date('2026-02-01T00:00:00.000Z'),
        vencido: true,
      });
      const entity = TicketMapper.toDomain(row);

      expect(entity.ticketReferenciaId).toBe('ticket-anterior-id');
      expect(entity.asignadoId).toBe('usuario-asignado-id');
      expect(entity.fechaCierre?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(entity.vencido).toBe(true);
    });
  });

  describe('toPersistence()', () => {
    it('convierte TicketEntity a un objeto plano con todos los campos escalares', () => {
      const entity = TicketEntity.create(
        {
          numero: 'SOP-2026-00042',
          titulo: 'Título',
          descripcion: null,
          tipoId: 'tipo-id',
          estadoId: 'estado-id',
          prioridadId: 'prioridad-id',
          cicloId: null,
          ticketReferenciaId: null,
          solicitanteId: 'solicitante-id',
        },
        '01966a6a-0000-7000-8000-000000000002',
      );

      const data = TicketMapper.toPersistence(entity);

      expect(data.id).toBe(entity.id);
      expect(data.numero).toBe('SOP-2026-00042');
      expect(data.asignadoId).toBeNull();
      expect(data.slaVenceAt).toBeNull();
      expect(data.vencido).toBe(false);
      expect(data.fechaCierre).toBeNull();
      expect(data.deletedAt).toBeNull();
      expect(data.createdAt).toBeInstanceOf(Date);
    });
  });
});
