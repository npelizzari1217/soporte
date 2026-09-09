/**
 * SA12 [UNIT] — RED→GREEN: AplicarSlaUseCase (S2/S3 — cálculo de
 * sla_vence_at al crear/repriorizar un ticket, consumido por los listeners
 * `ticket.creado`/`ticket.reprioritizado`).
 *
 * sdd/sla-habil WU-3: se suma el discriminador de cohortes —
 * `AplicarSlaUseCase` elige el calculador (`CalcularSlaVenceService` 24/7 vs
 * `CalcularSlaHabilVenceService` horas hábiles) según `ticket.slaRegla`, NO
 * según ningún estado global. El test más importante de esta sección es el
 * de `alReprioritizar()` sobre un ticket `CORRIDO`: es la fuga que WU-3
 * tapa (antes, repriorizar recalculaba SIEMPRE con la regla vigente en ese
 * momento, sin importar con qué regla nació el ticket).
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P2/ADR-P4. Tarea: SA12.
 */
import { AplicarSlaUseCase } from './aplicar-sla.use-case';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { TicketEntity, SlaRegla } from '../../../tickets/domain/entities/ticket.entity';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';

/**
 * Calendario lunes a viernes 09:00–18:00 (mismo molde que WU-1/WU-2), sin
 * feriados — suficiente para probar que el discriminador enruta al
 * calculador correcto, sin reexaminar la aritmética de horas hábiles (eso
 * ya lo cubre `calcular-sla-habil-vence.service.spec.ts`).
 */
const CALENDARIO_L_A_V_9_A_18: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null }, // domingo
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // lunes
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // martes
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // miércoles
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // jueves
  { aperturaMinuto: 540, cierreMinuto: 1080 }, // viernes
  { aperturaMinuto: null, cierreMinuto: null }, // sábado
];

/** Fixture de prioridad con SLA configurado (`slaHoras`/`slaActivo`, movidos de `sla_config`). */
function makePrioridadConSla(overrides: { slaHoras?: number | null; slaActivo?: boolean } = {}) {
  return PrioridadEntity.create({
    codigo: 'ALTA',
    nombre: 'Alta',
    color: null,
    orden: 30,
    activo: true,
    // `??` trataría `slaHoras: null` explícito como "ausente" — usar
    // `!== undefined` para distinguir "sin SLA aplicable" (null) de "no
    // especificado en el fixture" (undefined → default 8).
    slaHoras: overrides.slaHoras !== undefined ? overrides.slaHoras : 8,
    slaActivo: overrides.slaActivo ?? true,
  });
}

/**
 * Default `slaRegla: 'CORRIDO'`: los tests preexistentes a WU-3 ya afirman
 * vencimientos calculados con el reloj 24/7 (`CalcularSlaVenceService`) —
 * si este fixture defaulteara a `'HABIL'`, esos tests seguirían "pasando"
 * pero contra el calculador EQUIVOCADO en silencio, porque casi ningún
 * `createdAt` de esos fixtures cae fuera de una ventana hábil de forma que
 * lo delate. Los tests del discriminador que necesitan `HABIL` lo pasan
 * explícito.
 */
function makeTicket(
  overrides: {
    estadoId?: string;
    createdAt?: Date;
    tipoId?: string;
    slaRegla?: SlaRegla;
  } = {},
): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket',
      descripcion: null,
      tipoId: overrides.tipoId ?? 'tipo-uuid',
      estadoId: overrides.estadoId ?? 'estado-nuevo-uuid',
      prioridadId: 'prioridad-alta-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  // `_createdAt`/`_slaRegla` son privados: se pisan vía `Object.assign` para
  // simular una entidad ya persistida (mismo criterio que ya usaba este
  // fixture para `_createdAt` antes de WU-3) sin pasar por `reconstitute()`
  // completo, que exigiría repetir las 5 props restantes en cada llamada.
  if (overrides.createdAt) {
    Object.assign(ticket, { _createdAt: overrides.createdAt });
  }
  Object.assign(ticket, { _slaRegla: overrides.slaRegla ?? 'CORRIDO' });
  return ticket;
}

