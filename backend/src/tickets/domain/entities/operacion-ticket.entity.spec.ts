/**
 * T3.5 [UNIT] — RED→GREEN: OperacionTicketEntity (timeline inmutable).
 *
 * `create()` acepta `esInterno` opcional con default `false` (público —
 * spec T16). La entidad es inmutable: solo getters + `softDelete()`
 * heredado, sin mutadores de negocio.
 *
 * Ref spec: sdd/tickets-core/spec T12, T16, T17. Tarea: T3.5.
 */
import { OperacionTicketEntity } from './operacion-ticket.entity';

function baseProps() {
  return {
    ticketId: 'ticket-uuid',
    tipoOperacionId: 'tipo-cambio-estado-uuid',
    descripcion: 'Apertura del ticket',
    estadoAnteriorId: null,
    estadoNuevoId: 'estado-nuevo-uuid',
    autorId: 'autor-uuid',
    metadata: null,
  };
}

describe('OperacionTicketEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const operacion = OperacionTicketEntity.create(baseProps());

      expect(operacion.ticketId).toBe('ticket-uuid');
      expect(operacion.tipoOperacionId).toBe('tipo-cambio-estado-uuid');
      expect(operacion.descripcion).toBe('Apertura del ticket');
      expect(operacion.estadoAnteriorId).toBeNull();
      expect(operacion.estadoNuevoId).toBe('estado-nuevo-uuid');
      expect(operacion.autorId).toBe('autor-uuid');
      expect(operacion.metadata).toBeNull();
      expect(operacion.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('default esInterno=false cuando no se provee (comentario público, T16)', () => {
      const operacion = OperacionTicketEntity.create(baseProps());
      expect(operacion.esInterno).toBe(false);
    });

    it('respeta esInterno=true cuando se provee explícitamente (T17)', () => {
      const operacion = OperacionTicketEntity.create({ ...baseProps(), esInterno: true });
      expect(operacion.esInterno).toBe(true);
    });

    it('respeta esInterno=false explícito', () => {
      const operacion = OperacionTicketEntity.create({ ...baseProps(), esInterno: false });
      expect(operacion.esInterno).toBe(false);
    });

    it('acepta metadata estructurada', () => {
      const operacion = OperacionTicketEntity.create({
        ...baseProps(),
        metadata: { porcentajeAvance: 75 },
      });
      expect(operacion.metadata).toEqual({ porcentajeAvance: 75 });
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const operacion = OperacionTicketEntity.create(baseProps(), 'explicit-id-001');
      expect(operacion.id).toBe('explicit-id-001');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id, timestamps y esInterno', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-01T00:00:00Z');

      const operacion = OperacionTicketEntity.reconstitute(
        { ...baseProps(), esInterno: true },
        'db-uuid-operacion',
        createdAt,
        updatedAt,
        null,
      );

      expect(operacion.id).toBe('db-uuid-operacion');
      expect(operacion.esInterno).toBe(true);
      expect(operacion.createdAt).toEqual(createdAt);
      expect(operacion.updatedAt).toEqual(updatedAt);
      expect(operacion.deletedAt).toBeNull();
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('marca la operación como eliminada lógicamente (auditoría)', () => {
      const operacion = OperacionTicketEntity.create(baseProps());
      operacion.softDelete();
      expect(operacion.isDeleted()).toBe(true);
    });
  });
});
