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
import { TicketEntity, TicketProps, ActualizarDatosTicket } from './ticket.entity';
import { TituloInvalidoError } from '../errors/tickets.errors';

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
  fechaResolucion: null as Date | null,
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
      expect(ticket.fechaResolucion).toBeNull(); // renombrado desde fechaVencimiento en PR2
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
    // La entidad solo verifica invariantes: soft-delete + TERMINAL_STATES expandido.
    // TERMINAL_STATES ahora cubre 6 estados: RESUELTO, SIN_SOLUCION, RECHAZADO (activos)
    // + CERRADO, CANCELADO, PENDIENTE_APROBACION (congelados legacy). ADR-3.

    it('retorna true cuando el estado actual es ABIERTO (no terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('ABIERTO', 'APROBADO')).toBe(true);
    });

    it('retorna true para APROBADO como origen (no terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('APROBADO', 'EN_PROGRESO')).toBe(true);
    });

    it('retorna true para EN_PROGRESO como origen (no terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('EN_PROGRESO', 'RESUELTO')).toBe(true);
    });

    it('retorna true para SUSPENDIDO como origen (no terminal)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('SUSPENDIDO', 'EN_PROGRESO')).toBe(true);
    });

    it('retorna false cuando el estado actual es RESUELTO (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('RESUELTO', 'EN_PROGRESO')).toBe(false);
    });

    it('retorna false cuando el estado actual es SIN_SOLUCION (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('SIN_SOLUCION', 'ABIERTO')).toBe(false);
    });

    it('retorna false cuando el estado actual es RECHAZADO (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('RECHAZADO', 'ABIERTO')).toBe(false);
    });

    it('retorna false cuando el estado actual es CERRADO (congelado legacy)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('CERRADO', 'EN_PROGRESO')).toBe(false);
    });

    it('retorna false cuando el estado actual es CANCELADO (congelado legacy)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('CANCELADO', 'ABIERTO')).toBe(false);
    });

    it('retorna false cuando el estado actual es PENDIENTE_APROBACION (congelado legacy — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canTransitionTo('PENDIENTE_APROBACION', 'APROBADO')).toBe(false);
    });

    it('retorna false cuando el ticket está soft-deleted, independiente del estado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canTransitionTo('ABIERTO', 'APROBADO')).toBe(false);
      expect(ticket.canTransitionTo('EN_PROGRESO', 'RESUELTO')).toBe(false);
    });
  });

  describe('canEdit(estadoActualCodigo)', () => {
    // ADR-3: canEdit es whitelist ABIERTO-only.
    // Solo tickets en estado ABIERTO y no soft-deleted pueden ser editados.
    // Antes: no-terminal era suficiente. Ahora: SOLO ABIERTO.
    // Ref spec: Enmienda "Bloqueo edición/borrado" (tickets-core/spec.md), ADR-3
    // Change: tickets-maquina-estados-observaciones / PR1

    it('retorna true cuando el ticket está ABIERTO y no está eliminado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('ABIERTO')).toBe(true);
    });

    it('retorna false cuando el ticket está EN_PROGRESO (whitelist ABIERTO-only — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('EN_PROGRESO')).toBe(false);
    });

    it('retorna false cuando el ticket está APROBADO (whitelist ABIERTO-only — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('APROBADO')).toBe(false);
    });

    it('retorna false cuando el ticket está SUSPENDIDO (whitelist ABIERTO-only — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('SUSPENDIDO')).toBe(false);
    });

    it('retorna false cuando el ticket está RESUELTO (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('RESUELTO')).toBe(false);
    });

    it('retorna false cuando el ticket está SIN_SOLUCION (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('SIN_SOLUCION')).toBe(false);
    });

    it('retorna false cuando el ticket está RECHAZADO (terminal activo — ADR-3)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('RECHAZADO')).toBe(false);
    });

    it('retorna false cuando el ticket está en estado CERRADO (congelado legacy)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('CERRADO')).toBe(false);
    });

    it('retorna false cuando el ticket está en estado CANCELADO (congelado legacy)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canEdit('CANCELADO')).toBe(false);
    });

    it('retorna false cuando el ticket está soft-deleted, aunque estado sea ABIERTO', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canEdit('ABIERTO')).toBe(false);
    });

    it('soft-deleted tiene precedencia — retorna false para cualquier estado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canEdit('ABIERTO')).toBe(false);
      expect(ticket.canEdit('EN_PROGRESO')).toBe(false);
    });
  });

  describe('canDelete(estadoActualCodigo)', () => {
    // ADR-3: canDelete comparte la misma lógica que canEdit — whitelist ABIERTO-only.
    // Solo tickets en estado ABIERTO y no soft-deleted pueden eliminarse.
    // Ref spec: Req "Bloqueo de borrado por estado" (tickets-core/spec.md), ADR-3
    // Change: tickets-maquina-estados-observaciones / PR1

    it('retorna true cuando el ticket está ABIERTO y no está eliminado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('ABIERTO')).toBe(true);
    });

    it('retorna false cuando el ticket está APROBADO (solo ABIERTO puede eliminarse)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('APROBADO')).toBe(false);
    });

    it('retorna false cuando el ticket está EN_PROGRESO', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('EN_PROGRESO')).toBe(false);
    });

    it('retorna false cuando el ticket está SUSPENDIDO', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('SUSPENDIDO')).toBe(false);
    });

    it('retorna false cuando el ticket está RESUELTO (terminal activo)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('RESUELTO')).toBe(false);
    });

    it('retorna false cuando el ticket está SIN_SOLUCION (terminal activo)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('SIN_SOLUCION')).toBe(false);
    });

    it('retorna false cuando el ticket está RECHAZADO (terminal activo)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('RECHAZADO')).toBe(false);
    });

    it('retorna false cuando el ticket está CERRADO (congelado legacy)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(ticket.canDelete('CERRADO')).toBe(false);
    });

    it('retorna false cuando el ticket ya está soft-deleted (isDeleted = true)', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canDelete('ABIERTO')).toBe(false);
    });

    it('soft-deleted tiene precedencia sobre cualquier estado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      ticket.softDelete();
      expect(ticket.canDelete('ABIERTO')).toBe(false);
      expect(ticket.canDelete('EN_PROGRESO')).toBe(false);
    });
  });

  describe('updateDatos(datos)', () => {
    // Ref spec: tickets-core §"Edición exitosa de campos de datos"
    // Ref spec: tickets-core §"Campo prohibido incluido en body es ignorado"

    it('no modifica ninguna prop cuando el objeto está vacío', () => {
      const ticket = TicketEntity.create(
        makeTicketProps({ titulo: 'Original', descripcion: 'desc' }),
      );
      ticket.updateDatos({});
      expect(ticket.titulo).toBe('Original');
      expect(ticket.descripcion).toBe('desc');
    });

    it('actualiza el título cuando viene definido con valor no-vacío', () => {
      const ticket = TicketEntity.create(
        makeTicketProps({ titulo: 'Original', descripcion: 'desc' }),
      );
      ticket.updateDatos({ titulo: 'Nuevo título' });
      expect(ticket.titulo).toBe('Nuevo título');
      expect(ticket.descripcion).toBe('desc'); // no tocado
    });

    it('lanza TituloInvalidoError cuando el título viene solo con espacios', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(() => ticket.updateDatos({ titulo: '   ' })).toThrow(TituloInvalidoError);
    });

    it('lanza TituloInvalidoError cuando el título es una cadena vacía', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      expect(() => ticket.updateDatos({ titulo: '' })).toThrow(TituloInvalidoError);
    });

    it('setea descripcion a null cuando viene null (limpiar nullable)', () => {
      const ticket = TicketEntity.create(makeTicketProps({ descripcion: 'Texto original' }));
      ticket.updateDatos({ descripcion: null });
      expect(ticket.descripcion).toBeNull();
    });

    it('actualiza descripcion cuando viene como string', () => {
      const ticket = TicketEntity.create(makeTicketProps({ descripcion: null }));
      ticket.updateDatos({ descripcion: 'Texto nuevo' });
      expect(ticket.descripcion).toBe('Texto nuevo');
    });

    it('setea cicloId a null cuando viene null (limpiar nullable)', () => {
      const ticket = TicketEntity.create(makeTicketProps({ cicloId: 'ciclo-uuid-001' }));
      ticket.updateDatos({ cicloId: null });
      expect(ticket.cicloId).toBeNull();
    });

    it('actualiza prioridadId cuando viene definido', () => {
      const ticket = TicketEntity.create(makeTicketProps({ prioridadId: 'prio-uuid-001' }));
      ticket.updateDatos({ prioridadId: 'prio-uuid-002' });
      expect(ticket.prioridadId).toBe('prio-uuid-002');
    });

    it('updatedAt avanza después de updateDatos (no igual al valor inicial)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const updatedAtAntes = ticket.updatedAt.getTime();
      // Esperamos 10ms para asegurar diferencia de timestamp incluso bajo carga
      await new Promise((r) => setTimeout(r, 10));
      ticket.updateDatos({ titulo: 'Nuevo' });
      expect(ticket.updatedAt.getTime()).toBeGreaterThan(updatedAtAntes);
    });

    it('undefined no modifica la prop — descripcion sin cambios cuando viene undefined', () => {
      const ticket = TicketEntity.create(makeTicketProps({ descripcion: 'Valor original' }));
      const datos: ActualizarDatosTicket = { descripcion: undefined };
      ticket.updateDatos(datos);
      expect(ticket.descripcion).toBe('Valor original');
    });
  });

  describe('updateEstado()', () => {
    it('actualiza el estadoId del ticket', () => {
      const ticket = TicketEntity.create(makeTicketProps({ estadoId: 'estado-abierto-uuid' }));
      ticket.updateEstado('estado-en-progreso-uuid');
      expect(ticket.estadoId).toBe('estado-en-progreso-uuid');
    });
  });

  describe('setFechaResolucion(fecha)', () => {
    // T3.1 — RED: estos tests fallan hasta que se implemente setFechaResolucion (T3.2)

    it('setea fechaResolucion al Date dado', () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const fecha = new Date('2026-06-28');
      ticket.setFechaResolucion(fecha);
      expect(ticket.fechaResolucion).toBe(fecha);
    });

    it('setea fechaResolucion a null (limpiar)', () => {
      const ticket = TicketEntity.create(
        makeTicketProps({ fechaResolucion: new Date('2026-06-01') }),
      );
      ticket.setFechaResolucion(null);
      expect(ticket.fechaResolucion).toBeNull();
    });

    it('avanza updatedAt después de setFechaResolucion', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const updatedAtAntes = ticket.updatedAt.getTime();
      await new Promise((r) => setTimeout(r, 10));
      ticket.setFechaResolucion(new Date('2026-06-28'));
      expect(ticket.updatedAt.getTime()).toBeGreaterThan(updatedAtAntes);
    });
  });

  describe('create(props, id?, fechaCreacion?) — override de createdAt', () => {
    // T3.1 — RED: estos tests fallan hasta que se implemente el tercer parámetro (T3.2)

    it('create con fechaCreacion explícita → createdAt refleja esa fecha', () => {
      const fechaCreacion = new Date('2025-06-15');
      const ticket = TicketEntity.create(makeTicketProps(), undefined, fechaCreacion);
      expect(ticket.createdAt.toISOString().slice(0, 10)).toBe('2025-06-15');
    });

    it('create sin fechaCreacion → createdAt ≈ now() (margen 5s)', () => {
      const antes = new Date();
      const ticket = TicketEntity.create(makeTicketProps());
      const despues = new Date(antes.getTime() + 5000);
      expect(ticket.createdAt.getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(ticket.createdAt.getTime()).toBeLessThanOrEqual(despues.getTime());
    });

    it('create con fecha futura (2030-12-31) se acepta sin error', () => {
      const fechaFutura = new Date('2030-12-31');
      expect(() => TicketEntity.create(makeTicketProps(), undefined, fechaFutura)).not.toThrow();
      const ticket = TicketEntity.create(makeTicketProps(), undefined, fechaFutura);
      expect(ticket.createdAt.toISOString().slice(0, 10)).toBe('2030-12-31');
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
