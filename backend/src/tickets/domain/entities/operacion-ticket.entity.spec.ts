/**
 * 3.A.1 TEST — Unit tests de OperacionTicketEntity (RED → GREEN con 3.A.2)
 *
 * Cubre:
 * - Herencia de BaseEntity: id UUIDv7, timestamps, deletedAt=null
 * - Inmutabilidad del registro del timeline
 * - No expone métodos de mutación (no hay setters de negocio)
 * - Todas las propiedades accesibles vía getters
 */
import { OperacionTicketEntity, OperacionTicketProps } from './operacion-ticket.entity';

const makeOperacionProps = (
  overrides: Partial<OperacionTicketProps> = {},
): OperacionTicketProps => ({
  ticketId: 'ticket-uuid-1',
  tipoOperacionId: 'tipo-op-uuid-cambio-estado',
  tipoOperacionCodigo: 'CAMBIO_ESTADO',
  descripcion: null as string | null,
  estadoAnteriorId: null as string | null,
  estadoNuevoId: 'estado-abierto-uuid',
  autorId: 'usuario-autor-uuid',
  metadata: null as Record<string, unknown> | null,
  ...overrides,
});

describe('OperacionTicketEntity', () => {
  describe('Construcción (BaseEntity heredado)', () => {
    it('genera un id UUIDv7 al crear', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps());
      expect(op.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('deletedAt es null al crear', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps());
      expect(op.deletedAt).toBeNull();
      expect(op.isDeleted()).toBe(false);
    });

    it('genera IDs distintos para dos instancias', () => {
      const a = OperacionTicketEntity.create(makeOperacionProps());
      const b = OperacionTicketEntity.create(makeOperacionProps());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('Getters de propiedades', () => {
    it('expone ticketId, tipoOperacionId, tipoOperacionCodigo', () => {
      const props = makeOperacionProps();
      const op = OperacionTicketEntity.create(props);
      expect(op.ticketId).toBe(props.ticketId);
      expect(op.tipoOperacionId).toBe(props.tipoOperacionId);
      expect(op.tipoOperacionCodigo).toBe(props.tipoOperacionCodigo);
    });

    it('expone estadoAnteriorId (nullable) y estadoNuevoId (nullable)', () => {
      const op = OperacionTicketEntity.create(
        makeOperacionProps({
          estadoAnteriorId: 'estado-anterior-uuid',
          estadoNuevoId: 'estado-nuevo-uuid',
        }),
      );
      expect(op.estadoAnteriorId).toBe('estado-anterior-uuid');
      expect(op.estadoNuevoId).toBe('estado-nuevo-uuid');
    });

    it('expone estadoAnteriorId como null para la primera operacion (creación)', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps({ estadoAnteriorId: null }));
      expect(op.estadoAnteriorId).toBeNull();
    });

    it('expone autorId', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps());
      expect(op.autorId).toBe('usuario-autor-uuid');
    });

    it('expone descripcion (nullable)', () => {
      const op = OperacionTicketEntity.create(
        makeOperacionProps({ descripcion: 'Ticket creado por solicitud urgente' }),
      );
      expect(op.descripcion).toBe('Ticket creado por solicitud urgente');
    });

    it('expone metadata (nullable)', () => {
      const meta = { porcentaje_anterior: 0, porcentaje_nuevo: 75 };
      const op = OperacionTicketEntity.create(makeOperacionProps({ metadata: meta }));
      expect(op.metadata).toEqual(meta);
    });
  });

  describe('Inmutabilidad del registro', () => {
    it('no expone métodos de mutación de negocio', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps());
      // Un registro de timeline es inmutable: no debe tener setters de negocio
      expect(typeof (op as any).setDescripcion).toBe('undefined');
      expect(typeof (op as any).setEstadoNuevoId).toBe('undefined');
      expect(typeof (op as any).setMetadata).toBe('undefined');
      expect(typeof (op as any).setAutorId).toBe('undefined');
    });

    it('el softDelete es el único cambio de estado permitido (herencia BaseEntity)', () => {
      const op = OperacionTicketEntity.create(makeOperacionProps());
      // softDelete es heredado de BaseEntity (auditoría estándar)
      expect(typeof op.softDelete).toBe('function');
      op.softDelete();
      expect(op.isDeleted()).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los timestamps desde la DB', () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      const updatedAt = new Date('2026-01-01T10:00:00.000Z');
      const op = OperacionTicketEntity.reconstitute(
        makeOperacionProps(),
        '01966a6a-0000-7000-8000-000000000010',
        createdAt,
        updatedAt,
        null,
      );
      expect(op.createdAt.getTime()).toBe(createdAt.getTime());
      expect(op.deletedAt).toBeNull();
    });
  });
});
