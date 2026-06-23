/**
 * 6.A.1 TEST — Unit tests de TicketSoporteEntity (RED → GREEN con 6.A.2)
 *
 * Cubre:
 * - Satélite 1:1 con tickets para el flujo SOPORTE/IT
 * - equipo_id NULLABLE: null es válido (ticket sin equipo asociado, ej. problema de red)
 * - equipo_id puede ser un UUID válido cuando el problema afecta un equipo específico
 * - reconstitute(): preserva todos los campos
 */
import { TicketSoporteEntity, TicketSoporteProps } from './ticket-soporte.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeProps = (overrides: Partial<TicketSoporteProps> = {}): TicketSoporteProps => ({
  ticketId: 'ticket-base-uuid',
  equipoId: null,
  descripcionProblema: null,
  solucionAplicada: null,
  ...overrides,
});

describe('TicketSoporteEntity', () => {
  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid', null);
      expect(ts.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'd4d4d4d4-0000-7000-d000-000000000004';
      const ts = TicketSoporteEntity.create('ticket-uuid', null, id);
      expect(ts.id).toBe(id);
    });

    it('equipo_id puede ser null (ticket sin equipo asociado — ej. problema de red)', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid', null);
      expect(ts.equipoId).toBeNull();
    });

    it('equipo_id puede ser un UUID (problema que afecta un equipo específico)', () => {
      const equipoId = 'equipo-afectado-uuid';
      const ts = TicketSoporteEntity.create('ticket-uuid', equipoId);
      expect(ts.equipoId).toBe(equipoId);
    });

    it('ticketId se almacena correctamente', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid-especifico', null);
      expect(ts.ticketId).toBe('ticket-uuid-especifico');
    });

    it('descripcionProblema y solucionAplicada son null por defecto', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid', null);
      expect(ts.descripcionProblema).toBeNull();
      expect(ts.solucionAplicada).toBeNull();
    });

    it('deletedAt es null al crear', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid', null);
      expect(ts.deletedAt).toBeNull();
      expect(ts.isDeleted()).toBe(false);
    });

    it('genera IDs distintos para instancias creadas consecutivamente', () => {
      const a = TicketSoporteEntity.create('ticket-a', null);
      const b = TicketSoporteEntity.create('ticket-b', null);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('registrarSolucion()', () => {
    it('actualiza solucionAplicada', () => {
      const ts = TicketSoporteEntity.create('ticket-uuid', 'equipo-uuid');
      ts.registrarSolucion('Se reemplazó el módulo RAM defectuoso.');
      expect(ts.solucionAplicada).toBe('Se reemplazó el módulo RAM defectuoso.');
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');

      const ts = TicketSoporteEntity.reconstitute(
        {
          ticketId: 'ticket-id-persisted',
          equipoId: 'equipo-afectado-uuid',
          descripcionProblema: 'La PC no enciende desde esta mañana.',
          solucionAplicada: 'Se cambió la fuente de alimentación.',
        },
        'ticket-soporte-id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(ts.ticketId).toBe('ticket-id-persisted');
      expect(ts.equipoId).toBe('equipo-afectado-uuid');
      expect(ts.descripcionProblema).toBe('La PC no enciende desde esta mañana.');
      expect(ts.solucionAplicada).toBe('Se cambió la fuente de alimentación.');
      expect(ts.createdAt).toBe(createdAt);
      expect(ts.updatedAt).toBe(updatedAt);
      expect(ts.deletedAt).toBeNull();
      expect(ts.isDeleted()).toBe(false);
    });

    it('reconstitute con equipo_id null preserva el valor null', () => {
      const ts = TicketSoporteEntity.reconstitute(
        makeProps({ equipoId: null }),
        'ts-sin-equipo-id',
        new Date(),
        new Date(),
        null,
      );
      expect(ts.equipoId).toBeNull();
    });

    it('reconstitute con deletedAt seteado → isDeleted() = true', () => {
      const deletedAt = new Date('2026-06-01T00:00:00.000Z');
      const ts = TicketSoporteEntity.reconstitute(
        makeProps(),
        'ts-deleted-id',
        new Date('2026-01-01'),
        new Date('2026-06-01'),
        deletedAt,
      );
      expect(ts.deletedAt?.getTime()).toBe(deletedAt.getTime());
      expect(ts.isDeleted()).toBe(true);
    });
  });
});
