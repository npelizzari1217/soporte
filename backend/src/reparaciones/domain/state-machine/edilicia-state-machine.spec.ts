import { EdiliciaStateMachine } from './edilicia-state-machine';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import { BaseTicketStateMachine } from '../../../tickets/domain/state-machine/base-ticket-state-machine';
import { StateMachineContext } from '../../../tickets/domain/state-machine/i-ticket-state-machine';

describe('EdiliciaStateMachine', () => {
  let machine: EdiliciaStateMachine;

  beforeEach(() => {
    machine = new EdiliciaStateMachine();
  });

  // ─── Guard: EN_PROGRESO → RESUELTO requiere porcentajeAvance = 100 ─────────

  describe('guard EN_PROGRESO → RESUELTO', () => {
    it('retorna false cuando porcentajeAvance < 100 (guarda no satisfecha)', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 66.67 };
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(false);
    });

    it('retorna false cuando porcentajeAvance = 0', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 0 };
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(false);
    });

    it('retorna false cuando porcentajeAvance = 99.99', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 99.99 };
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(false);
    });

    it('retorna true cuando porcentajeAvance = 100', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 100 };
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(true);
    });

    it('retorna false cuando porcentajeAvance es undefined (guarda conservadora)', () => {
      const ctx: StateMachineContext = {};
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(false);
    });
  });

  // ─── Transiciones base heredadas (sin guarda adicional) ─────────────────────

  describe('transiciones válidas del flujo base (sin guarda de avance)', () => {
    const ctxCompleto: StateMachineContext = { porcentajeAvance: 100 };

    it('permite ABIERTO → EN_PROGRESO', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', {})).toBe(true);
    });

    it('permite ABIERTO → CANCELADO', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'CANCELADO', {})).toBe(true);
    });

    it('permite EN_PROGRESO → CANCELADO', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'CANCELADO', {})).toBe(true);
    });

    it('permite RESUELTO → CERRADO', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'CERRADO', ctxCompleto)).toBe(true);
    });

    it('permite RESUELTO → EN_PROGRESO (reapertura)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROGRESO', ctxCompleto)).toBe(true);
    });
  });

  // ─── Terminales ──────────────────────────────────────────────────────────────

  describe('estados terminales', () => {
    it('rechaza CERRADO → cualquier estado (terminal)', () => {
      expect(machine.puedeTransicionar('CERRADO', 'ABIERTO', {})).toBe(false);
      expect(machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', {})).toBe(false);
    });

    it('rechaza CANCELADO → cualquier estado (terminal)', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'ABIERTO', {})).toBe(false);
      expect(machine.puedeTransicionar('CANCELADO', 'RESUELTO', {})).toBe(false);
    });

    it('rechaza estados desconocidos como origen', () => {
      expect(machine.puedeTransicionar('ESTADO_INEXISTENTE', 'ABIERTO', {})).toBe(false);
    });
  });

  // ─── Completar última subtarea NO transiciona automáticamente ────────────────

  describe('completar última subtarea NO transiciona automáticamente', () => {
    it('la máquina de estados NO tiene método de transición automática — solo puedeTransicionar es puro', () => {
      // EdiliciaStateMachine es una función pura: no tiene efectos secundarios.
      // El use case CompletarSubtareaUseCase recalcula el porcentaje y lo persiste,
      // pero NO llama a ningún método de transición de estado.
      // La transición a RESUELTO es EXPLÍCITA (vía TransicionarEstadoUseCase).
      // Este test verifica que la máquina NO tiene un método autoTransicionar().
      const hasAutoTransition = 'autoTransicionar' in machine;
      expect(hasAutoTransition).toBe(false);
    });

    it('puedeTransicionar con avance=100 devuelve true, pero NO transiciona por sí mismo', () => {
      // Verificar que puedeTransicionar es solo una consulta, no una mutación.
      const ctx: StateMachineContext = { porcentajeAvance: 100 };
      const resultado = machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx);
      // La máquina solo evalúa — no cambia el estado del ticket
      expect(resultado).toBe(true);
      // El ctx no fue mutado
      expect(ctx.porcentajeAvance).toBe(100);
    });
  });

  // ─── Pureza de función ───────────────────────────────────────────────────────

  describe('pureza de función', () => {
    it('retorna el mismo resultado ante múltiples llamadas (determinismo)', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 100 };
      const r1 = machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx);
      const r2 = machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx);
      expect(r1).toBe(r2);
    });

    it('no muta el contexto', () => {
      const ctx: StateMachineContext = { porcentajeAvance: 50 };
      machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx);
      expect(ctx.porcentajeAvance).toBe(50);
    });

    it('dos instancias distintas son independientes', () => {
      const other = new EdiliciaStateMachine();
      const ctx: StateMachineContext = { porcentajeAvance: 100 };
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(
        other.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx),
      );
    });
  });

  // ─── Integración con TicketStateMachineFactory ───────────────────────────────

  describe('registro en TicketStateMachineFactory', () => {
    it('puede registrarse en la factory con código EDILICIA', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('EDILICIA', machine);
      const resolved = factory.resolve('EDILICIA');
      expect(resolved).toBe(machine);
    });

    it('la factory resuelve EdiliciaStateMachine para EDILICIA tras el registro', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('EDILICIA', machine);
      const resolved = factory.resolve('EDILICIA');
      // EdiliciaStateMachine bloquea EN_PROGRESO→RESUELTO con avance < 100
      expect(resolved.puedeTransicionar('EN_PROGRESO', 'RESUELTO', { porcentajeAvance: 50 })).toBe(
        false,
      );
      // Y permite con avance = 100
      expect(resolved.puedeTransicionar('EN_PROGRESO', 'RESUELTO', { porcentajeAvance: 100 })).toBe(
        true,
      );
    });

    it('el registro de EDILICIA no afecta la resolución de SOPORTE (BaseTicketStateMachine)', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('EDILICIA', machine);
      const soporteMachine = factory.resolve('SOPORTE');
      // SOPORTE usa BaseTicketStateMachine: EN_PROGRESO→RESUELTO sin guarda
      expect(soporteMachine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', {})).toBe(true);
    });

    it('sin registro, la factory devuelve el fallback (BaseTicketStateMachine) para EDILICIA', () => {
      const factory = new TicketStateMachineFactory();
      const fallback = factory.resolve('EDILICIA');
      expect(fallback).toBeInstanceOf(BaseTicketStateMachine);
    });
  });
});
