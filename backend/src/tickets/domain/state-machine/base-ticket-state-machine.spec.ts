/**
 * Tests — BaseTicketStateMachine
 *
 * Grafo fijo de 6 estados (ADR-3, T9 de sdd/tickets-core/spec):
 *   NUEVO → {ASIGNADO, CANCELADO}
 *   ASIGNADO → {EN_PROCESO, CANCELADO}
 *   EN_PROCESO → {RESUELTO, CANCELADO}
 *   RESUELTO → {CERRADO}
 *   CERRADO, CANCELADO: terminales (sin arcos de salida)
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3. Tarea: T4.1.
 */

import { BaseTicketStateMachine } from './base-ticket-state-machine';
import { StateMachineContext } from './i-ticket-state-machine';

describe('BaseTicketStateMachine', () => {
  let machine: BaseTicketStateMachine;
  const ctx: StateMachineContext = {};

  beforeEach(() => {
    machine = new BaseTicketStateMachine();
  });

  describe('transiciones válidas — 7 arcos del diagrama (ADR-3)', () => {
    it.each([
      ['NUEVO', 'ASIGNADO'],
      ['NUEVO', 'CANCELADO'],
      ['ASIGNADO', 'EN_PROCESO'],
      ['ASIGNADO', 'CANCELADO'],
      ['EN_PROCESO', 'RESUELTO'],
      ['EN_PROCESO', 'CANCELADO'],
      ['RESUELTO', 'CERRADO'],
    ])('permite %s → %s', (desde, hacia) => {
      expect(machine.puedeTransicionar(desde, hacia, ctx)).toBe(true);
    });
  });

  describe('estados terminales: sin arcos de salida (ADR-3)', () => {
    it.each([
      ['CERRADO', 'NUEVO'],
      ['CERRADO', 'ASIGNADO'],
      ['CERRADO', 'EN_PROCESO'],
      ['CERRADO', 'RESUELTO'],
      ['CERRADO', 'CANCELADO'],
      ['CANCELADO', 'NUEVO'],
      ['CANCELADO', 'ASIGNADO'],
      ['CANCELADO', 'EN_PROCESO'],
      ['CANCELADO', 'RESUELTO'],
      ['CANCELADO', 'CERRADO'],
    ])('rechaza %s → %s (terminal, sin arcos de salida — sin reapertura)', (desde, hacia) => {
      expect(machine.puedeTransicionar(desde, hacia, ctx)).toBe(false);
    });
  });

  describe('transiciones inválidas adicionales', () => {
    it('rechaza NUEVO → EN_PROCESO (salto de estado)', () => {
      expect(machine.puedeTransicionar('NUEVO', 'EN_PROCESO', ctx)).toBe(false);
    });

    it('rechaza NUEVO → RESUELTO (salto de estado)', () => {
      expect(machine.puedeTransicionar('NUEVO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza ASIGNADO → RESUELTO (salto de estado)', () => {
      expect(machine.puedeTransicionar('ASIGNADO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza ASIGNADO → NUEVO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('ASIGNADO', 'NUEVO', ctx)).toBe(false);
    });

    it('rechaza EN_PROCESO → NUEVO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('EN_PROCESO', 'NUEVO', ctx)).toBe(false);
    });

    it('rechaza EN_PROCESO → ASIGNADO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('EN_PROCESO', 'ASIGNADO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → EN_PROCESO (sin reapertura — RESUELTO solo avanza a CERRADO)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROCESO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → ASIGNADO (sin reapertura)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'ASIGNADO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → NUEVO (sin reapertura)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'NUEVO', ctx)).toBe(false);
    });

    it('rechaza estado desconocido como origen', () => {
      expect(machine.puedeTransicionar('ESTADO_INVENTADO', 'ASIGNADO', ctx)).toBe(false);
    });

    it('rechaza estado desconocido como destino', () => {
      expect(machine.puedeTransicionar('NUEVO', 'ESTADO_INVENTADO', ctx)).toBe(false);
    });

    it('rechaza misma transición hacia el mismo estado', () => {
      expect(machine.puedeTransicionar('NUEVO', 'NUEVO', ctx)).toBe(false);
    });
  });

  describe('pureza de función', () => {
    it('mismo input produce mismo output (determinismo)', () => {
      const result1 = machine.puedeTransicionar('NUEVO', 'ASIGNADO', ctx);
      const result2 = machine.puedeTransicionar('NUEVO', 'ASIGNADO', ctx);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('no muta el contexto recibido', () => {
      const mutableCtx: StateMachineContext = { foo: 'bar' };
      const ctxSnapshot = { ...mutableCtx };
      machine.puedeTransicionar('NUEVO', 'ASIGNADO', mutableCtx);
      expect(mutableCtx).toEqual(ctxSnapshot);
    });

    it('múltiples llamadas secuenciales no alteran el estado interno de la máquina', () => {
      machine.puedeTransicionar('NUEVO', 'ASIGNADO', ctx);
      machine.puedeTransicionar('ASIGNADO', 'EN_PROCESO', ctx);
      machine.puedeTransicionar('RESUELTO', 'EN_PROCESO', ctx); // inválida
      expect(machine.puedeTransicionar('NUEVO', 'ASIGNADO', ctx)).toBe(true);
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROCESO', ctx)).toBe(false);
    });

    it('el resultado no depende del orden de instanciación de la clase', () => {
      const machine2 = new BaseTicketStateMachine();
      expect(machine.puedeTransicionar('ASIGNADO', 'EN_PROCESO', ctx)).toBe(
        machine2.puedeTransicionar('ASIGNADO', 'EN_PROCESO', ctx),
      );
    });
  });
});
