/**
 * T3.3/T3.4 [UNIT] — RED→GREEN: TicketEntity (entidad central).
 *
 * `create()`: UUIDv7, numero, solicitante, ticketReferenciaId opcional;
 * `asignadoId` SIEMPRE null (T4 — nunca se acepta al crear, whitelist de
 * tipos en `CrearTicketProps` que excluye `asignadoId`).
 * Mutadores: `updateEstado`, `assignTo`, `setFechaCierre`,
 * `canTransitionTo` (invariantes de entidad: soft-deleted o estado actual
 * terminal — CERRADO/CANCELADO, ADR-3), `softDelete` (heredado de
 * BaseEntity, verificado acá para el caso concreto de TicketEntity).
 *
 * Ref spec: sdd/tickets-core/spec T4, T9, T11, T12. Ref design: ADR-3.
 * Tarea: T3.3, T3.4.
 */
import { TicketEntity, CrearTicketProps } from './ticket.entity';

function baseCrearProps(): CrearTicketProps {
  return {
    numero: 'SOP-2026-00001',
    titulo: 'No enciende la PC',
    descripcion: 'La PC del escritorio 4 no enciende.',
    tipoId: 'tipo-soporte-uuid',
    estadoId: 'estado-nuevo-uuid',
    prioridadId: 'prioridad-media-uuid',
    cicloId: 'ciclo-uuid',
    ticketReferenciaId: null,
    solicitanteId: 'solicitante-uuid',
  };
}

