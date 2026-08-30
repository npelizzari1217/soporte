/**
 * T6.3 [UNIT][RED→GREEN] — `TicketEdiliciaEntity`.
 *
 * create (porcentajeAvance=0, personalAsignadoId=null); actualizarAvance;
 * asignarPersonal.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
import {
  TicketEdiliciaEntity,
  TICKET_EDILICIA_UBICACION_MAX_LENGTH,
} from './ticket-edilicia.entity';

describe('TicketEdiliciaEntity', () => {
  describe('create()', () => {
    it('crea el satélite con porcentajeAvance=0 y personalAsignadoId=null', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacion: 'Oficina Central',
      });

      expect(entity.ticketId).toBe('ticket-uuid');
      expect(entity.ubicacion).toBe('Oficina Central');
      expect(entity.porcentajeAvance).toBe(0);
      expect(entity.personalAsignadoId).toBeNull();
      expect(entity.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const entity = TicketEdiliciaEntity.create(
        { ticketId: 'ticket-uuid', ubicacion: 'Oficina Central' },
        'explicit-id',
      );
      expect(entity.id).toBe('explicit-id');
    });

    it('ubicacion es opcional — null si no se provee', () => {
      const entity = TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid' });
      expect(entity.ubicacion).toBeNull();
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const entity = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-uuid',
          ubicacion: 'Oficina Central',
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
        ubicacion: 'Oficina Central',
      });

      entity.actualizarAvance(75.5);

      expect(entity.porcentajeAvance).toBe(75.5);
    });
  });

  describe('asignarPersonal()', () => {
    it('asigna el personal de mantenimiento ejecutor', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacion: 'Oficina Central',
      });

      entity.asignarPersonal('tecnico-uuid');

      expect(entity.personalAsignadoId).toBe('tecnico-uuid');
    });

    it('desasigna el personal cuando se pasa null', () => {
      const entity = TicketEdiliciaEntity.create({
        ticketId: 'ticket-uuid',
        ubicacion: 'Oficina Central',
      });
      entity.asignarPersonal('tecnico-uuid');

      entity.asignarPersonal(null);

      expect(entity.personalAsignadoId).toBeNull();
    });
  });
});

/**
 * Tope de largo de `ubicacion`, espejando
 * `ticketsEdilicia.ubicacion VarChar(255)` (`prisma_tenant/schema.prisma`).
 *
 * Hasta este cambio no lo acotaba NINGUNA capa: ni el schema zod, ni
 * `CreateTicketEdilicioHttpDto`, ni el dominio. Un texto largo pegado en el
 * campo pasaba las dos validaciones y moría en Postgres: 22001, o sea un 500
 * crudo en vez de un 400 limpio.
 */
describe('TicketEdiliciaEntity — tope de largo de ubicacion', () => {
  it('acepta una ubicacion en el límite exacto', () => {
    const t = TicketEdiliciaEntity.create({
      ticketId: 'tk-1',
      ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH),
    });
    expect(t.ubicacion).toHaveLength(TICKET_EDILICIA_UBICACION_MAX_LENGTH);
  });

  it('rechaza una ubicacion que pasa el tope', () => {
    expect(() =>
      TicketEdiliciaEntity.create({
        ticketId: 'tk-1',
        ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH + 1),
      }),
    ).toThrow(/ubicacion excede/);
  });

  it('sigue aceptando ubicacion nula: el tope no la vuelve obligatoria', () => {
    expect(TicketEdiliciaEntity.create({ ticketId: 'tk-1', ubicacion: null }).ubicacion).toBeNull();
  });

  /** Centinela de valor: el tope es el ancho real de la columna. */
  it('el tope coincide con el ancho de la columna', () => {
    expect(TICKET_EDILICIA_UBICACION_MAX_LENGTH).toBe(255);
  });
});