/**
 * `tipoTicketRepo.findIdByCodigo` resuelve el id del tipo `PREVENTIVO`
 * (issue #135, corte de SLA) — por defecto un id fijo distinto de
 * `'tipo-uuid'` (el tipo default de `makeTicket`), así que los tests que no
 * versan sobre el corte no necesitan mockear esto a mano.
 *
 * `calendarioRepo`/`feriadosRepo` resuelven por defecto al molde L-V 9-18
 * sin feriados: los tests que no versan sobre la aritmética hábil (ya
 * cubierta en `calcular-sla-habil-vence.service.spec.ts`) no tienen que
 * repetir el fixture. `mockRejectedValue` en el test de calendario roto lo
 * pisa explícitamente.
 */
function makeCollaborators() {
  const prioridadRepo = { findById: vi.fn() };
  const slaTicketWriteRepo = { setSlaVenceAt: vi.fn().mockResolvedValue(undefined) };
  const ticketRepo = { findById: vi.fn() };
  const estadoRepo = { findById: vi.fn() };
  const tipoTicketRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-preventivo-uuid') };
  const calculador = new CalcularSlaVenceService();
  const calculadorHabil = new CalcularSlaHabilVenceService();
  const calendarioRepo = { obtener: vi.fn().mockResolvedValue(CALENDARIO_L_A_V_9_A_18) };
  const feriadosRepo = { obtener: vi.fn().mockResolvedValue(new Set<string>()) };

  const useCase = new AplicarSlaUseCase(
    prioridadRepo as never,
    slaTicketWriteRepo as never,
    ticketRepo as never,
    estadoRepo as never,
    calculador,
    tipoTicketRepo as never,
    calculadorHabil,
    calendarioRepo as never,
    feriadosRepo as never,
  );

  return {
    useCase,
    prioridadRepo,
    slaTicketWriteRepo,
    ticketRepo,
    estadoRepo,
    tipoTicketRepo,
    calendarioRepo,
    feriadosRepo,
  };
}

