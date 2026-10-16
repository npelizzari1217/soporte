/**
 * [UNIT] `planEstadoPorTareas` (odd/estado-por-tareas, S1-S4): qué arcos recorre el ticket cuando se
 * completa o descompleta una tarea, y si hay que asignarlo a quien completa.
 */
import { planEstadoPorTareas } from './estado-por-tareas.policy';

const situacion = (
  estadoActual: string,
  extra: Partial<{ quedanPendientes: boolean; tieneResponsable: boolean }> = {},
) => ({
  estadoActual,
  quedanPendientes: extra.quedanPendientes ?? true,
  tieneResponsable: extra.tieneResponsable ?? true,
});

describe('planEstadoPorTareas al COMPLETAR con tareas pendientes (S2)', () => {
  it('NUEVO recorre ASIGNADO y EN_PROCESO por arcos normales', () => {
    expect(planEstadoPorTareas('COMPLETAR', situacion('NUEVO'))).toEqual({
      asignarAlActor: false,
      arcos: [
        { hacia: 'ASIGNADO', correctivo: false },
        { hacia: 'EN_PROCESO', correctivo: false },
      ],
    });
  });

  it('ASIGNADO pasa solo a EN_PROCESO', () => {
    expect(planEstadoPorTareas('COMPLETAR', situacion('ASIGNADO')).arcos).toEqual([
      { hacia: 'EN_PROCESO', correctivo: false },
    ]);
  });

  it('en NUEVO sin responsable, quien completa pasa a ser el responsable', () => {
    const plan = planEstadoPorTareas('COMPLETAR', situacion('NUEVO', { tieneResponsable: false }));
    expect(plan.asignarAlActor).toBe(true);
    expect(plan.arcos.map((a) => a.hacia)).toEqual(['ASIGNADO', 'EN_PROCESO']);
  });

  it('en NUEVO con responsable no se reasigna', () => {
    expect(planEstadoPorTareas('COMPLETAR', situacion('NUEVO')).asignarAlActor).toBe(false);
  });

  it.each(['EN_PROCESO', 'ESPERANDO_CLIENTE', 'RESUELTO', 'CERRADO', 'CANCELADO'])(
    'en %s no cambia nada',
    (estado) => {
      expect(
        planEstadoPorTareas('COMPLETAR', situacion(estado, { tieneResponsable: false })),
      ).toEqual({
        asignarAlActor: false,
        arcos: [],
      });
    },
  );
});

describe('planEstadoPorTareas al COMPLETAR la última tarea (S3)', () => {
  const ultima = (estado: string, tieneResponsable = true) =>
    situacion(estado, { quedanPendientes: false, tieneResponsable });

  it('NUEVO recorre ASIGNADO, EN_PROCESO y RESUELTO', () => {
    expect(planEstadoPorTareas('COMPLETAR', ultima('NUEVO')).arcos.map((a) => a.hacia)).toEqual([
      'ASIGNADO',
      'EN_PROCESO',
      'RESUELTO',
    ]);
  });

  it('NUEVO sin responsable además asigna a quien completa', () => {
    expect(planEstadoPorTareas('COMPLETAR', ultima('NUEVO', false)).asignarAlActor).toBe(true);
  });

  it('ASIGNADO recorre EN_PROCESO y RESUELTO', () => {
    expect(planEstadoPorTareas('COMPLETAR', ultima('ASIGNADO')).arcos.map((a) => a.hacia)).toEqual([
      'EN_PROCESO',
      'RESUELTO',
    ]);
  });

  it.each(['EN_PROCESO', 'ESPERANDO_CLIENTE'])('%s pasa directo a RESUELTO', (estado) => {
    expect(planEstadoPorTareas('COMPLETAR', ultima(estado)).arcos).toEqual([
      { hacia: 'RESUELTO', correctivo: false },
    ]);
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])('en %s no cambia nada', (estado) => {
    expect(planEstadoPorTareas('COMPLETAR', ultima(estado, false))).toEqual({
      asignarAlActor: false,
      arcos: [],
    });
  });

  it('un código de estado desconocido no cambia nada (fail-safe)', () => {
    expect(planEstadoPorTareas('COMPLETAR', ultima('INEXISTENTE')).arcos).toEqual([]);
  });
});

describe('planEstadoPorTareas al DESCOMPLETAR (S4)', () => {
  it('RESUELTO vuelve a EN_PROCESO como salto correctivo', () => {
    expect(planEstadoPorTareas('DESCOMPLETAR', situacion('RESUELTO'))).toEqual({
      asignarAlActor: false,
      arcos: [{ hacia: 'EN_PROCESO', correctivo: true }],
    });
  });

  it.each(['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'ESPERANDO_CLIENTE', 'CERRADO', 'CANCELADO'])(
    'en %s no cambia nada, ni asigna',
    (estado) => {
      expect(
        planEstadoPorTareas('DESCOMPLETAR', situacion(estado, { tieneResponsable: false })),
      ).toEqual({ asignarAlActor: false, arcos: [] });
    },
  );
});
