/**
 * [UNIT] operacionesDeApertura — ADR-3 (sdd/asignacion-automatica-por-tipo, A3).
 * Los casos buscan por tipo de operación, no por posición.
 */
import {
  AUTOR_SISTEMA,
  DESCRIPCION_ASIGNACION_POR_REGLA,
} from '../../domain/constants/autor-sistema.constants';
import { operacionesDeApertura } from './operaciones-apertura';

const BASE = {
  ticketId: 'ticket-1',
  tipoId: 'tipo-1',
  tipoOperacionAperturaId: 'op-cambio-estado',
  autorId: 'autor-humano',
};

const ASIGNACION = {
  asignadoId: 'u-responsable',
  estadoAsignadoId: 'estado-asignado',
  tipoOperacionAsignacionId: 'op-asignacion',
};

describe('operacionesDeApertura', () => {
  it('sin asignación → solo la apertura, desde null hacia el estado inicial', () => {
    const ops = operacionesDeApertura({
      ...BASE,
      estadoInicialId: 'estado-nuevo',
      asignacion: null,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0].tipoOperacionId).toBe('op-cambio-estado');
    expect(ops[0].estadoAnteriorId).toBeNull();
    expect(ops[0].estadoNuevoId).toBe('estado-nuevo');
    expect(ops[0].autorId).toBe('autor-humano');
  });

  it('con asignación → apertura null→ASIGNADO con el autor recibido, y ASIGNACION del sistema', () => {
    const ops = operacionesDeApertura({
      ...BASE,
      estadoInicialId: 'estado-asignado',
      asignacion: ASIGNACION,
    });

    expect(ops).toHaveLength(2);
    const apertura = ops.find((o) => o.tipoOperacionId === 'op-cambio-estado');
    const asignacion = ops.find((o) => o.tipoOperacionId === 'op-asignacion');

    expect(apertura?.estadoAnteriorId).toBeNull();
    expect(apertura?.estadoNuevoId).toBe('estado-asignado');
    expect(apertura?.autorId).toBe('autor-humano');

    expect(asignacion?.autorId).toBe(AUTOR_SISTEMA);
    expect(asignacion?.esInterno).toBe(false);
    expect(asignacion?.descripcion).toBe(DESCRIPCION_ASIGNACION_POR_REGLA);
    expect(asignacion?.metadata).toEqual({
      origen: 'REGLA_TIPO',
      tipoId: 'tipo-1',
      asignadoId: 'u-responsable',
    });
    expect(asignacion?.ticketId).toBe('ticket-1');
  });

  it('la apertura conserva cualquier autor recibido (p. ej. el centinela del formulario público)', () => {
    const ops = operacionesDeApertura({
      ...BASE,
      autorId: '00000000-0000-0000-0000-000000000000',
      estadoInicialId: 'estado-asignado',
      asignacion: ASIGNACION,
    });

    const apertura = ops.find((o) => o.tipoOperacionId === 'op-cambio-estado');
    expect(apertura?.autorId).toBe('00000000-0000-0000-0000-000000000000');
  });
});
