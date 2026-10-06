/**
 * Tests — TicketStateMachineFactory
 *
 * Ref spec: sdd/tickets-core/spec T9. Ref design: ADR-3. Tarea: T4.2.
 */

import { BaseTicketStateMachine } from './base-ticket-state-machine';
import { TicketStateMachineFactory } from './ticket-state-machine.factory';
import { StateMachineContext } from './i-ticket-state-machine';

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

  it('retorna BaseTicketStateMachine como fallback para COMPRAS (no registrado aún, Fase 4)', () => {
    const machine = factory.resolve('COMPRAS');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna BaseTicketStateMachine como fallback para EDILICIA (no registrado aún, Fase 5)', () => {
    const machine = factory.resolve('EDILICIA');
    expect(machine).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('retorna la máquina explícitamente registrada cuando existe', () => {
    const customMachine = new BaseTicketStateMachine();
    factory.register('SOPORTE', customMachine);
    expect(factory.resolve('SOPORTE')).toBe(customMachine);
  });

  it('no comparte registry entre instancias distintas de la factory (aislamiento)', () => {
    const factory2 = new TicketStateMachineFactory();
    const customMachine = new BaseTicketStateMachine();
    factory.register('SOPORTE', customMachine);
    expect(factory2.resolve('SOPORTE')).not.toBe(customMachine);
    expect(factory2.resolve('SOPORTE')).toBeInstanceOf(BaseTicketStateMachine);
  });

  it('permite override de la máquina fallback vía constructor', () => {
    const customFallback = new BaseTicketStateMachine();
    const customFactory = new TicketStateMachineFactory(customFallback);
    expect(customFactory.resolve('TIPO_DESCONOCIDO')).toBe(customFallback);
  });

  it('la máquina fallback tiene el grafo de 7 estados operativo (ADR-3)', () => {
    const machine = factory.resolve('TIPO_DESCONOCIDO');
    expect(machine.puedeTransicionar('NUEVO', 'ASIGNADO', ctx)).toBe(true);
    expect(machine.puedeTransicionar('CERRADO', 'NUEVO', ctx)).toBe(false);
  });

  it('register sobrescribe una máquina previamente registrada para el mismo código', () => {
    const machineA = new BaseTicketStateMachine();
    const machineB = new BaseTicketStateMachine();
    factory.register('SOPORTE', machineA);
    factory.register('SOPORTE', machineB);
    expect(factory.resolve('SOPORTE')).toBe(machineB);
  });
});
