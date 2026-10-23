/**
 * T6.3 [UNIT][RED→GREEN] — `TicketEdiliciaEntity`.
 *
 * create y reconstitute. `porcentajeAvance` y `personalAsignadoId` se
 * retiraron en odd/tareas-con-tecnico T8: el avance se calcula al leer. La
 * ubicación propia se retiró en odd/ticket-unificado (S1): el satélite nace sin
 * ubicación y, al leerlo, trae la del ticket base.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
import { TicketEdiliciaEntity } from './ticket-edilicia.entity';

describe('TicketEdiliciaEntity', () => {
  describe('create()', () => {
    it('crea el satélite con su ticket y sin ubicación propia', () => {
      const entity = TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' });

      expect(entity.ticketId).toBe('ticket-uuid');
      expect(entity.ubicacion).toBeNull();
      expect(entity.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const entity = TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' }, 'explicit-id');
      expect(entity.id).toBe('explicit-id');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia, con la ubicación del ticket base', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const entity = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-uuid',
          ubicacion: 'Oficina Central',
        },
        'db-uuid',
        createdAt,
        updatedAt,
        null,
      );

      expect(entity.id).toBe('db-uuid');
      expect(entity.ubicacion).toBe('Oficina Central');
      expect(entity.createdAt).toEqual(createdAt);
      expect(entity.deletedAt).toBeNull();
    });
  });
});
