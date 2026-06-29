import { ComprasStateMachine } from './compras-state-machine';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import { BaseTicketStateMachine } from '../../../tickets/domain/state-machine/base-ticket-state-machine';
import { StateMachineContext } from '../../../tickets/domain/state-machine/i-ticket-state-machine';

describe('ComprasStateMachine', () => {
  let machine: ComprasStateMachine;
  const ctx: StateMachineContext = {};

  beforeEach(() => {
    machine = new ComprasStateMachine();
  });

  // ─── Transiciones VÁLIDAS del ciclo de aprobación ────────────────────────

  describe('transiciones válidas', () => {
    it('permite ABIERTO → PENDIENTE_APROBACION (envío a aprobación)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx)).toBe(true);
    });

    it('permite ABIERTO → CANCELADO (cancelación antes de envío)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'CANCELADO', ctx)).toBe(true);
    });

    it('permite PENDIENTE_APROBACION → APROBADO', () => {
      expect(machine.puedeTransicionar('PENDIENTE_APROBACION', 'APROBADO', ctx)).toBe(true);
    });

    it('permite PENDIENTE_APROBACION → RECHAZADO', () => {
      expect(machine.puedeTransicionar('PENDIENTE_APROBACION', 'RECHAZADO', ctx)).toBe(true);
    });

    it('permite PENDIENTE_APROBACION → CANCELADO (cancelación durante revisión)', () => {
      expect(machine.puedeTransicionar('PENDIENTE_APROBACION', 'CANCELADO', ctx)).toBe(true);
    });

    it('permite APROBADO → EN_PROGRESO (comienza ejecución de la compra)', () => {
      expect(machine.puedeTransicionar('APROBADO', 'EN_PROGRESO', ctx)).toBe(true);
    });

    it('permite RECHAZADO → CERRADO (cierre automático post-rechazo)', () => {
      expect(machine.puedeTransicionar('RECHAZADO', 'CERRADO', ctx)).toBe(true);
    });

    it('permite EN_PROGRESO → RESUELTO', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx)).toBe(true);
    });

    it('permite EN_PROGRESO → CANCELADO', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'CANCELADO', ctx)).toBe(true);
    });

    it('permite RESUELTO → CERRADO', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'CERRADO', ctx)).toBe(true);
    });

    it('permite RESUELTO → EN_PROGRESO (reapertura)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROGRESO', ctx)).toBe(true);
    });
  });

  // ─── Transiciones BLOQUEADAS / INVÁLIDAS ─────────────────────────────────

  describe('transiciones bloqueadas e inválidas', () => {
    it('BLOQUEA ABIERTO → EN_PROGRESO (ciclo de aprobación obligatorio)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza CERRADO → cualquier estado (terminal)', () => {
      expect(machine.puedeTransicionar('CERRADO', 'ABIERTO', ctx)).toBe(false);
      expect(machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza CANCELADO → cualquier estado (terminal)', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'ABIERTO', ctx)).toBe(false);
      expect(machine.puedeTransicionar('CANCELADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza PENDIENTE_APROBACION → ABIERTO (no se puede volver a ABIERTO)', () => {
      expect(machine.puedeTransicionar('PENDIENTE_APROBACION', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza APROBADO → RECHAZADO (la decisión de aprobación es final)', () => {
      expect(machine.puedeTransicionar('APROBADO', 'RECHAZADO', ctx)).toBe(false);
    });

    it('rechaza APROBADO → PENDIENTE_APROBACION (retroceso no permitido)', () => {
      expect(machine.puedeTransicionar('APROBADO', 'PENDIENTE_APROBACION', ctx)).toBe(false);
    });

    it('rechaza RECHAZADO → APROBADO (el rechazo es final)', () => {
      expect(machine.puedeTransicionar('RECHAZADO', 'APROBADO', ctx)).toBe(false);
    });

    it('rechaza estados desconocidos como origen', () => {
      expect(machine.puedeTransicionar('ESTADO_INEXISTENTE', 'ABIERTO', ctx)).toBe(false);
    });
  });

  // ─── Pureza de función ───────────────────────────────────────────────────

  describe('pureza de función', () => {
    it('retorna el mismo resultado ante múltiples llamadas (determinismo)', () => {
      const r1 = machine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx);
      const r2 = machine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx);
      expect(r1).toBe(r2);
    });

    it('no muta el contexto', () => {
      const ctxMutable: StateMachineContext = { porcentajeAvance: 50 };
      machine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctxMutable);
      expect(ctxMutable.porcentajeAvance).toBe(50);
    });

    it('dos instancias distintas son independientes', () => {
      const other = new ComprasStateMachine();
      expect(machine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx)).toBe(
        other.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx),
      );
    });
  });

  // ─── Integración con TicketStateMachineFactory ───────────────────────────

  describe('registro en TicketStateMachineFactory', () => {
    it('puede registrarse en la factory con código COMPRAS', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('COMPRAS', machine);
      const resolved = factory.resolve('COMPRAS');
      expect(resolved).toBe(machine);
    });

    it('la factory resuelve ComprasStateMachine para COMPRAS tras el registro', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('COMPRAS', machine);
      const resolved = factory.resolve('COMPRAS');
      // La ComprasStateMachine bloquea ABIERTO→EN_PROGRESO
      expect(resolved.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(false);
      // Pero permite ABIERTO→PENDIENTE_APROBACION
      expect(resolved.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx)).toBe(true);
    });

    it('el registro de COMPRAS no afecta la resolución de SOPORTE (sigue usando BaseTicketStateMachine)', () => {
      const factory = new TicketStateMachineFactory();
      factory.register('COMPRAS', machine);
      const soporteMachine = factory.resolve('SOPORTE');
      // SOPORTE usa BaseTicketStateMachine (ADR-1): ABIERTO→APROBADO es válido
      expect(soporteMachine.puedeTransicionar('ABIERTO', 'APROBADO', ctx)).toBe(true);
      // Y SOPORTE NO tiene PENDIENTE_APROBACION en su flujo
      expect(soporteMachine.puedeTransicionar('ABIERTO', 'PENDIENTE_APROBACION', ctx)).toBe(false);
    });

    it('sin registro, la factory devuelve el fallback (BaseTicketStateMachine) para COMPRAS', () => {
      const factory = new TicketStateMachineFactory();
      // Sin registrar COMPRAS, el fallback es la base
      const fallback = factory.resolve('COMPRAS');
      expect(fallback).toBeInstanceOf(BaseTicketStateMachine);
    });
  });
});