describe('TicketEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const ticket = TicketEntity.create(baseCrearProps());

      expect(ticket.numero).toBe('SOP-2026-00001');
      expect(ticket.titulo).toBe('No enciende la PC');
      expect(ticket.tipoId).toBe('tipo-soporte-uuid');
      expect(ticket.estadoId).toBe('estado-nuevo-uuid');
      expect(ticket.prioridadId).toBe('prioridad-media-uuid');
      expect(ticket.cicloId).toBe('ciclo-uuid');
      expect(ticket.solicitanteId).toBe('solicitante-uuid');
      expect(ticket.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(ticket.isDeleted()).toBe(false);
    });

    it('siempre setea asignadoId=null al crear, sin importar el input', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.asignadoId).toBeNull();
    });

    it('setea slaVenceAt=null y vencido=false al crear (SLA es Fase 4)', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.slaVenceAt).toBeNull();
      expect(ticket.vencido).toBe(false);
    });

    it('setea fechaCierre=null al crear', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.fechaCierre).toBeNull();
    });

    it('acepta ticketReferenciaId opcional ("continúa de #X")', () => {
      const ticket = TicketEntity.create({
        ...baseCrearProps(),
        ticketReferenciaId: 'ticket-cerrado-uuid',
      });
      expect(ticket.ticketReferenciaId).toBe('ticket-cerrado-uuid');
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const ticket = TicketEntity.create(baseCrearProps(), 'explicit-id-001');
      expect(ticket.id).toBe('explicit-id-001');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id, timestamps y asignadoId', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const ticket = TicketEntity.reconstitute(
        {
          ...baseCrearProps(),
          asignadoId: 'tecnico-uuid',
          slaVenceAt: null,
          vencido: false,
          fechaCierre: null,
        },
        'db-uuid-ticket',
        createdAt,
        updatedAt,
        null,
      );

      expect(ticket.id).toBe('db-uuid-ticket');
      expect(ticket.asignadoId).toBe('tecnico-uuid');
      expect(ticket.createdAt).toEqual(createdAt);
      expect(ticket.updatedAt).toEqual(updatedAt);
      expect(ticket.deletedAt).toBeNull();
    });

    /**
     * sdd/sla-habil WU-3: `slaRegla` NO es parte de `TicketProps` — ningún
     * caso de uso la elige; de dónde sale su valor, ver {@link SlaRegla}.
     * Por eso viaja como
     * parámetro propio de `reconstitute()`, con default `'HABIL'` para no
     * romper a los callers preexistentes de este método (tests/mappers que
     * todavía no versan sobre cohortes de SLA) que no lo pasan.
     */
    it('sin slaRegla explícito, reconstituye con el default HABIL', () => {
      const ticket = TicketEntity.reconstitute(
        {
          ...baseCrearProps(),
          asignadoId: null,
          slaVenceAt: null,
          vencido: false,
          fechaCierre: null,
        },
        'db-uuid-ticket',
        new Date(),
        new Date(),
        null,
      );
      expect(ticket.slaRegla).toBe('HABIL');
    });

    it('con slaRegla explícito CORRIDO, lo preserva', () => {
      const ticket = TicketEntity.reconstitute(
        {
          ...baseCrearProps(),
          asignadoId: null,
          slaVenceAt: null,
          vencido: false,
          fechaCierre: null,
        },
        'db-uuid-ticket',
        new Date(),
        new Date(),
        null,
        'CORRIDO',
      );
      expect(ticket.slaRegla).toBe('CORRIDO');
    });

    /**
     * Hermano invertido de la precondición de largo: `create()` rechaza un
     * título largo, `reconstitute()` lo acepta. La exención está documentada
     * en la entidad, pero sin este test es solo un comentario — mover el guard
     * al constructor mañana, que parece un refactor razonable, haría explotar
     * toda lectura de una fila histórica con la suite en verde.
     */
    it('NO valida el largo: una fila histórica larga se lee sin explotar', () => {
      expect(() =>
        TicketEntity.reconstitute(
          {
            ...baseCrearProps(),
            titulo: 'A'.repeat(300),
            asignadoId: null,
            slaVenceAt: null,
            vencido: false,
            fechaCierre: null,
          },
          'db-uuid-legacy',
          new Date(),
          new Date(),
          null,
        ),
      ).not.toThrow();
    });
  });

  describe('assignTo()', () => {
    it('asigna un responsable', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      ticket.assignTo('tecnico-uuid');
      expect(ticket.asignadoId).toBe('tecnico-uuid');
    });

    it('desasigna pasando null', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      ticket.assignTo('tecnico-uuid');
      ticket.assignTo(null);
      expect(ticket.asignadoId).toBeNull();
    });
  });

  describe('updateEstado()', () => {
    it('actualiza el estadoId', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      ticket.updateEstado('estado-asignado-uuid');
      expect(ticket.estadoId).toBe('estado-asignado-uuid');
    });
  });

  describe('setFechaCierre()', () => {
    it('setea la fecha de cierre y actualiza updatedAt', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      const before = ticket.updatedAt;
      const cierre = new Date('2026-03-01T00:00:00Z');

      ticket.setFechaCierre(cierre);

      expect(ticket.fechaCierre).toEqual(cierre);
      expect(ticket.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('permite limpiar la fecha de cierre con null', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      ticket.setFechaCierre(new Date());
      ticket.setFechaCierre(null);
      expect(ticket.fechaCierre).toBeNull();
    });
  });

  describe('canTransitionTo()', () => {
    it('permite transicionar desde un estado no terminal', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.canTransitionTo('NUEVO', 'ASIGNADO')).toBe(true);
      expect(ticket.canTransitionTo('EN_PROCESO', 'RESUELTO')).toBe(true);
      expect(ticket.canTransitionTo('RESUELTO', 'CERRADO')).toBe(true);
    });

    it('rechaza transicionar desde CERRADO (terminal, sin arcos de salida)', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.canTransitionTo('CERRADO', 'NUEVO')).toBe(false);
    });

    it('rechaza transicionar desde CANCELADO (terminal, sin arcos de salida)', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.canTransitionTo('CANCELADO', 'NUEVO')).toBe(false);
    });

    it('rechaza transicionar un ticket soft-deleted, sin importar el estado', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      ticket.softDelete();
      expect(ticket.canTransitionTo('NUEVO', 'ASIGNADO')).toBe(false);
    });
  });

  /**
   * `Ticket.titulo` es `VarChar(255)` (`prisma_tenant/schema.prisma`) — sin
   * este guard un titulo más largo atraviesa la entidad intacto y lo frena
   * recién Postgres, con un `PrismaClientKnownRequestError` sin mapear (fix
   * defecto "límite de largo de titulo", análogo a `sectores`/`preventivo`).
   */
  describe('create() — exactamente un solicitante (interno o externo)', () => {
    it('acepta solo solicitanteId (ticket interno): solicitanteExternoId queda null', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.solicitanteId).toBe('solicitante-uuid');
      expect(ticket.solicitanteExternoId).toBeNull();
    });

    it('acepta solo solicitanteExternoId (ticket del formulario publico)', () => {
      const ticket = TicketEntity.create({
        ...baseCrearProps(),
        solicitanteId: null,
        solicitanteExternoId: 'externo-uuid',
      });
      expect(ticket.solicitanteId).toBeNull();
      expect(ticket.solicitanteExternoId).toBe('externo-uuid');
    });

    it('rechaza ambos', () => {
      expect(() =>
        TicketEntity.create({ ...baseCrearProps(), solicitanteExternoId: 'externo-uuid' }),
      ).toThrow(/exactamente uno/);
    });

    it('rechaza ninguno', () => {
      expect(() => TicketEntity.create({ ...baseCrearProps(), solicitanteId: null })).toThrow(
        /exactamente uno/,
      );
    });
  });

  describe('create() — tope de largo de titulo', () => {
    it('rechaza titulo de más de 255 caracteres', () => {
      expect(() => TicketEntity.create({ ...baseCrearProps(), titulo: 'A'.repeat(256) })).toThrow();
    });

    it('acepta titulo de exactamente 255 caracteres (límite inclusive)', () => {
      expect(() =>
        TicketEntity.create({ ...baseCrearProps(), titulo: 'A'.repeat(255) }),
      ).not.toThrow();
    });
  });

  describe('actualizarDatos()', () => {
    it('actualiza titulo, descripcion y prioridadId cuando vienen definidos', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      const before = ticket.updatedAt;

      ticket.actualizarDatos({
        titulo: 'Nuevo titulo',
        descripcion: 'Nueva descripcion',
        prioridadId: 'prioridad-alta-uuid',
      });

      expect(ticket.titulo).toBe('Nuevo titulo');
      expect(ticket.descripcion).toBe('Nueva descripcion');
      expect(ticket.prioridadId).toBe('prioridad-alta-uuid');
      expect(ticket.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('no toca los campos omitidos (undefined)', () => {
      const ticket = TicketEntity.create(baseCrearProps());

      ticket.actualizarDatos({ titulo: 'Solo titulo' });

      expect(ticket.titulo).toBe('Solo titulo');
      expect(ticket.descripcion).toBe(baseCrearProps().descripcion);
      expect(ticket.prioridadId).toBe(baseCrearProps().prioridadId);
    });

    it('permite limpiar descripcion pasando null explícito', () => {
      const ticket = TicketEntity.create(baseCrearProps());

      ticket.actualizarDatos({ descripcion: null });

      expect(ticket.descripcion).toBeNull();
    });

    it('NUNCA muta el estadoId (el estado es transición, T9)', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      const estadoOriginal = ticket.estadoId;

      ticket.actualizarDatos({ titulo: 'Otro titulo' });

      expect(ticket.estadoId).toBe(estadoOriginal);
    });

    it('rechaza titulo de más de 255 caracteres', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(() => ticket.actualizarDatos({ titulo: 'A'.repeat(256) })).toThrow();
    });

    it('acepta titulo de exactamente 255 caracteres (límite inclusive)', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(() => ticket.actualizarDatos({ titulo: 'A'.repeat(255) })).not.toThrow();
    });
  });

  /**
   * sdd/sla-habil WU-3: una entidad recién `create()`-ada todavía no fue
   * persistida — ningún caso de uso elige `slaRegla` (ver {@link SlaRegla}),
   * así que el valor es indeterminado hasta el `reconstitute()` posterior a
   * la escritura. Acceder al getter antes de eso es un bug del
   * caller (leer un dato que todavía no existe), no un `null` de negocio.
   */
  describe('slaRegla — cohorte de cálculo de SLA (sdd/sla-habil WU-3)', () => {
    it('create() no decide slaRegla: leerlo antes de persistir lanza', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(() => ticket.slaRegla).toThrow();
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('marca el ticket como eliminado lógicamente', () => {
      const ticket = TicketEntity.create(baseCrearProps());
      expect(ticket.isDeleted()).toBe(false);

      ticket.softDelete();

      expect(ticket.isDeleted()).toBe(true);
      expect(ticket.deletedAt).not.toBeNull();
    });
  });
});