describe('AplicarSlaUseCase', () => {
  describe('alCrear()', () => {
    it('S2: setea sla_vence_at = createdAt + slaHoras(prioridad con SLA activo)', async () => {
      const c = makeCollaborators();
      const createdAt = new Date('2026-08-06T10:00:00.000Z');
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ createdAt }));
      c.prioridadRepo.findById.mockResolvedValue(
        makePrioridadConSla({ slaHoras: 8, slaActivo: true }),
      );

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
        'ticket-uuid',
        new Date('2026-08-06T18:00:00.000Z'),
      );
    });

    it.each([
      ['prioridad inexistente (defensivo)', null],
      ['slaHoras null (sin SLA aplicable)', makePrioridadConSla({ slaHoras: null })],
      ['slaActivo false', makePrioridadConSla({ slaHoras: 8, slaActivo: false })],
    ])('S2: %s → sla_vence_at = null', async (_label, prioridad) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());
      c.prioridadRepo.findById.mockResolvedValue(prioridad);

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', null);
    });

    it('issue #135: ticket de tipo PREVENTIVO → sla_vence_at = null, SIN consultar la prioridad', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ tipoId: 'tipo-preventivo-uuid' }));

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', null);
      expect(c.prioridadRepo.findById).not.toHaveBeenCalled();
    });

    it('issue #135: con el catálogo sin PREVENTIVO sembrado, el SLA normal se sigue aplicando', async () => {
      const c = makeCollaborators();
      c.tipoTicketRepo.findIdByCodigo.mockResolvedValue(null);
      const createdAt = new Date('2026-08-06T10:00:00.000Z');
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ createdAt }));
      c.prioridadRepo.findById.mockResolvedValue(
        makePrioridadConSla({ slaHoras: 8, slaActivo: true }),
      );

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
        'ticket-uuid',
        new Date('2026-08-06T18:00:00.000Z'),
      );
    });
  });

  describe('alReprioritizar()', () => {
    it('S3: recalcula desde el createdAt ORIGINAL del ticket (ancla fija)', async () => {
      const c = makeCollaborators();
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ createdAt }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
          'estado-nuevo-uuid',
        ),
      );
      c.prioridadRepo.findById.mockResolvedValue(
        makePrioridadConSla({ slaHoras: 4, slaActivo: true }),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
        'ticket-uuid',
        new Date('2026-08-01T04:00:00.000Z'),
      );
    });

    it('S3: ticket en estado terminal (CERRADO) NO recalcula', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estadoId: 'estado-cerrado-uuid' }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 5, activo: true },
          'estado-cerrado-uuid',
        ),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });

    it('S3: ticket en estado terminal (CANCELADO) NO recalcula', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estadoId: 'estado-cancelado-uuid' }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 6, activo: true },
          'estado-cancelado-uuid',
        ),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });

    it('issue #135: ticket de tipo PREVENTIVO → sla_vence_at = null, tampoco re-aplica SLA', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ tipoId: 'tipo-preventivo-uuid' }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
          'estado-nuevo-uuid',
        ),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', null);
      expect(c.prioridadRepo.findById).not.toHaveBeenCalled();
    });

    it('ticket inexistente → no hace nada (defensivo, no lanza)', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(null);

      await expect(
        c.useCase.alReprioritizar({ ticketId: 'no-existe', prioridadId: 'prioridad-alta-uuid' }),
      ).resolves.toBeUndefined();
      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });
  });

  /**
   * sdd/sla-habil WU-3 — el discriminador de cohortes. Mismo `creadoEn`/
   * `horas` en todos los casos (viernes 2026-08-07 20:00 local + 4h) para
   * que la ÚNICA variable entre filas sea `ticket.slaRegla`:
   * - CORRIDO (24/7, `CalcularSlaVenceService`): 2026-08-08T03:00:00.000Z.
   * - HABIL (horas hábiles, cruza el fin de semana): 2026-08-10T16:00:00.000Z
   *   (mismo caso que la fila 3 de `calcular-sla-habil-vence.service.spec.ts`).
   * Los dos resultados son DISTINTOS — si el discriminador no enrutara al
   * calculador correcto, al menos una de las dos aserciones de abajo
   * fallaría.
   */
  describe('discriminador de cohortes (sla_regla) — sdd/sla-habil WU-3', () => {
    const CREADO_EN = new Date('2026-08-07T23:00:00.000Z'); // viernes 20:00 local
    const HORAS = 4;
    const VENCE_CORRIDO = new Date('2026-08-08T03:00:00.000Z');
    const VENCE_HABIL = new Date('2026-08-10T16:00:00.000Z');

    describe('alCrear()', () => {
      it('ticket HABIL usa CalcularSlaHabilVenceService (horas hábiles)', async () => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'HABIL' }),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

        expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', VENCE_HABIL);
        expect(c.calendarioRepo.obtener).toHaveBeenCalled();
      });

      it('DISCRIMINADOR — ticket CORRIDO usa CalcularSlaVenceService (24/7), NO el cálculo hábil', async () => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'CORRIDO' }),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

        expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
          'ticket-uuid',
          VENCE_CORRIDO,
        );
        // Un ticket CORRIDO nunca necesita el calendario laboral.
        expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
        expect(c.feriadosRepo.obtener).not.toHaveBeenCalled();
      });
    });

    describe('alReprioritizar()', () => {
      /**
       * EL TEST MÁS IMPORTANTE DEL WU: la fuga que se tapa. Antes de WU-3,
       * `alReprioritizar` recalculaba con la config VIGENTE en el momento de
       * repriorizar, sin importar la cohorte con la que nació el ticket —
       * un ticket viejo (CORRIDO) se hubiera recalculado con horas hábiles
       * la primera vez que alguien le cambiara la prioridad. Este test
       * prueba que NO pasa: sigue usando 24/7.
       */
      it('DISCRIMINADOR — un ticket CORRIDO NO se recalcula con la regla nueva al repriorizar', async () => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'CORRIDO' }),
        );
        c.estadoRepo.findById.mockResolvedValue(
          EstadoEntity.create(
            { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
            'estado-nuevo-uuid',
          ),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await c.useCase.alReprioritizar({
          ticketId: 'ticket-uuid',
          prioridadId: 'prioridad-critica-uuid',
        });

        expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
          'ticket-uuid',
          VENCE_CORRIDO,
        );
        expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalledWith(
          'ticket-uuid',
          VENCE_HABIL,
        );
        expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
      });

      it('un ticket HABIL sí se recalcula con horas hábiles al repriorizar', async () => {
        const c = makeCollaborators();
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'HABIL' }),
        );
        c.estadoRepo.findById.mockResolvedValue(
          EstadoEntity.create(
            { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
            'estado-nuevo-uuid',
          ),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await c.useCase.alReprioritizar({
          ticketId: 'ticket-uuid',
          prioridadId: 'prioridad-critica-uuid',
        });

        expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', VENCE_HABIL);
      });
    });

    describe('corte PREVENTIVO — se respeta en las dos cohortes', () => {
      it.each<[string, SlaRegla]>([
        ['CORRIDO', 'CORRIDO'],
        ['HABIL', 'HABIL'],
      ])(
        'ticket PREVENTIVO %s → sla_vence_at = null, sin tocar calendario ni prioridad',
        async (_label, slaRegla) => {
          const c = makeCollaborators();
          c.ticketRepo.findById.mockResolvedValue(
            makeTicket({ tipoId: 'tipo-preventivo-uuid', slaRegla }),
          );

          await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

          expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', null);
          expect(c.prioridadRepo.findById).not.toHaveBeenCalled();
          expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
          expect(c.feriadosRepo.obtener).not.toHaveBeenCalled();
        },
      );
    });

    /**
     * Requisito explícito del WU: si el calendario/feriados de MASTER falla
     * (puerto que lanza, WU-2), NO hay fallback silencioso a la regla vieja
     * (24/7). El error debe propagarse — `setSlaVenceAt` nunca se llama con
     * un vencimiento calculado por `CalcularSlaVenceService`. El listener
     * (`AplicarSlaListener`, log-and-swallow) es quien absorbe este throw en
     * producción; este use case NO debe degradar por su cuenta.
     */
    describe('calendario laboral roto — sin fallback silencioso a 24/7', () => {
      it('alCrear() propaga el error y NUNCA calcula con la regla vieja', async () => {
        const c = makeCollaborators();
        c.calendarioRepo.obtener.mockRejectedValue(
          new Error('calendario laboral incompleto (WU-2)'),
        );
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'HABIL' }),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await expect(
          c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' }),
        ).rejects.toThrow(/calendario laboral incompleto/);

        expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
      });

      it('alReprioritizar() propaga el error de feriados y NUNCA calcula con la regla vieja', async () => {
        const c = makeCollaborators();
        c.feriadosRepo.obtener.mockRejectedValue(new Error('feriados: fallo de conexión a MASTER'));
        c.ticketRepo.findById.mockResolvedValue(
          makeTicket({ createdAt: CREADO_EN, slaRegla: 'HABIL' }),
        );
        c.estadoRepo.findById.mockResolvedValue(
          EstadoEntity.create(
            { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
            'estado-nuevo-uuid',
          ),
        );
        c.prioridadRepo.findById.mockResolvedValue(
          makePrioridadConSla({ slaHoras: HORAS, slaActivo: true }),
        );

        await expect(
          c.useCase.alReprioritizar({
            ticketId: 'ticket-uuid',
            prioridadId: 'prioridad-critica-uuid',
          }),
        ).rejects.toThrow(/feriados/);

        expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
      });
    });
  });
});
