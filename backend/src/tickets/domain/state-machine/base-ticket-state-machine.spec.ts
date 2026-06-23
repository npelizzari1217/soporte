/**
 * Tests — BaseTicketStateMachine + TicketStateMachineFactory
 *
 * Tarea 3.B.1 (TEST → RED): verifica todas las transiciones válidas e inválidas
 * del diagrama base definido en la spec tickets-core, y que `puedeTransicionar()`
 * sea una función pura (sin side effects, mismo input → mismo output).
 *
 * Ref spec: [SPEC:tickets-core/Máquina de estados base, Transición inválida rechazada]
 */

import { BaseTicketStateMachine } from './base-ticket-state-machine';
import { TicketStateMachineFactory } from './ticket-state-machine.factory';
import { StateMachineContext } from './i-ticket-state-machine';

describe('BaseTicketStateMachine', () => {
  let machine: BaseTicketStateMachine;
  const ctx: StateMachineContext = {};

  beforeEach(() => {
    machine = new BaseTicketStateMachine();
  });

  // ─── Transiciones VÁLIDAS del diagrama base ─────────────────────────────

  describe('transiciones válidas (diagrama base)', () => {
    it('permite ABIERTO → EN_PROGRESO', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(true);
    });

    it('permite ABIERTO → CANCELADO', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'CANCELADO', ctx)).toBe(true);
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

  // ─── Estados TERMINALES — ninguna transición válida ─────────────────────

  describe('estados terminales: CERRADO y CANCELADO', () => {
    it('rechaza CERRADO → EN_PROGRESO', () => {
      expect(machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza CERRADO → ABIERTO', () => {
      expect(machine.puedeTransicionar('CERRADO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza CERRADO → RESUELTO', () => {
      expect(machine.puedeTransicionar('CERRADO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza CERRADO → CANCELADO', () => {
      expect(machine.puedeTransicionar('CERRADO', 'CANCELADO', ctx)).toBe(false);
    });

    it('rechaza CANCELADO → ABIERTO', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza CANCELADO → EN_PROGRESO', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza CANCELADO → RESUELTO', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza CANCELADO → CERRADO', () => {
      expect(machine.puedeTransicionar('CANCELADO', 'CERRADO', ctx)).toBe(false);
    });
  });

  // ─── Transiciones INVÁLIDAS (saltos no contemplados en el diagrama) ─────

  describe('transiciones inválidas (no están en el diagrama base)', () => {
    it('rechaza ABIERTO → RESUELTO (salto de estado)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza ABIERTO → CERRADO (salto de estado)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'CERRADO', ctx)).toBe(false);
    });

    it('rechaza EN_PROGRESO → ABIERTO (no hay vuelta atrás)', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza EN_PROGRESO → PENDIENTE_APROBACION (exclusivo de COMPRAS)', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'PENDIENTE_APROBACION', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → ABIERTO', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → CANCELADO', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'CANCELADO', ctx)).toBe(false);
    });

    it('rechaza estado desconocido como origen', () => {
      expect(machine.puedeTransicionar('ESTADO_INVENTADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza misma transición hacia el mismo estado', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'ABIERTO', ctx)).toBe(false);
    });
  });

  // ─── Pureza de función ────────────────────────────────────────────────────

  describe('pureza de función', () => {
    it('mismo input produce mismo output (determinismo)', () => {
      const result1 = machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx);
      const result2 = machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('no muta el contexto recibido', () => {
      const mutableCtx: StateMachineContext = { porcentajeAvance: 50 };
      const ctxSnapshot = { ...mutableCtx };
      machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', mutableCtx);
      expect(mutableCtx).toEqual(ctxSnapshot);
    });

    it('múltiples llamadas secuenciales no alteran el estado interno de la máquina', () => {
      // Ejecutar varias transiciones intercaladas…
      machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx);
      machine.puedeTransicionar('EN_PROGRESO', 'RESUELTO', ctx);
      machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx); // inválida
      // …y el resultado sigue siendo el mismo que en el primer call
      expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(true);
      expect(machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('el resultado no depende del orden de instanciación de la clase', () => {
      const machine2 = new BaseTicketStateMachine();
      expect(machine.puedeTransicionar('RESUELTO', 'CERRADO', ctx)).toBe(
        machine2.puedeTransicionar('RESUELTO', 'CERRADO', ctx),
      );
    });
  });
});

// ─── TicketStateMachineFactory ────────────────────────────────────────────────

describe('TicketStateMachineFactory', () => {
  let factory: TicketStateMachineFactory;
  const ctx: StateMachineContext = {};

  beforeEach(() => {
    factory = new TicketStateMachineFactory();
  });

  it('retorna BaseTicketStateMachine como fallback para tipo desconocido', () => {
    const machine = factory.resolve('TIPO_DESCONOCIDO');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna BaseTicketStateMachine como fallback para COMPRAS (no registrado aún — Fase 4)', () => {
    const machine = factory.resolve('COMPRAS');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna BaseTicketStateMachine como fallback para EDILICIA (no registrado aún — Fase 5)', () => {
    const machine = factory.resolve('EDILICIA');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna la máquina explícitamente registrada cuando existe', () => {
    const customMachine = new BaseTicketStateMachine();
    factory.register('SOPORTE', customMachine);
    expect(factory.resolve('SOPORTE')).toBe(customMachine);
  });

  it('no comparte registry entre instancias distintas de la factory', () => {
    const factory2 = new TicketStateMachineFactory();
    const customMachine = new BaseTicketStateMachine();
    factory.register('SOPORTE', customMachine);
    // factory2 no sabe nada de lo registrado en factory
    expect(factory2.resolve('SOPORTE')).not.toBe(customMachine);
    expect(factory2.resolve('SOPORTE')).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('la máquina fallback tiene transiciones base operativas', () => {
    const machine = factory.resolve('TIPO_DESCONOCIDO');
    expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(true);
    expect(machine.puedeTransicionar('CERRADO', 'EN_PROGRESO', ctx)).toBe(false);
  });
});
