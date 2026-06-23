/**
 * 3.A.1 TEST — Unit tests de TicketEntity (RED → GREEN con 3.A.2)
 *
 * Cubre:
 * - Herencia de BaseEntity: id UUIDv7, timestamps, deletedAt=null
 * - Modelo normalizado: Ticket guarda solo estadoId (UUID), NO estadoCodigo
 * - Estado inicial ABIERTO al crear (el use case provee el estadoId de ABIERTO)
 * - assignTo(): setea asignadoId
 * - canTransitionTo(desde, hacia): rechaza estados terminales y tickets soft-deleted
 */
import { TicketEntity, TicketProps } from './ticket.entity';

const makeTicketProps = (overrides: Partial<TicketProps> = {}): TicketProps => ({
  numero: 'SOP-2026-00001',
  titulo: 'Falla en impresora',
  descripcion: null as string | null,
  tipoId: 'tipo-uuid-soporte',
  estadoId: 'estado-abierto-uuid',
  prioridadId: 'prioridad-media-uuid',
  cicloId: null as string | null,
  solicitanteId: 'usuario-solicitante-uuid',
  asignadoId: null as string | null,
  fechaVencimiento: null as Date | null,
  ...overrides,
});

describe('TicketEntity', () => {
  describe('Construcción (BaseEntity heredado)', () => {
    it('genera un id UUIDv7 cuando no se provee', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000001';
      const ticket = TicketEntity.create(makeTicketProps(), id);
      expect(ticket.id).toBe(id);
    });

    it('deletedAt es null al crear', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.deletedAt).toBeNull();
      expect(ticket.isDeleted()).toBe(false);
    });

    it('genera IDs distintos para instancias creadas consecutivamente', () => {
      const a = TicketEntity.create(makeTicketProps());
      const b = TicketEntity.create(makeTicketProps());
      expect(a.id).not.toBe(b.id);
    });

    it('expone las propiedades esperadas (sin estadoCodigo — modelo normalizado)', () => {
      const props = makeTicketProps();
      const ticket = TicketEntity.create(props);
      expect(ticket.numero).toBe(props.numero);
      expect(ticket.titulo).toBe(props.titulo);
      expect(ticket.descripcion).toBeNull();
      expect(ticket.tipoId).toBe(props.tipoId);
      expect(ticket.estadoId).toBe('estado-abierto-uuid');
      expect(ticket.prioridadId).toBe(props.prioridadId);
      expect(ticket.cicloId).toBeNull();
      expect(ticket.solicitanteId).toBe(props.solicitanteId);
      expect(ticket.asignadoId).toBeNull();
      expect(ticket.fechaVencimiento).toBeNull();
      // estadoCodigo NO existe en la entidad: el Ticket solo guarda el UUID del estado
      expect((ticket as any).estadoCodigo).toBeUndefined();
    });
  });

  describe('Estado inicial ABIERTO', () => {
    it('el estadoId al crear corresponde al UUID del estado ABIERTO (provisto por el use case)', () => {
      // El use case carga el Estado ABIERTO de IEstadoRepository y pasa su UUID.
      // La entidad NO conoce ni almacena el código semántico — solo el UUID.
      const ticket = TicketEntity.create(makeTicketProps({ estadoId: 'estado-abierto-uuid' }));
      expect(ticket.estadoId).toBe('estado-abierto-uuid');
    });

    it('reconstitute preserva el estadoId dado por el mapper', () => {
      const ticket = TicketEntity.reconstitute(
        makeTicketProps({ estadoId: 'estado-en-progreso-uuid' }),
        '01966a6a-0000-7000-8000-000000000002',
        new Date('2026-01-01'),
        new Date('2026-01-02'),
        null,
      );
      expect(ticket.estadoId).toBe('estado-en-progreso-uuid');
    });
  });

  describe('assignTo()', () => {
    it('setea asignadoId al usuario dado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.asignadoId).toBeNull();
      ticket.assignTo('usuario-asignado-uuid');
      expect(ticket.asignadoId).toBe('usuario-asignado-uuid');
    });

    it('permite reasignación (sobrescribe asignadoId anterior)', () => {
      const ticket = TicketEntity.create(makeTicketProps({ asignadoId: 'usuario-anterior-uuid' }));
      ticket.assignTo('usuario-nuevo-uuid');
      expect(ticket.asignadoId).toBe('usuario-nuevo-uuid');
    });

    it('permite desasignar seteando null', () => {
      const ticket = TicketEntity.create(makeTicketProps({ asignadoId: 'usuario-uuid' }));
      ticket.assignTo(null);
      expect(ticket.asignadoId).toBeNull();
    });
  });

  describe('canTransitionTo(desdeEstadoCodigo, haciaEstadoCodigo)', () => {
    // El use case carga los codigos desde IEstadoRepository y los pasa a la entidad.
    // La entidad solo verifica invariantes: soft-delete + terminal states.

    it('retorna true cuando el estado actual no es terminal', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('ABIERTO', 'EN_PROGRESO')).toBe(true);
    });

    it('retorna true para cualquier origen no-terminal independiente del destino', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('EN_PROGRESO', 'RESUELTO')).toBe(true);
      expect(ticket.canTransitionTo('RESUELTO', 'EN_PROGRESO')).toBe(true);
    });

    it('retorna false cuando el estado actual es CERRADO (terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('CERRADO', 'EN_PROGRESO')).toBe(false);
    });

    it('retorna false cuando el estado actual es CANCELADO (terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('CANCELADO', 'ABIERTO')).toBe(false);
    });

    it('retorna false cuando el ticket está soft-deleted, independiente del estado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canTransitionTo('ABIERTO', 'EN_PROGRESO')).toBe(false);
      expect(ticket.canTransitionTo('EN_PROGRESO', 'RESUELTO')).toBe(false);
    });
  });

  describe('updateEstado()', () => {
    it('actualiza el estadoId del ticket', () => {
      const ticket = TicketEntity.create(makeTicketProps({ estadoId: 'estado-abierto-uuid' }));
      ticket.updateEstado('estado-en-progreso-uuid');
      expect(ticket.estadoId).toBe('estado-en-progreso-uuid');
    });
  });

  describe('reconstitute()', () => {
    it('preserva los timestamps de la DB', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      const ticket = TicketEntity.reconstitute(
        makeTicketProps(),
        '01966a6a-0000-7000-8000-000000000003',
        createdAt,
        updatedAt,
        null,
      );
      expect(ticket.createdAt.getTime()).toBe(createdAt.getTime());
      expect(ticket.updatedAt.getTime()).toBe(updatedAt.getTime());
      expect(ticket.deletedAt).toBeNull();
    });

    it('hidrata deletedAt cuando la entidad estaba soft-deleted', () => {
      const deletedAt = new Date('2026-06-01T00:00:00.000Z');
      const ticket = TicketEntity.reconstitute(
        makeTicketProps(),
        '01966a6a-0000-7000-8000-000000000004',
        new Date('2026-01-01'),
        new Date('2026-06-01'),
        deletedAt,
      );
      expect(ticket.deletedAt?.getTime()).toBe(deletedAt.getTime());
      expect(ticket.isDeleted()).toBe(true);
    });
  });
});
