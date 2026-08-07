/**
 * T6.3 [UNIT][RED→GREEN] — `TicketEdiliciaEntity`.
 *
 * create (porcentajeAvance=0, personalAsignadoId=null); actualizarAvance;
 * asignarPersonal.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
import { TicketEdiliciaEntity } from './ticket-edilicia.entity';

describe('TicketEdiliciaEntity', () => {
  describe('create()', () => {
    it('crea el satélite con porcentajeAvance=0 y personalAsignadoId=null', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacionId: 'ubicacion-uuid',
      });

      expect(entity.ticketId).toBe('ticket-uuid');
      expect(entity.ubicacionId).toBe('ubicacion-uuid');
      expect(entity.porcentajeAvance).toBe(0);
      expect(entity.personalAsignadoId).toBeNull();
      expect(entity.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const entity = TicketEdiliciaEntity.create(
        { ticketId: 'ticket-uuid', ubicacionId: 'ubicacion-uuid' },
        'explicit-id',
      );
      expect(entity.id).toBe('explicit-id');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const entity = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-uuid',
          ubicacionId: 'ubicacion-uuid',
          personalAsignadoId: 'usuario-uuid',
          porcentajeAvance: 50,
        },
        'db-uuid',
        createdAt,
        updatedAt,
        null,
      );

      expect(entity.id).toBe('db-uuid');
      expect(entity.porcentajeAvance).toBe(50);
      expect(entity.personalAsignadoId).toBe('usuario-uuid');
      expect(entity.createdAt).toEqual(createdAt);
      expect(entity.deletedAt).toBeNull();
    });
  });

  describe('actualizarAvance()', () => {
    it('actualiza el porcentaje de avance', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacionId: 'ubicacion-uuid',
      });

      entity.actualizarAvance(75.5);

      expect(entity.porcentajeAvance).toBe(75.5);
    });
  });

  describe('asignarPersonal()', () => {
    it('asigna el personal de mantenimiento ejecutor', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacionId: 'ubicacion-uuid',
      });

      entity.asignarPersonal('tecnico-uuid');

      expect(entity.personalAsignadoId).toBe('tecnico-uuid');
    });

    it('desasigna el personal cuando se pasa null', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacionId: 'ubicacion-uuid',
      });
      entity.asignarPersonal('tecnico-uuid');

      entity.asignarPersonal(null);

      expect(entity.personalAsignadoId).toBeNull();
    });
  });
});
