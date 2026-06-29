/**
 * Tests — BaseTicketStateMachine + TicketStateMachineFactory
 *
 * P1.T1 (RED → GREEN con P1.T2): verifica el nuevo grafo de 7 estados activos
 * y 3 congelados (legacy) definido en ADR-1.
 *
 * Nuevo diagrama (ADR-1):
 *   ABIERTO → {APROBADO, RECHAZADO}
 *   APROBADO → {EN_PROGRESO, RESUELTO, SUSPENDIDO, SIN_SOLUCION}
 *   EN_PROGRESO → {RESUELTO, SUSPENDIDO, SIN_SOLUCION}
 *   SUSPENDIDO → {EN_PROGRESO}
 *   Terminales activos: RESUELTO, SIN_SOLUCION, RECHAZADO (sin arcos de salida)
 *   Congelados legacy: CERRADO, CANCELADO, PENDIENTE_APROBACION (sin arcos de ningún tipo)
 *
 * Ref spec: Enmienda "Máquina de estados base" (tickets-core/spec.md), ADR-1
 * Change: tickets-maquina-estados-observaciones / PR1
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

  // ─── Los 10 arcos válidos del nuevo diagrama ─────────────────────────────

  describe('transiciones válidas — 10 arcos del nuevo diagrama (ADR-1)', () => {
    it.each([
      ['ABIERTO', 'APROBADO'],
      ['ABIERTO', 'RECHAZADO'],
      ['APROBADO', 'EN_PROGRESO'],
      ['APROBADO', 'RESUELTO'],
      ['APROBADO', 'SUSPENDIDO'],
      ['APROBADO', 'SIN_SOLUCION'],
      ['EN_PROGRESO', 'RESUELTO'],
      ['EN_PROGRESO', 'SUSPENDIDO'],
      ['EN_PROGRESO', 'SIN_SOLUCION'],
      ['SUSPENDIDO', 'EN_PROGRESO'],
    ])('permite %s → %s', (desde, hacia) => {
      expect(machine.puedeTransicionar(desde, hacia, ctx)).toBe(true);
    });
  });

  // ─── Arco legacy eliminado ───────────────────────────────────────────────

  describe('arco legacy ABIERTO → EN_PROGRESO eliminado (ADR-1)', () => {
    it('rechaza ABIERTO → EN_PROGRESO (arco legacy eliminado del nuevo diagrama)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(false);
    });
  });

  // ─── Estados TERMINALES activos (RESUELTO, SIN_SOLUCION, RECHAZADO) ─────

  describe('estados terminales activos: sin arcos de salida (ADR-1)', () => {
    it.each([
      ['RESUELTO', 'ABIERTO'],
      ['RESUELTO', 'EN_PROGRESO'],
      ['RESUELTO', 'APROBADO'],
      ['RESUELTO', 'SUSPENDIDO'],
      ['SIN_SOLUCION', 'ABIERTO'],
      ['SIN_SOLUCION', 'EN_PROGRESO'],
      ['SIN_SOLUCION', 'APROBADO'],
      ['RECHAZADO', 'ABIERTO'],
      ['RECHAZADO', 'EN_PROGRESO'],
      ['RECHAZADO', 'APROBADO'],
    ])('rechaza %s → %s (terminal activo, sin arcos de salida)', (desde, hacia) => {
      expect(machine.puedeTransicionar(desde, hacia, ctx)).toBe(false);
    });
  });

  // ─── Estados CONGELADOS legacy (CERRADO, CANCELADO, PENDIENTE_APROBACION) ──

  describe('estados congelados legacy: sin arcos de entrada ni salida (ADR-1)', () => {
    it.each([
      // Congelados como origen
      ['CERRADO', 'EN_PROGRESO'],
      ['CERRADO', 'ABIERTO'],
      ['CERRADO', 'RESUELTO'],
      ['CANCELADO', 'ABIERTO'],
      ['CANCELADO', 'EN_PROGRESO'],
      ['PENDIENTE_APROBACION', 'ABIERTO'],
      ['PENDIENTE_APROBACION', 'APROBADO'],
      ['PENDIENTE_APROBACION', 'RECHAZADO'],
      // Congelados como destino (no hay rutas que lleven a ellos)
      ['ABIERTO', 'CERRADO'],
      ['ABIERTO', 'CANCELADO'],
      ['ABIERTO', 'PENDIENTE_APROBACION'],
      ['EN_PROGRESO', 'CANCELADO'],
      ['EN_PROGRESO', 'CERRADO'],
    ])('rechaza %s → %s (estado congelado, sin arcos)', (desde, hacia) => {
      expect(machine.puedeTransicionar(desde, hacia, ctx)).toBe(false);
    });
  });

  // ─── Transiciones inválidas adicionales ─────────────────────────────────

  describe('transiciones inválidas (no están en el nuevo diagrama)', () => {
    it('rechaza ABIERTO → RESUELTO (salto de estado)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza ABIERTO → SUSPENDIDO (salto de estado)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'SUSPENDIDO', ctx)).toBe(false);
    });

    it('rechaza ABIERTO → SIN_SOLUCION (salto de estado)', () => {
      expect(machine.puedeTransicionar('ABIERTO', 'SIN_SOLUCION', ctx)).toBe(false);
    });

    it('rechaza EN_PROGRESO → ABIERTO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza EN_PROGRESO → APROBADO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('EN_PROGRESO', 'APROBADO', ctx)).toBe(false);
    });

    it('rechaza SUSPENDIDO → RESUELTO (solo puede volver a EN_PROGRESO)', () => {
      expect(machine.puedeTransicionar('SUSPENDIDO', 'RESUELTO', ctx)).toBe(false);
    });

    it('rechaza SUSPENDIDO → APROBADO', () => {
      expect(machine.puedeTransicionar('SUSPENDIDO', 'APROBADO', ctx)).toBe(false);
    });

    it('rechaza APROBADO → ABIERTO (sin retroceso)', () => {
      expect(machine.puedeTransicionar('APROBADO', 'ABIERTO', ctx)).toBe(false);
    });

    it('rechaza APROBADO → RECHAZADO (RECHAZADO solo acepta desde ABIERTO)', () => {
      expect(machine.puedeTransicionar('APROBADO', 'RECHAZADO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → EN_PROGRESO (reapertura eliminada — RESUELTO es terminal)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('rechaza RESUELTO → CERRADO (arc legacy eliminado)', () => {
      expect(machine.puedeTransicionar('RESUELTO', 'CERRADO', ctx)).toBe(false);
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
      const result1 = machine.puedeTransicionar('ABIERTO', 'APROBADO', ctx);
      const result2 = machine.puedeTransicionar('ABIERTO', 'APROBADO', ctx);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('no muta el contexto recibido', () => {
      const mutableCtx: StateMachineContext = { porcentajeAvance: 50 };
      const ctxSnapshot = { ...mutableCtx };
      machine.puedeTransicionar('ABIERTO', 'APROBADO', mutableCtx);
      expect(mutableCtx).toEqual(ctxSnapshot);
    });

    it('múltiples llamadas secuenciales no alteran el estado interno de la máquina', () => {
      machine.puedeTransicionar('ABIERTO', 'APROBADO', ctx);
      machine.puedeTransicionar('APROBADO', 'EN_PROGRESO', ctx);
      machine.puedeTransicionar('RESUELTO', 'EN_PROGRESO', ctx); // inválida
      expect(machine.puedeTransicionar('ABIERTO', 'APROBADO', ctx)).toBe(true);
      expect(machine.puedeTransicionar('RESUELTO', 'EN_PROGRESO', ctx)).toBe(false);
    });

    it('el resultado no depende del orden de instanciación de la clase', () => {
      const machine2 = new BaseTicketStateMachine();
      expect(machine.puedeTransicionar('APROBADO', 'EN_PROGRESO', ctx)).toBe(
        machine2.puedeTransicionar('APROBADO', 'EN_PROGRESO', ctx),
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

  it('retorna BaseTicketStateMachine como fallback para COMPRAS (no registrado aún)', () => {
    const machine = factory.resolve('COMPRAS');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna BaseTicketStateMachine como fallback para EDILICIA (no registrado aún)', () => {
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
    expect(factory2.resolve('SOPORTE')).not.toBe(customMachine);
    expect(factory2.resolve('SOPORTE')).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('la máquina fallback tiene transiciones del nuevo diagrama operativas (ADR-1)', () => {
    const machine = factory.resolve('TIPO_DESCONOCIDO');
    // Arco nuevo válido
    expect(machine.puedeTransicionar('ABIERTO', 'APROBADO', ctx)).toBe(true);
    // Arco legacy eliminado
    expect(machine.puedeTransicionar('ABIERTO', 'EN_PROGRESO', ctx)).toBe(false);
  });
});
